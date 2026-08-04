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

import { requireDatabaseUrl } from './env.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');

async function main(): Promise<void> {
  const url = requireDatabaseUrl();

  // `max: 1` porque las migraciones deben correr en una sola conexión: crear
  // extensiones y tipos en paralelo genera bloqueos entre sesiones.
  const client = postgres(url, { max: 1 });

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
