/**
 * Corre las pruebas de todos los paquetes y verifica que el tablero cuadre.
 *
 * El modo de falla que este script existe para eliminar no es una prueba que
 * falla: es una prueba que **no corre** y no se nota. Pasó de verdad en este
 * proyecto — un archivo de integración no lograba conectarse, sus pruebas se
 * marcaban como salteadas, el proceso terminaba en cero y el tablero decía
 * verde con nueve pruebas menos de las que había.
 *
 * Un salteo puede ser legítimo, pero tiene que ser una decisión declarada acá
 * y no el resultado de que algo no estuviera disponible. Por eso: cero
 * salteadas, y la aritmética del resumen tiene que cerrar.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Qué guion de pruebas correr.
 *
 * Sin argumento corre `test` en cada paquete. Con uno, ese guion — que es como
 * la batería de integración se pide aparte de la unitaria.
 */
const GUION = process.argv[2] ?? 'test';

/** Los paquetes que declaran ese guion, en orden estable. */
function paquetes() {
  return ['packages', 'apps']
    .filter((grupo) => existsSync(join(raiz, grupo)))
    .flatMap((grupo) =>
      readdirSync(join(raiz, grupo))
        .map((nombre) => join(grupo, nombre))
        .filter((ruta) => existsSync(join(raiz, ruta, 'package.json'))),
    )
    .map((ruta) => {
      const manifiesto = JSON.parse(readFileSync(join(raiz, ruta, 'package.json'), 'utf8'));
      return { ruta, nombre: manifiesto.name, corre: Boolean(manifiesto.scripts?.[GUION]) };
    })
    .filter((paquete) => paquete.corre);
}

/**
 * Lee el resumen que imprime el corredor de pruebas de Node.
 *
 * Se parsean las líneas `ℹ tests 24`, que son parte de su salida por defecto.
 * Un paquete que no las imprima se trata como resultado ilegible y hace fallar
 * la corrida: preferible a suponer que anduvo bien.
 */
function resumen(salida) {
  const contadores = { tests: 0, pass: 0, fail: 0, skipped: 0, todo: 0 };
  let encontrado = false;

  for (const linea of salida.split('\n')) {
    const coincidencia = /^\s*ℹ (tests|pass|fail|skipped|todo) (\d+)\s*$/.exec(linea);
    if (!coincidencia) continue;
    contadores[coincidencia[1]] += Number(coincidencia[2]);
    encontrado = true;
  }

  return encontrado ? contadores : null;
}

const total = { tests: 0, pass: 0, fail: 0, skipped: 0, todo: 0 };
const problemas = [];
const filas = [];

for (const paquete of paquetes()) {
  // Un solo comando en vez de comando más argumentos: en Windows npm es un
  // `.cmd` y Node no lo lanza sin shell, y con shell avisa que los argumentos
  // se concatenan sin escapar. Los nombres salen de los package.json del
  // propio repositorio, así que no hay nada que escapar.
  const proceso = spawnSync(`npm run ${GUION} --workspace ${paquete.nombre}`, {
    cwd: raiz,
    encoding: 'utf8',
    shell: true,
  });

  if (proceso.error) {
    problemas.push(`${paquete.nombre}: no se pudo ejecutar (${proceso.error.message}).`);
    continue;
  }

  const salida = `${proceso.stdout ?? ''}${proceso.stderr ?? ''}`;
  process.stdout.write(salida);

  const contadores = resumen(salida);

  if (!contadores) {
    problemas.push(`${paquete.nombre}: no imprimió un resumen legible de pruebas.`);
    continue;
  }

  for (const clave of Object.keys(total)) total[clave] += contadores[clave];
  filas.push({ paquete: paquete.nombre, ...contadores });

  if (proceso.status !== 0) {
    problemas.push(`${paquete.nombre}: terminó con código ${proceso.status}.`);
  }

  // La aritmética tiene que cerrar. Si no cierra, hay pruebas que el corredor
  // contó y de las que no informó resultado, que es justo lo que se persigue.
  const informadas = contadores.pass + contadores.fail + contadores.skipped + contadores.todo;
  if (informadas !== contadores.tests) {
    problemas.push(
      `${paquete.nombre}: declaró ${contadores.tests} pruebas e informó resultado de ${informadas}.`,
    );
  }
}

console.log('\n─────────────────────────────────────────────');
console.table(filas);

if (total.skipped > 0) {
  problemas.push(
    `Hay ${total.skipped} prueba(s) salteada(s). Una prueba que no corre no dice nada, y un tablero que las cuenta como verdes miente.`,
  );
}
if (total.todo > 0) {
  problemas.push(`Hay ${total.todo} prueba(s) marcadas como pendientes.`);
}
if (total.fail > 0) {
  problemas.push(`Hay ${total.fail} prueba(s) en rojo.`);
}

if (problemas.length > 0) {
  console.error(`\nLa corrida no cierra:\n${problemas.map((p) => `  · ${p}`).join('\n')}`);
  console.error(
    '\nSi el motivo es que falta la base de datos, la batería de integración se pide\naparte y con su propio comando: npm run test:integracion',
  );
  process.exitCode = 1;
} else {
  console.log(`\n${total.pass} pruebas, todas en verde. Ninguna salteada.`);
}
