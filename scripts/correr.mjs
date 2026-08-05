/**
 * Corre las pruebas de un paquete.
 *
 * Existe por una razón chica y molesta: el corredor de Node falla con un error
 * cifrado cuando el patrón no encuentra archivos, y la salida más cómoda ante
 * eso —no declarar el guion— es justamente la que hace que el paquete
 * desaparezca de la corrida sin que nada se ponga rojo. Ya pasó con apps/web.
 *
 * Acá el caso tiene nombre: si no hay archivos, lo dice y falla.
 *
 *   node ../../scripts/correr.mjs "<patrón>" [-- <opciones de node>]
 */

import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';

const argumentos = process.argv.slice(2);
const separador = argumentos.indexOf('--');

const patron = argumentos[0];
const opcionesDeNode = separador === -1 ? [] : argumentos.slice(separador + 1);

/**
 * Un tsconfig propio para las pruebas, cuando el del paquete no sirve.
 *
 * Lo necesita apps/web: Next exige `jsx: "preserve"` en su tsconfig y lo
 * reescribe si alguien lo cambia, pero el JSX preservado no lo entiende Node.
 * Se pasa por variable de entorno porque definirla en el guion de npm no es
 * portable entre Windows y el resto.
 */
const tsconfig = argumentos.indexOf('--tsconfig');
const entorno =
  tsconfig === -1
    ? process.env
    : { ...process.env, TSX_TSCONFIG_PATH: argumentos[tsconfig + 1] };

if (!patron) {
  console.error('Falta el patrón de archivos.\n\n  node scripts/correr.mjs "src/**/*.test.ts"');
  process.exit(1);
}

const archivos = globSync(patron).sort();

if (archivos.length === 0) {
  console.error(
    [
      'Este paquete no tiene pruebas.',
      '',
      `Ningún archivo coincide con "${patron}" en ${process.cwd()}.`,
      '',
      'No es un aviso: es rojo. Un paquete sin pruebas que además no aparece en',
      'la corrida es indistinguible de uno que pasó, y esa confusión ya costó',
      'tres sesiones en este proyecto.',
      '',
      'Escribí al menos una prueba, o discutí por qué este paquete no debería',
      'tener ninguna — pero que quede escrito.',
    ].join('\n'),
  );
  process.exit(1);
}

const proceso = spawnSync(
  process.execPath,
  [...opcionesDeNode, '--test', ...archivos],
  { stdio: 'inherit', env: entorno },
);

process.exitCode = proceso.status ?? 1;
