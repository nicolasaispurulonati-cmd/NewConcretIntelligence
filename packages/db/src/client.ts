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
  /**
   * Sentencias preparadas. Hay que apagarlas contra un pooler en modo
   * transacción: ver `usaPoolerDeTransacciones`.
   */
  readonly prepare?: boolean;
  /** Segundos de espera para establecer la conexión. */
  readonly connectTimeout?: number;
}

/**
 * Si el proceso vive dentro de una función efímera.
 *
 * Cambia por completo la forma correcta del pool. Un servidor de larga vida
 * tiene un proceso y un pool; en serverless hay tantos pools como instancias
 * levante la plataforma, y cada uno abre sus propias conexiones contra la misma
 * base. Un pool de 10 en un servidor son 10 conexiones; en serverless, con
 * treinta instancias tibias, son trescientas — y ahí se agota el límite del
 * proveedor con una carga que un solo servidor atendería sin transpirar.
 *
 * Se lee de la plataforma y no del host de la base: el mismo Neon se consulta
 * desde Vercel y desde una máquina de desarrollo, y no quiere la misma forma.
 */
function esServerless(): boolean {
  return process.env['VERCEL'] === '1' || process.env['NCI_DB_SERVERLESS'] === '1';
}

/**
 * Conexiones simultáneas del pool.
 *
 * El motor consulta en paralelo cuando puede — la vista 360 de una entidad pide
 * relaciones, actividad y conteos a la vez. Contra un PostgreSQL de verdad eso
 * es lo correcto. La base local embebida, en cambio, atiende una conexión por
 * vez, y hay que ponerlo en 1 para que el pool encole en lugar de abrir otra.
 *
 * El valor explícito siempre gana: una configuración que ignora lo que se le
 * pidió es peor que una que no se adapta.
 */
function poolSize(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const configured = Number(process.env['NCI_DB_POOL_MAX']);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return esServerless() ? 1 : 10;
}

/**
 * Segundos que una conexión puede quedar ociosa en el pool antes de cerrarse.
 *
 * Contra un PostgreSQL real y un proceso de larga vida conviene no cerrarlas:
 * reabrir cuesta más que mantenerlas.
 *
 * En serverless es al revés. La instancia se congela entre invocaciones y puede
 * no despertar nunca; la conexión queda tomada del lado del servidor hasta que
 * el proveedor la corta. Cerrarla a los veinte segundos devuelve el cupo.
 *
 * La base local embebida corta las conexiones que dejan de usarse, y el pool
 * termina reutilizando un socket muerto — el síntoma es un ECONNRESET en una
 * consulta que debería funcionar. Cerrarlas nosotros primero convierte ese
 * fallo en una reconexión limpia.
 */
function idleTimeout(): number | undefined {
  const configured = Number(process.env['NCI_DB_IDLE_TIMEOUT']);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return esServerless() ? 20 : undefined;
}

/**
 * Segundos antes de abandonar el intento de conexión.
 *
 * El valor de fábrica de la biblioteca son 30. En una función serverless con un
 * límite de ejecución de 10 no sirve de nada: el request muere esperando y
 * quien lo hizo no recibe ni un error. Diez segundos fallan a tiempo.
 */
function connectTimeout(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const configured = Number(process.env['NCI_DB_CONNECT_TIMEOUT']);
  return Number.isFinite(configured) && configured > 0 ? configured : 10;
}

/**
 * Parámetros que entiende libpq y no la biblioteca que usamos.
 *
 * Cualquier parámetro desconocido de la cadena se manda al servidor como si
 * fuera una opción de sesión, y el servidor rechaza la conexión entera con
 * "unrecognized configuration parameter". La cadena que Neon ofrece para copiar
 * trae `channel_binding=require`, así que sin esto la primera conexión a
 * producción falla — y el mensaje señala al servidor, no a la cadena.
 */
const PARAMETROS_DE_LIBPQ = [
  'channel_binding',
  'gssencmode',
  'sslcert',
  'sslkey',
  'sslcrl',
  'sslcompression',
  // Lo agregan algunos proveedores para indicarle al driver que hay un pooler
  // delante. Acá se lee antes de quitarlo.
  'pgbouncer',
];

/**
 * Si la conexión atraviesa un pooler en modo transacción.
 *
 * Ahí cada consulta puede caer en una sesión distinta del servidor, y una
 * sentencia preparada en la anterior ya no existe. El fallo aparece después,
 * bajo carga, cuando el pooler empieza a repartir: "prepared statement s1 does
 * not exist" en una consulta que venía funcionando.
 *
 * Se deduce de la cadena porque es la única fuente que lo sabe. Se puede
 * forzar con la opción `prepare`.
 */
function usaPoolerDeTransacciones(url: URL): boolean {
  return url.hostname.includes('-pooler.') || url.searchParams.get('pgbouncer') === 'true';
}

interface Conexion {
  readonly url: string;
  readonly ssl: boolean;
  readonly pooler: boolean;
}

/**
 * Lee la cadena de conexión y la deja lista para el driver.
 *
 * Una cadena que no se puede interpretar se devuelve tal cual: el driver dará
 * su propio error, que es más específico que cualquiera que se pueda inventar
 * acá.
 */
export function parseConnectionUrl(raw: string): Conexion {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, ssl: /sslmode=(require|verify-ca|verify-full)/.test(raw), pooler: false };
  }

  const modo = url.searchParams.get('sslmode');
  const pooler = usaPoolerDeTransacciones(url);

  for (const parametro of PARAMETROS_DE_LIBPQ) {
    url.searchParams.delete(parametro);
  }

  return {
    url: url.toString(),
    ssl: modo !== null && modo !== 'disable' && modo !== 'allow' && modo !== 'prefer',
    pooler,
  };
}

export function createDatabase(options: DatabaseOptions) {
  const conexion = parseConnectionUrl(options.url);
  const idle = idleTimeout();
  const prepare = options.prepare ?? !conexion.pooler;

  const client = postgres(conexion.url, {
    max: poolSize(options.max),
    connect_timeout: connectTimeout(options.connectTimeout),
    ...(idle !== undefined ? { idle_timeout: idle } : {}),
    ...((options.ssl ?? conexion.ssl) ? { ssl: 'require' as const } : {}),
    ...(prepare ? {} : { prepare: false }),
  });

  return drizzle(client, { schema });
}

let shared: Database | undefined;

/**
 * Conexión compartida del proceso. En desarrollo el recargado en caliente
 * volvería a abrir un pool en cada cambio, así que se memoiza; en serverless
 * la memoización es lo que hace que una instancia tibia no reconecte.
 */
export function getDatabase(): Database {
  if (shared) return shared;
  shared = createDatabase({ url: requireDatabaseUrl() });
  return shared;
}

export { schema };
