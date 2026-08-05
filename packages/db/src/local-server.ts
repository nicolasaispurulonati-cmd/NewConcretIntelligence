/**
 * PostgreSQL local embebido.
 *
 * PGlite es PostgreSQL compilado a WebAssembly: corre dentro de este proceso de
 * Node, sin instalar nada en el sistema. Expuesto por TCP con el protocolo de
 * PostgreSQL, el resto de la plataforma no distingue este servidor de uno real
 * — mismo driver, mismas migraciones, mismas consultas.
 *
 * Es para desarrollo, no para producción: una sola conexión a la vez y sin las
 * garantías operativas de un servidor de verdad. Producción usa PostgreSQL
 * gestionado, con el mismo esquema y sin cambios de código.
 *
 *   npm run db:local
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const HOST = '127.0.0.1';
const PORT = Number(process.env['NCI_LOCAL_DB_PORT'] ?? 5432);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(packageRoot, '..', '..', '.data', 'postgres');

/**
 * Un error que enseña, en lugar de un volcado de stack.
 *
 * Principio 18 del PDL. Las dos formas de fallar acá tienen causa conocida y
 * solución concreta: decirlas es más útil que mostrar la pila de llamadas.
 */
function explain(error: unknown): string {
  const code = (error as { code?: string }).code;

  if (code === 'EADDRINUSE') {
    return [
      `El puerto ${PORT} ya está ocupado.`,
      '',
      'Casi siempre es otra base local abierta en otra terminal. Si la encontrás,',
      'usá esa: ya está lista para trabajar, no hace falta levantar otra.',
      '',
      'Para cerrarla, andá a su terminal y presioná Ctrl+C. Así guarda los datos',
      'antes de salir. Cerrar el proceso a la fuerza deja el directorio a medio',
      'escribir y hay que recrear la base desde cero.',
      '',
      'Si no encontrás esa terminal, levantá esta en otro puerto:',
      '',
      '  NCI_LOCAL_DB_PORT=5433 npm run db:local',
      '',
      'y actualizá el puerto en DATABASE_URL, dentro de .env.',
    ].join('\n');
  }

  if (code === 'EACCES') {
    return [
      `No hay permiso para escuchar en el puerto ${PORT}.`,
      '',
      `Probá con un puerto por encima de 1024: NCI_LOCAL_DB_PORT=5433 npm run db:local`,
    ].join('\n');
  }

  const message = error instanceof Error ? error.message : String(error);

  // PGlite corre sobre WebAssembly: cuando encuentra el directorio de datos a
  // medio escribir, aborta con este mensaje en lugar de un error de PostgreSQL.
  if (message.includes('Aborted')) {
    return [
      'El directorio de datos quedó inconsistente y la base no puede abrirlo.',
      '',
      'Pasa cuando el servidor se cierra a la fuerza en vez de con Ctrl+C.',
      'Los datos de desarrollo se recrean en segundos:',
      '',
      `  1. Borrá la carpeta: ${dataDir}`,
      '  2. npm run db:local',
      '  3. En otra terminal: npm run db:migrate && npm run db:seed',
      '',
      'Para evitarlo, cerrá siempre el servidor con Ctrl+C.',
    ].join('\n');
  }

  if (message.includes('lock') || code === 'EBUSY') {
    return [
      'El directorio de datos está en uso por otro proceso.',
      '',
      'Sólo un servidor puede abrir la base a la vez. Cerrá el otro y volvé a intentar.',
      `Directorio: ${dataDir}`,
    ].join('\n');
  }

  return message;
}

/**
 * Comprueba que el puerto esté libre antes de abrir la base.
 *
 * El fallo al escuchar llega como evento del socket, no como promesa
 * rechazada — sin esta comprobación se escapa del try/catch y sale como
 * excepción no capturada. Además evita dejar el directorio de datos abierto
 * por un servidor que no va a poder atender a nadie.
 */
async function assertPortIsFree(): Promise<void> {
  const { createServer } = await import('node:net');

  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(PORT, HOST, () => probe.close(() => resolve()));
  });
}

async function main(): Promise<void> {
  await assertPortIsFree();
  mkdirSync(dataDir, { recursive: true });

  // Las tres extensiones del esquema se registran al crear la instancia: PGlite
  // sólo puede instalar las que se le pasaron acá.
  const db = await PGlite.create({
    dataDir,
    extensions: { pg_trgm, unaccent, vector },
  });

  const banner = (await db.query<{ version: string }>('select version() as version')).rows[0];
  const server = new PGLiteSocketServer({ db, host: HOST, port: PORT });
  await server.start();

  console.log(banner?.version.split(',')[0] ?? 'PGlite');
  console.log(`Escuchando en ${HOST}:${PORT}`);
  console.log(`Datos en ${dataDir}`);
  console.log('');
  console.log('Dejá esta terminal abierta. Para detenerlo: Ctrl+C');
  console.log('En otra terminal: npm run db:migrate');

  /**
   * Volcado periódico a disco.
   *
   * Este proceso sólo puede terminarse de forma forzada desde fuera de su
   * terminal: Windows no ofrece una señal que un proceso de consola pueda
   * atender. Cuando eso pasa, lo que quedó en memoria se pierde y el
   * directorio de datos queda a medio escribir.
   *
   * Un CHECKPOINT cada pocos segundos no evita el cierre abrupto, pero cambia
   * su consecuencia: en lugar de tener que recrear la base entera, se pierden
   * como mucho los últimos segundos. Sobre una base de desarrollo el costo es
   * despreciable.
   */
  let volcando = false;
  const volcado = setInterval(() => {
    if (volcando) return;
    volcando = true;
    void db
      .query('CHECKPOINT')
      .catch(() => {
        // Un volcado perdido no es motivo para detener el servidor: el
        // siguiente lo cubre.
      })
      .finally(() => {
        volcando = false;
      });
  }, 5000);

  // Sin esto el proceso no terminaría solo al cerrar el servidor.
  volcado.unref();

  // Cerrar sin avisar deja el directorio de datos a medio escribir.
  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log('\nCerrando la base…');
    clearInterval(volcado);
    await server.stop();
    await db.close();
    console.log('Datos guardados.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

try {
  await main();
} catch (error) {
  console.error(`\n${explain(error)}\n`);
  process.exit(1);
}
