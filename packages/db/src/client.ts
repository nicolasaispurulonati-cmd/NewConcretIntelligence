import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { requireDatabaseUrl } from './env.js';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export interface DatabaseOptions {
  readonly url: string;
  /** Conexiones simultáneas. En serverless conviene 1 por instancia. */
  readonly max?: number;
  readonly ssl?: boolean;
}

/**
 * Conexiones simultáneas del pool.
 *
 * El motor consulta en paralelo cuando puede — la vista 360 de una entidad pide
 * relaciones, actividad y conteos a la vez. Contra un PostgreSQL de verdad eso
 * es lo correcto. La base local embebida, en cambio, atiende una conexión por
 * vez, y hay que ponerlo en 1 para que el pool encole en lugar de abrir otra.
 *
 * No se deduce del host: una configuración que adivina es una que sorprende.
 */
function poolSize(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const configured = Number(process.env['NCI_DB_POOL_MAX']);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
}

/**
 * Segundos que una conexión puede quedar ociosa en el pool antes de cerrarse.
 *
 * Contra un PostgreSQL real conviene no cerrarlas: reabrir cuesta más que
 * mantenerlas. La base local embebida, en cambio, corta las conexiones que
 * dejan de usarse, y el pool termina reutilizando un socket muerto — el
 * síntoma es un ECONNRESET en una consulta que debería funcionar.
 *
 * Cerrarlas nosotros primero convierte ese fallo en una reconexión limpia.
 */
function idleTimeout(): number | undefined {
  const configured = Number(process.env['NCI_DB_IDLE_TIMEOUT']);
  return Number.isFinite(configured) && configured > 0 ? configured : undefined;
}

export function createDatabase(options: DatabaseOptions) {
  const idle = idleTimeout();
  const client = postgres(options.url, {
    max: poolSize(options.max),
    ...(idle !== undefined ? { idle_timeout: idle } : {}),
    ...(options.ssl === true ? { ssl: 'require' as const } : {}),
  });
  return drizzle(client, { schema });
}

let shared: Database | undefined;

/**
 * Conexión compartida del proceso. En desarrollo el recargado en caliente
 * volvería a abrir un pool en cada cambio, así que se memoiza.
 */
export function getDatabase(): Database {
  if (shared) return shared;
  const url = requireDatabaseUrl();
  shared = createDatabase({ url, ssl: url.includes('sslmode=require') });
  return shared;
}

export { schema };
