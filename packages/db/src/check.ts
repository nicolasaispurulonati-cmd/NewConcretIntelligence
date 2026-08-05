/**
 * Diagnóstico de la conexión.
 *
 * Antes de migrar conviene saber tres cosas: si se llega a la base, si la
 * versión alcanza, y si están las extensiones. Cuando algo falla, este script
 * dice qué falta y cómo resolverlo — no devuelve un código de error.
 */

import postgres from 'postgres';

import { parseConnectionUrl } from './client.js';
import { loadEnv, requireDatabaseUrl } from './env.js';

const REQUIRED_EXTENSIONS = ['vector', 'pg_trgm', 'unaccent'] as const;
const MINIMUM_MAJOR_VERSION = 16;

async function main(): Promise<void> {
  const envPath = loadEnv();
  console.log(envPath ? `Configuración leída de ${envPath}` : 'Sin archivo .env: se usan las variables del entorno.');

  const conexion = parseConnectionUrl(requireDatabaseUrl());
  const client = postgres(conexion.url, {
    max: 1,
    ...(conexion.ssl ? { ssl: 'require' as const } : {}),
    ...(conexion.pooler ? { prepare: false } : {}),
  });

  try {
    const [server] = await client<{ version: string; current_database: string }[]>`
      select version() as version, current_database() as current_database
    `;

    const major = Number(/PostgreSQL (\d+)/.exec(server?.version ?? '')?.[1] ?? 0);

    console.log(`\nConexión establecida con la base "${server?.current_database}".`);
    console.log(`PostgreSQL ${major}.`);

    // La base embebida se retiró del proyecto: corría otra versión que la de
    // producción y devolvía resultados incorrectos bajo carga. Si algo la
    // levantó de nuevo, conviene decirlo acá antes de que alguien valide el
    // sistema contra ella sin darse cuenta. Ver D-010.
    if (/PGlite/i.test(server?.version ?? '')) {
      console.log(
        [
          '',
          'Aviso: la base que responde es PGlite, no PostgreSQL.',
          '',
          'El proyecto dejó de usarla. Corre una versión distinta de la de',
          'producción y devolvió resultados incorrectos bajo carga.',
          '',
          'Levantá la de siempre con: npm run db:local',
        ].join('\n'),
      );
    }

    // Sobre un servidor real, un pool de 1 obliga a que todas las consultas se
    // hagan de a una, y la aplicación vuelve a bloquear las migraciones aunque
    // el servidor las admita. Es un residuo de configuración que produce
    // exactamente el síntoma que se creía resuelto.
    const poolMax = Number(process.env['NCI_DB_POOL_MAX']);
    if (Number.isFinite(poolMax) && poolMax === 1) {
      console.log(
        [
          '',
          'Aviso: NCI_DB_POOL_MAX está en 1.',
          '',
          'Con una sola conexión, la aplicación no puede consultar en paralelo',
          'y una migración la deja esperando.',
          '',
          'Quitá NCI_DB_POOL_MAX y NCI_DB_IDLE_TIMEOUT del .env.',
        ].join('\n'),
      );
    }

    if (major < MINIMUM_MAJOR_VERSION) {
      console.log(
        `\nLa versión es anterior a la ${MINIMUM_MAJOR_VERSION}, que es la mínima que usa el esquema.`,
      );
      console.log('Conviene actualizar antes de migrar, para no arrastrar un esquema incompleto.');
      process.exitCode = 1;
      return;
    }

    // Se pregunta por las disponibles, no por las instaladas: la migración las
    // instala sola, pero sólo puede hacerlo si el servidor las ofrece.
    const available = await client<{ name: string; installed_version: string | null }[]>`
      select name, installed_version
      from pg_available_extensions
      where name in ${client(REQUIRED_EXTENSIONS as unknown as string[])}
    `;

    const found = new Map(available.map((row) => [row.name, row.installed_version]));
    const missing: string[] = [];

    console.log('\nExtensiones:');
    for (const extension of REQUIRED_EXTENSIONS) {
      if (!found.has(extension)) {
        console.log(`  ${extension} — no está disponible en este servidor`);
        missing.push(extension);
      } else {
        const installed = found.get(extension);
        console.log(`  ${extension} — ${installed ? `instalada (${installed})` : 'disponible, se instala al migrar'}`);
      }
    }

    if (missing.length > 0) {
      console.log(
        `\nFaltan extensiones que el esquema necesita: ${missing.join(', ')}.`,
      );
      console.log(
        missing.includes('vector')
          ? 'Sin pgvector no hay búsqueda semántica y la tabla de entidades no se puede crear.\nCasi todos los PostgreSQL gestionados la ofrecen; si el tuyo no, conviene cambiar de proveedor antes de seguir.'
          : 'Se instalan del lado del servidor. Consultá con quien administra la base.',
      );
      process.exitCode = 1;
      return;
    }

    const [tables] = await client<{ total: number }[]>`
      select count(*)::int as total
      from information_schema.tables
      where table_schema = 'public'
    `;

    console.log(
      tables && tables.total > 0
        ? `\nLa base ya tiene ${tables.total} tablas. Correr las migraciones es seguro: sólo aplica lo que falta.`
        : '\nLa base está vacía. El siguiente paso es: npm run db:migrate',
    );
  } finally {
    await client.end();
  }
}

/**
 * Un texto en el que buscar la causa.
 *
 * Los fallos de red llegan como `AggregateError` con el mensaje vacío y la
 * causa real en `code` o en los errores anidados. Buscar sólo en `.message`
 * deja al usuario mirando una línea en blanco.
 */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const parts = [error.message, (error as { code?: string }).code ?? ''];

  if (error instanceof AggregateError) {
    parts.push(...error.errors.map((nested: unknown) => describeFailure(nested)));
  }
  if (error.cause) {
    parts.push(describeFailure(error.cause));
  }

  return parts.filter(Boolean).join(' · ');
}

try {
  await main();
} catch (error) {
  const message = describeFailure(error);

  if (message.includes('ECONNREFUSED')) {
    console.error(
      [
        '\nNo se pudo establecer la conexión: el servidor rechazó el intento.',
        '',
        'Suele deberse a una de estas tres cosas:',
        '  · La base no está corriendo.',
        '  · El host o el puerto de DATABASE_URL no son los correctos.',
        '  · Un firewall bloquea la salida hacia ese puerto.',
      ].join('\n'),
    );
  } else if (message.includes('password authentication failed')) {
    console.error('\nEl usuario o la contraseña de DATABASE_URL no son correctos.');
  } else if (message.includes('does not exist')) {
    console.error('\nLa base indicada en DATABASE_URL no existe en ese servidor.');
  } else {
    console.error(`\n${message}`);
  }

  process.exit(1);
}
