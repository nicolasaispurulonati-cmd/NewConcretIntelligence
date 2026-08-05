/**
 * La batería de integración, contra el motor que usa producción.
 *
 * Antes de correr nada verifica contra qué se va a validar. El motivo es un
 * incidente real: el mismo `DATABASE_URL` apuntó a dos motores distintos
 * —PostgreSQL 17 en un contenedor y PostgreSQL 18 embebido en WebAssembly—
 * según cuál estuviera escuchando el puerto, y el tablero pasó de "125 en
 * verde" a "10 en rojo" sin que cambiara una línea de código.
 *
 * De ahí la regla: si el entorno no es el correcto, esto falla y explica cómo
 * levantarlo. No se degrada a otra cosa. La degradación silenciosa es el
 * mecanismo que produjo el problema.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

function abortar(titulo, detalle) {
  console.error(`\n${titulo}\n`);
  console.error(detalle.join('\n'));
  process.exit(1);
}

const env = join(raiz, '.env');
if (existsSync(env)) process.loadEnvFile(env);

const url = process.env['DATABASE_URL']?.trim();
if (!url) {
  abortar('No hay conexión a la base configurada.', [
    'La batería de integración necesita un PostgreSQL real. Copiá .env.example',
    'a .env y completá DATABASE_URL.',
  ]);
}

const { default: postgres } = await import('postgres');
const sql = postgres(url, { max: 1, connect_timeout: 10 });

let version;
try {
  [{ version }] = await sql`select version()`;
} catch (error) {
  await sql.end().catch(() => {});
  abortar('No se pudo conectar a la base de datos.', [
    String(error instanceof Error ? error.message : error),
    '',
    'La batería de integración corre contra PostgreSQL real y no se degrada a',
    'otra cosa. Para levantarlo:',
    '',
    '  npm run db:local',
    '',
    'Necesita Docker Desktop abierto. Si el motor está iniciando, esperá a que',
    'el ícono deje de indicarlo y volvé a intentar.',
  ]);
}

await sql.end().catch(() => {});

const mayor = Number(/PostgreSQL (\d+)/.exec(version)?.[1] ?? 0);

if (/PGlite/i.test(version)) {
  abortar('La base que responde es la embebida, no PostgreSQL.', [
    `Reportó: ${version.split(',')[0]}`,
    '',
    'PGlite devolvió resultados incorrectos bajo carga y corre una versión',
    'distinta de la de producción. Ver D-010.',
    '',
    '  npm run db:local',
  ]);
}

if (mayor !== VERSION_ESPERADA) {
  abortar(`La base responde PostgreSQL ${mayor} y producción usa ${VERSION_ESPERADA}.`, [
    `Reportó: ${version.split(',')[0]}`,
    '',
    'Una prueba que corre contra otra versión valida otro sistema. Alineá la',
    'imagen de docker-compose.yml o la versión de producción, pero no las dejes',
    'distintas.',
  ]);
}

console.log(`Integración contra ${version.split(',')[0]}\n`);

const proceso = spawnSync('node scripts/pruebas.mjs test:integracion', {
  cwd: raiz,
  stdio: 'inherit',
  shell: true,
});

process.exitCode = proceso.status ?? 1;
