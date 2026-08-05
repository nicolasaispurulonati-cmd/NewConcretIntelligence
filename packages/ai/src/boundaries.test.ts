/**
 * Los límites del paquete.
 *
 * La regla que sostiene la promesa central del producto — que la IA nunca ve
 * lo que la persona no podría ver — no depende de que nadie se acuerde: depende
 * de que este paquete no tenga forma de llegar a la base.
 *
 * Estas pruebas la convierten en algo que rompe el build.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { Actor, NotAuthorizedError, resolveCapabilities, type Scope } from '@nci/core';
import { ROLES } from '@nci/domain';

import { Assistant } from './assistant.js';
import { renderContext, type RetrievedContext } from './retrieval.js';

const paqueteRaiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Conversiones que apagan el compilador.
 *
 * Se arman por partes para que este archivo no se detecte a sí mismo al
 * buscarlas: nombrar lo que se prohíbe no es usarlo.
 */
const CONVERSIONES_AMPLIAS = ['as ' + 'never', 'as ' + 'any'];

function archivosFuente(): string[] {
  const dir = join(paqueteRaiz, 'src');
  return readdirSync(dir)
    .filter((nombre) => nombre.endsWith('.ts'))
    .map((nombre) => join(dir, nombre));
}

/** Sólo el código que se publica. Las pruebas tienen sus propias reglas. */
function archivosDeProduccion(): string[] {
  return archivosFuente().filter((ruta) => !ruta.endsWith('.test.ts'));
}

/**
 * Doble de la base para las pruebas de autorización.
 *
 * Cualquier acceso lanza: si la autorización dejara pasar una consulta, la
 * prueba falla con un error explícito en lugar de devolver datos falsos.
 *
 * La conversión está acotada acá y es la única del paquete. Un tipo de Drizzle
 * no se puede satisfacer estructuralmente con un doble, y la alternativa
 * —montar una base real para comprobar que algo NO la consulta— probaría menos
 * y tardaría más.
 */
function baseQueNoDebeTocarse(alTocar: () => void): Scope['db'] {
  const trampa = new Proxy(
    {},
    {
      get() {
        alTocar();
        throw new Error('Se intentó consultar la base sin autorización previa.');
      },
    },
  );
  return trampa as Scope['db'];
}

describe('El paquete no puede alcanzar la base', () => {
  it('no declara @nci/db entre sus dependencias', () => {
    const paquete = JSON.parse(readFileSync(join(paqueteRaiz, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const todas = { ...paquete.dependencies, ...paquete.devDependencies };

    assert.ok(
      !('@nci/db' in todas),
      'Si @nci/ai puede importar @nci/db, la IA puede consultar sin pasar por las capacidades.',
    );
    assert.ok(!('drizzle-orm' in todas), 'Un ORM acá es una vía directa a la base.');
    assert.ok(!('postgres' in todas), 'Un driver acá es una vía directa a la base.');
  });

  it('ningún archivo importa la base ni un driver', () => {
    // Los términos se arman por partes para que este archivo no se detecte a
    // sí mismo: nombrar lo que se prohíbe no es usarlo.
    const prohibidos = ['@nci' + '/db', 'drizzle' + '-orm', "from 'post" + "gres'"];

    for (const archivo of archivosDeProduccion()) {
      const fuente = readFileSync(archivo, 'utf8');
      for (const prohibido of prohibidos) {
        assert.ok(
          !fuente.includes(prohibido),
          `${archivo} referencia ${prohibido}. El acceso a datos va por @nci/core con un Scope.`,
        );
      }
    }
  });

  it('no usa superficie inestable del SDK', () => {
    // Un campo que el compilador no valida rompe en ejecución y no en el build,
    // que es la peor forma de enterarse.
    const prohibidos = CONVERSIONES_AMPLIAS.concat(['@ts' + '-ignore', '@ts' + '-expect-error']);

    for (const archivo of archivosDeProduccion()) {
      const fuente = readFileSync(archivo, 'utf8');
      for (const prohibido of prohibidos) {
        assert.ok(!fuente.includes(prohibido), `${archivo} contiene "${prohibido}".`);
      }
      assert.ok(
        !/client\.beta\./.test(fuente),
        `${archivo} llama a la superficie beta del SDK.`,
      );
    }
  });

  it('las pruebas tampoco usan conversiones amplias', () => {
    // Apagan el compilador por completo. Un doble de prueba puede necesitar
    // una conversión acotada a un tipo concreto, pero nunca una de éstas.
    for (const archivo of archivosFuente()) {
      const fuente = readFileSync(archivo, 'utf8');
      for (const prohibido of CONVERSIONES_AMPLIAS) {
        assert.ok(!fuente.includes(prohibido), `${archivo} contiene "${prohibido}".`);
      }
    }
  });
});

describe('Sin autorización no se recupera contexto', () => {
  /**
   * El asistente se construye con un marcador de posición, no con una clave.
   *
   * Nunca llega a usarse: estas pruebas verifican que el rechazo ocurre antes
   * de cualquier llamada. El texto se elige para que se lea como lo que es —
   * una cadena parecida a una clave, en un repositorio público, dispara
   * escáneres de secretos y hace perder el tiempo a quien los revisa.
   */
  const asistente = new Assistant({ apiKey: 'no-es-una-clave-marcador-de-posicion' });

  function actorCon(capacidades: readonly string[]): Actor {
    return new Actor({
      id: '00000000-0000-0000-0000-000000000000',
      fullName: 'Actor de prueba',
      roles: [],
      capabilities: resolveCapabilities({ fromRoles: [...capacidades] }),
    });
  }

  it('un actor sin capacidad de asistencia es rechazado', async () => {
    const scope: Scope = {
      db: baseQueNoDebeTocarse(() => {}),
      actor: actorCon([]),
    };

    await assert.rejects(
      () => asistente.assist(scope, { question: '¿Cuál fue el margen del trimestre?' }),
      (error: unknown) => {
        assert.ok(error instanceof NotAuthorizedError);
        assert.match(error.message, /No posee permisos/);
        return true;
      },
    );
  });

  it('el rechazo ocurre antes de cualquier consulta', async () => {
    let consultada = false;
    const scope: Scope = {
      db: baseQueNoDebeTocarse(() => {
        consultada = true;
      }),
      // Tiene permiso para leer productos, pero no para usar el asistente.
      actor: actorCon(['products.product.read']),
    };

    await assert.rejects(() => asistente.assist(scope, { question: 'algo' }));
    assert.equal(consultada, false, 'no debe tocarse la base sin ai.assistant.read');
  });

  it('Marketing tiene asistencia pero no información financiera', () => {
    const marketing = new Actor({
      id: 'x',
      fullName: 'Marketing',
      roles: ['marketing'],
      capabilities: resolveCapabilities({ fromRoles: ROLES.marketing.capabilities }),
    });

    assert.ok(marketing.can('ai.assistant.read'));
    assert.equal(marketing.can('executive.financials.read'), false);
  });
});

describe('restrictedCount llega al modelo', () => {
  function contexto(
    restrictedCount: number,
    items: RetrievedContext['items'] = [],
    truncatedCount = 0,
  ): RetrievedContext {
    return { items, restrictedCount, truncatedCount, searched: 'Concret D' };
  }

  it('con contexto vacío informa cuántos elementos quedan fuera de alcance', () => {
    const texto = renderContext(contexto(3));
    assert.match(texto, /3 elementos relacionados fuera del alcance/);
  });

  it('con contexto vacío y sin restricciones no inventa una advertencia', () => {
    const texto = renderContext(contexto(0));
    assert.ok(!/fuera del alcance/.test(texto));
    assert.match(texto, /no se encontró información relacionada/);
  });

  it('con contexto, instruye no mencionar ni especular sobre lo restringido', () => {
    const texto = renderContext(
      contexto(7, [
        {
          entityId: 'abc',
          entityType: 'product',
          typeName: 'Producto',
          displayName: 'Concret D',
          subtitle: null,
          status: 'activo',
          updatedAt: '2026-08-04T12:00:00.000Z',
          via: 'foco',
          detail: {},
        },
      ]),
    );

    assert.match(texto, /7 elementos relacionados que esta persona no está autorizada/);
    assert.match(texto, /No los menciones ni especules/);
    // La instrucción existe para que la IA no afirme que algo no existe cuando
    // sólo no puede verlo.
    assert.match(texto, /no afirmar que algo no existe/);
  });

  it('nunca revela qué son los elementos restringidos', () => {
    const texto = renderContext(contexto(4));
    // Sólo el número. Cualquier detalle sería una filtración por otra vía.
    assert.equal((texto.match(/\b4\b/g) ?? []).length, 1);
  });
});

/**
 * Un contexto recortado tiene que llegarle al modelo como recortado.
 *
 * Es peor que el mismo defecto en la interfaz. Una persona frente a una lista
 * larga puede sospechar que hay más; un resumen generado se lee como completo.
 * Y el contrato de respuesta agrava el problema en vez de contenerlo: obliga a
 * declarar fuentes y confianza, así que un modelo que ignora el truncamiento
 * produce una respuesta con toda la estructura de rigor intacta sobre un
 * conjunto incompleto. El formato la hace parecer más confiable, no menos.
 */
describe('El truncamiento llega al modelo', () => {
  const unItem: RetrievedContext['items'] = [
    {
      entityId: 'abc',
      entityType: 'product',
      typeName: 'Producto',
      displayName: 'Concret D',
      subtitle: null,
      status: 'activo',
      updatedAt: '2026-08-06T12:00:00.000Z',
      via: 'foco',
      detail: {},
    },
  ];

  function contextoRecortado(truncatedCount: number, restrictedCount = 0): RetrievedContext {
    return { items: unItem, restrictedCount, truncatedCount, searched: 'Concret D' };
  }

  it('dice cuántos vio sobre cuántos hay', () => {
    const texto = renderContext(contextoRecortado(339));

    assert.match(texto, /contexto está incompleto/);
    assert.match(texto, /1 elementos/, 'cuántos vio');
    assert.match(texto, /339 más/, 'cuántos quedaron afuera');
  });

  it('exige declararlo en missingInformation', () => {
    // El contrato ya tiene el campo. Sin esta instrucción, el truncamiento
    // quedaría como dato interno y la respuesta saldría igual de segura.
    const texto = renderContext(contextoRecortado(50));

    assert.match(texto, /missingInformation/);
  });

  it('sin truncamiento no dice nada', () => {
    // Para que el aviso signifique algo cuando aparece.
    const texto = renderContext(contextoRecortado(0));

    assert.ok(!/contexto está incompleto/.test(texto));
    assert.ok(!/missingInformation/.test(texto));
  });

  it('lo recortado y lo restringido son dos avisos distintos', () => {
    const texto = renderContext(contextoRecortado(12, 5));

    assert.match(texto, /12 más que esta persona sí puede consultar/);
    assert.match(texto, /5 elementos relacionados que esta persona no está autorizada/);

    // El que no puede ver no se declara en la respuesta; el que no vio, sí.
    // Confundirlos sería filtrar por un lado o mentir por el otro.
    assert.match(texto, /No los menciones ni especules/);
  });
});
