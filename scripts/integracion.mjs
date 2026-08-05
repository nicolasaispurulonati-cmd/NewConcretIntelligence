/**
 * La batería de integración, contra el motor que usa producción.
 *
 * Antes de correr nada verifica contra qué se va a validar. El motivo es un
 * incidente real: el mismo `DATABASE_URL` apuntó a dos motores distintos
 * —PostgreSQL 17 en un contenedor y PostgreSQL 18 embebido en WebAssembly—
 * según cuál estuviera escuchando el puerto, y el tablero pasó de "125 en
 * verde" a "10 en rojo" sin que cambiara una línea de código.
 *
 * Retirar el motor embebido no cerró el problema: la batería se conecta a un
 * puerto y confía en lo que responde. Un PostgreSQL viejo instalado en la
 * máquina hace años contesta igual, y las pruebas pasan en verde contra un
 * sistema que no es el nuestro.
 *
 * De ahí las cuatro comprobaciones de abajo. Si alguna no coincide, esto falla
 * y explica qué esperaba, qué encontró y cómo levantar el entorno correcto. No
 * se degrada a otra cosa: la degradación silenciosa es el mecanismo que produjo
 * el problema, y un error que sólo dice "no coincide" lo reproduce.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * La versión mayor que corre en producción.
 *
 * Una prueba que corre contra otra versión valida otro sistema. El número está
 * acá, en docker-compose.yml y en el workflow de verificación; los tres tienen
 * que decir lo mismo.
 */
const VERSION_ESPERADA = 17;

/**
 * La versión mínima de pgvector.
 *
 * El esquema declara una columna `vector` y un índice HNSW, que existe desde
 * la 0.5. Se exige presencia y piso, no una versión exacta: el proveedor
 * gestionado actualiza la extensión por su cuenta.
 */
const PGVECTOR_MINIMO = '0.5.0';

/**
 * El marcador que distingue una base de pruebas de cualquier otra.
 *
 * Es un parámetro del servidor, no un dato: sobrevive a que se borre la base,
 * la aplicación no puede escribirlo, y un PostgreSQL gestionado no lo trae.
 * Lo pone docker-compose.yml en desarrollo y un paso del workflow en CI.
 */
const MARCADOR = { parametro: 'nci.entorno', valor: 'pruebas' };

const LEVANTAR = ['Para levantar el entorno correcto:', '', '  npm run db:local', ''];

function abortar(titulo, detalle) {
  console.error(`\n${titulo}\n`);
  console.error(detalle.filter((linea) => linea !== null).join('\n'));
  process.exit(1);
}

/** Compara versiones de la forma `0.8.6`. */
function menorQue(version, minimo) {
  const a = version.split('.').map(Number);
  const b = minimo.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const izq = a[i] ?? 0;
    const der = b[i] ?? 0;
    if (izq !== der) return izq < der;
  }
  return false;
}

/** Las migraciones que el repositorio declara, en orden. */
function migracionesDeclaradas() {
  const journal = JSON.parse(
    readFileSync(join(raiz, 'packages', 'db', 'migrations', 'meta', '_journal.json'), 'utf8'),
  );
  return journal.entries.map((entrada) => entrada.tag);
}

const env = join(raiz, '.env');
if (existsSync(env)) process.loadEnvFile(env);

const url = process.env['DATABASE_URL']?.trim();
if (!url) {
  abortar('No hay conexión a la base configurada.', [
    'Esperaba: DATABASE_URL con una cadena de conexión.',
    'Encontré: la variable vacía o sin definir.',
    '',
    'Copiá .env.example a .env y completá DATABASE_URL.',
    '',
    ...LEVANTAR,
  ]);
}

const { default: postgres } = await import('postgres');
const sql = postgres(url, { max: 1, connect_timeout: 10 });

/** Cierra la conexión antes de abortar, para no dejar el proceso colgado. */
async function abortarCerrando(titulo, detalle) {
  await sql.end().catch(() => {});
  abortar(titulo, detalle);
}

// ── 1. El motor ──────────────────────────────────────────────────────────
let version;
try {
  [{ version }] = await sql`select version()`;
} catch (error) {
  await abortarCerrando('No se pudo conectar a la base de datos.', [
    `Encontré: ${String(error instanceof Error ? error.message : error)}`,
    '',
    'La batería de integración corre contra PostgreSQL real y no se degrada a',
    'otra cosa.',
    '',
    ...LEVANTAR,
    'Necesita Docker Desktop abierto. Si el motor está iniciando, esperá a que',
    'el ícono deje de indicarlo y volvé a intentar.',
  ]);
}

const motor = version.split(',')[0];
const mayor = Number(/PostgreSQL (\d+)/.exec(version)?.[1] ?? 0);

if (/PGlite/i.test(version)) {
  await abortarCerrando('La base que responde es la embebida, no PostgreSQL.', [
    `Esperaba: PostgreSQL ${VERSION_ESPERADA}, el mismo que producción.`,
    `Encontré: ${motor}`,
    '',
    'PGlite devolvió resultados incorrectos bajo carga y corre una versión',
    'distinta de la de producción. Ver D-010.',
    '',
    ...LEVANTAR,
  ]);
}

if (mayor !== VERSION_ESPERADA) {
  await abortarCerrando(`La base no es la versión de producción.`, [
    `Esperaba: PostgreSQL ${VERSION_ESPERADA}.`,
    `Encontré: ${motor}`,
    '',
    'Una prueba que corre contra otra versión valida otro sistema. Suele pasar',
    'cuando un PostgreSQL instalado en la máquina toma el puerto antes que el',
    'contenedor: revisá qué está escuchando en 5432.',
    '',
    ...LEVANTAR,
  ]);
}

// ── 2. pgvector ──────────────────────────────────────────────────────────
const [vector] = await sql`select extversion from pg_extension where extname = 'vector'`;

if (!vector) {
  await abortarCerrando('La base no tiene pgvector instalada.', [
    'Esperaba: la extensión vector.',
    'Encontré: no está instalada.',
    '',
    'El esquema declara una columna vector(1024) y un índice HNSW: sin la',
    'extensión, las migraciones no se pueden aplicar.',
    '',
    ...LEVANTAR,
  ]);
}

if (menorQue(vector.extversion, PGVECTOR_MINIMO)) {
  await abortarCerrando('La versión de pgvector es anterior a la que usa el esquema.', [
    `Esperaba: pgvector ${PGVECTOR_MINIMO} o superior.`,
    `Encontré: ${vector.extversion}`,
    '',
    'El índice HNSW existe desde la 0.5.',
    '',
    ...LEVANTAR,
  ]);
}

// ── 3. El marcador de base de pruebas ────────────────────────────────────
const [marcador] = await sql`select current_setting(${MARCADOR.parametro}, true) as valor`;

if (marcador?.valor !== MARCADOR.valor) {
  await abortarCerrando('Esta base no está declarada como base de pruebas.', [
    `Esperaba: el parámetro ${MARCADOR.parametro} en "${MARCADOR.valor}".`,
    `Encontré: ${marcador?.valor ? `"${marcador.valor}"` : 'sin definir'}.`,
    '',
    'Las pruebas de integración crean y borran datos. Contra una base con',
    'información real eso es destructivo, y no hay forma de deshacerlo.',
    '',
    'La base de docker-compose.yml trae el marcador puesto. Si estás corriendo',
    'contra otra, es probable que sea justamente la que no querés tocar.',
    '',
    ...LEVANTAR,
  ]);
}

// ── 4. El esquema al día ─────────────────────────────────────────────────
const declaradas = migracionesDeclaradas();
let aplicadas = 0;

try {
  [{ aplicadas }] = await sql`
    select count(*)::int as aplicadas from drizzle.__drizzle_migrations
  `;
} catch {
  await abortarCerrando('La base no tiene el esquema aplicado.', [
    `Esperaba: ${declaradas.length} migraciones aplicadas.`,
    'Encontré: ni siquiera la tabla que las registra.',
    '',
    'Aplicá el esquema con:',
    '',
    '  npm run db:migrate',
    '',
  ]);
}

if (aplicadas !== declaradas.length) {
  const pendientes = declaradas.slice(aplicadas);
  await abortarCerrando('El esquema de la base está atrasado.', [
    `Esperaba: ${declaradas.length} migraciones aplicadas.`,
    `Encontré: ${aplicadas}.`,
    '',
    pendientes.length > 0 ? `Pendientes: ${pendientes.join(', ')}` : null,
    pendientes.length > 0 ? '' : null,
    'Una prueba contra un esquema viejo falla por columnas que no existen y',
    'esconde el defecto real. Ponelo al día con:',
    '',
    '  npm run db:migrate',
    '',
  ]);
}

await sql.end().catch(() => {});

console.log(
  [
    `Integración contra ${motor}`,
    `  pgvector ${vector.extversion}`,
    `  ${MARCADOR.parametro} = ${marcador.valor}`,
    `  ${aplicadas} de ${declaradas.length} migraciones aplicadas`,
    '',
  ].join('\n'),
);

const proceso = spawnSync('node scripts/pruebas.mjs test:integracion', {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
});

process.exitCode = proceso.status ?? 1;
