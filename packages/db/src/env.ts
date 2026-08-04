/**
 * Carga del archivo `.env`.
 *
 * El `.env` vive en la raíz del monorepo, pero los scripts corren desde el
 * paquete que los define. Sin esto, `DATABASE_URL` queda indefinida aunque el
 * archivo exista — y el error que se ve no explica por qué.
 *
 * Usa `process.loadEnvFile`, que es parte de Node desde la 20.12: sin
 * dependencias y sin sorpresas de orden de carga.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Busca el `.env` hacia arriba desde el directorio actual.
 *
 * Devuelve la ruta que cargó, o null si no había ninguno — correr sin `.env` es
 * válido cuando las variables vienen del entorno, como en producción.
 */
export function loadEnv(from: string = process.cwd()): string | null {
  let current = resolve(from);

  // Cuatro niveles alcanzan para cualquier paquete del monorepo.
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/** El valor que trae `.env.example`. Copiarlo sin editar es el error más común. */
const PLACEHOLDER_URL = 'postgresql://usuario:clave@localhost:5432/nci';

/**
 * La conexión a PostgreSQL, o un error que explica cómo obtenerla.
 *
 * Principio 18 del PDL: el error enseña. Vale también para quien desarrolla —
 * "Falta DATABASE_URL" no dice dónde ponerla ni cómo conseguir una base, y un
 * "conexión rechazada" no dice que el archivo todavía tiene el valor de ejemplo.
 */
export function requireDatabaseUrl(): string {
  const envPath = loadEnv();
  const url = process.env['DATABASE_URL']?.trim();

  if (!url) {
    throw new Error(
      [
        'No hay conexión a la base de datos configurada.',
        '',
        'La plataforma necesita PostgreSQL 16 o superior con las extensiones vector,',
        'pg_trgm y unaccent. El archivo .env va en la raíz del proyecto:',
        '',
        '  1. Copiá .env.example a .env',
        '  2. Completá DATABASE_URL con la cadena de conexión',
        '',
        'Si todavía no tenés una base, cualquier PostgreSQL gestionado con pgvector',
        'sirve — y es el mismo motor que va a usar la plataforma en producción.',
      ].join('\n'),
    );
  }

  // Se detecta antes de intentar conectar: si no, el error que se ve es
  // "conexión rechazada", que manda a diagnosticar la red en lugar del archivo.
  if (url === PLACEHOLDER_URL) {
    throw new Error(
      [
        'DATABASE_URL todavía tiene el valor de ejemplo.',
        '',
        `Hay que reemplazarlo en ${envPath ?? '.env'} por la cadena de conexión real.`,
        'El valor actual apunta a localhost, que es esta misma máquina.',
        '',
        'La cadena tiene esta forma:',
        '',
        '  DATABASE_URL="postgresql://USUARIO:CLAVE@HOST/BASE?sslmode=require"',
        '',
        'Los servicios gestionados la muestran completa en el panel del proyecto,',
        'lista para copiar y pegar.',
      ].join('\n'),
    );
  }

  return url;
}
