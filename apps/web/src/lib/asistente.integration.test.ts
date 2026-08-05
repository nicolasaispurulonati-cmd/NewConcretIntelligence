/**
 * Que el asistente sepa que su contexto está recortado.
 *
 * Esta prueba vive acá y no en `@nci/ai` por la misma razón por la que aquel
 * paquete no puede alcanzar la base: verificarlo desde adentro exigiría darle
 * `@nci/db` aunque fuera como dependencia de desarrollo, y eso abriría la
 * puerta que D-002 cierra. `apps/web` es el único lugar que depende de los dos
 * de forma legítima.
 *
 * Lo que se cubre es el cable completo: la base recorta, el motor lo cuenta,
 * la recuperación lo acumula y el texto que recibe el modelo lo dice.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { inArray } from 'drizzle-orm';

import { renderContext, retrieveContext } from '@nci/ai';
import { Actor, createEntity, relate, resolveCapabilities, type Scope } from '@nci/core';
import { createDatabase, entities, requireDatabaseUrl, users, type Database } from '@nci/db';

let db: Database | undefined;
let scope: Scope;

const marca = Date.now().toString(36);
const creado: string[] = [];

/** Vecinos que se crean alrededor del foco. */
const VECINOS = 6;
/** Tope de contexto de la prueba: entran el foco y dos vecinos. */
const TOPE = 3;

before(async () => {
  db = createDatabase({ url: requireDatabaseUrl(), max: 1 });
  await db.execute('select 1');

  const [usuario] = await db.select({ id: users.id }).from(users).limit(1);
  assert.ok(usuario, 'la base de pruebas necesita al menos un usuario');

  scope = {
    db,
    actor: new Actor({
      id: usuario.id,
      fullName: 'Asistente',
      roles: [],
      capabilities: resolveCapabilities({
        fromRoles: ['products.product.admin', 'knowledge.document.admin', 'ai.assistant.read'],
      }),
    }),
  };
});

after(async () => {
  if (!db) return;
  if (creado.length > 0) {
    await db.delete(entities).where(inArray(entities.id, creado)).catch(() => {});
  }
  await db.$client.end().catch(() => {});
});

async function crear(entrada: Parameters<typeof createEntity>[1]) {
  const entidad = await createEntity(scope, entrada);
  creado.push(entidad.id);
  return entidad;
}

describe('El contexto recortado llega al modelo como recortado', () => {
  it('cuenta lo que no entró y lo declara en el texto', async () => {
    const producto = await crear({
      type: 'product',
      slug: `producto-asistente-${marca}`,
      displayName: `Producto asistente ${marca}`,
      status: 'activo',
    });

    for (let i = 0; i < VECINOS; i += 1) {
      const documento = await crear({
        type: 'document',
        slug: `documento-asistente-${marca}-${i}`,
        displayName: `Ficha asistente ${marca}-${i}`,
        status: 'vigente',
      });
      await relate(scope, { type: 'documents', fromId: documento.id, toId: producto.id });
    }

    const contexto = await retrieveContext(scope, {
      question: '¿Qué sabemos de este producto?',
      focusEntityId: producto.id,
      maxItems: TOPE,
    });

    assert.equal(contexto.items.length, TOPE, 'el contexto se llena hasta el tope');

    // El foco ocupa un lugar, así que entran dos vecinos y quedan cuatro.
    const entraron = TOPE - 1;
    assert.equal(
      contexto.truncatedCount,
      VECINOS - entraron,
      'los vecinos que no entraron tienen que estar contados',
    );
    assert.equal(contexto.restrictedCount, 0, 'nada de esto es un problema de permisos');

    const texto = renderContext(contexto);
    assert.match(texto, /contexto está incompleto/);
    assert.match(texto, new RegExp(`${VECINOS - entraron} más`));
    assert.match(texto, /missingInformation/, 'y el modelo tiene que declararlo en la respuesta');
  });

  it('un contexto que entra entero no se declara incompleto', async () => {
    const producto = await crear({
      type: 'product',
      slug: `producto-completo-${marca}`,
      displayName: `Producto completo ${marca}`,
      status: 'activo',
    });

    const documento = await crear({
      type: 'document',
      slug: `documento-completo-${marca}`,
      displayName: `Ficha completa ${marca}`,
      status: 'vigente',
    });
    await relate(scope, { type: 'documents', fromId: documento.id, toId: producto.id });

    const contexto = await retrieveContext(scope, {
      question: `Producto completo ${marca}`,
      focusEntityId: producto.id,
      maxItems: 24,
    });

    assert.equal(contexto.truncatedCount, 0);
    assert.ok(!/contexto está incompleto/.test(renderContext(contexto)));
  });
});
