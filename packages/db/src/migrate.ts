/**
 * Aplica el esquema en tres pasos, en este orden y no en otro:
 *
 *   1. Extensiones — `entities` declara una columna `vector`, que no existe
 *      hasta que pgvector esté instalado.
 *   2. Migraciones de Drizzle — las tablas.
 *   3. Búsqueda e inmutabilidad — triggers e índices que Drizzle no expresa.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { parseConnectionUrl } from './client.js';
import { loadEnv, requireDatabaseUrl } from './env.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');

/**
 * La conexión que usan las migraciones.
 *
 * Prefiere el endpoint directo cuando está declarado. Un pooler en modo
 * transacción puede repartir cada sentencia en una sesión distinta del
 * servidor, y una migración necesita que el lock que toma al empezar siga vivo
 * cuando termina. En desarrollo no existe esa variable y se usa la de siempre.
 */
function connectionUrl(): string {
  loadEnv();

  const directa = process.env['DATABASE_URL_DIRECTA']?.trim();
  if (directa) {
    console.log('Migrando por la conexión directa (DATABASE_URL_DIRECTA).');
    return directa;
  }

  return requireDatabaseUrl();
}

async function main(): Promise<void> {
  const conexion = parseConnectionUrl(connectionUrl());

  // `max: 1` porque las migraciones deben correr en una sola conexión: crear
  // extensiones y tipos en paralelo genera bloqueos entre sesiones.
  const client = postgres(conexion.url, {
    max: 1,
    ...(conexion.ssl ? { ssl: 'require' as const } : {}),
    ...(conexion.pooler ? { prepare: false } : {}),
  });

  try {
    const extensions = await readFile(join(packageRoot, 'sql', '00-extensions.sql'), 'utf8');
    await client.unsafe(extensions);
    console.log('Extensiones aplicadas: vector, pg_trgm, unaccent.');

    await migrate(drizzle(client), { migrationsFolder: join(packageRoot, 'migrations') });
    console.log('Migraciones aplicadas.');

    const search = await readFile(join(packageRoot, 'sql', '99-search.sql'), 'utf8');
    await client.unsafe(search);
    console.log('Búsqueda, triggers e índices aplicados.');
  } finally {
    await client.end();
  }
}

await main();
