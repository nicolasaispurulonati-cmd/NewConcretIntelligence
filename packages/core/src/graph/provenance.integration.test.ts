/**
 * Procedencia y certeza, verificadas donde se imponen: en la base.
 *
 * Las pruebas escriben SQL directo a propósito. Verificar la regla llamando a
 * `createEntity` probaría la validación de la aplicación, que es justamente la
 * capa que un script de importación, una consola o un dominio futuro pueden
 * saltearse. Lo que se quiere garantizar es que la base rechaza el dato aunque
 * nadie se acuerde de validarlo.
 *
 * Ver D-007.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { inArray, sql } from 'drizzle-orm';

import { createDatabase, entities, requireDatabaseUrl, users, type Database } from '@nci/db';

import { Actor, resolveCapabilities } from '../authorization/actor.js';
import type { Scope } from '../authorization/resolve.js';
import { createEntity } from './entities.js';
import { relate } from './relations.js';

let db: Database | undefined;
let scope: Scope;

const marca = Date.now().toString(36);
const creado: string[] = [];

/** Los dos extremos de la arista que se usa para probar las restricciones. */
let productoId = '';
let documentoId = '';

before(async () => {
  // Sin try/catch a propósito: si la base no está, esto falla y las pruebas se
  // ponen rojas. Saltearse sola convertiría la ausencia del entorno en verde.
  db = createDatabase({ url: requireDatabaseUrl(), max: 1 });
  await db.execute('select 1');

  const [usuario] = await db.select({ id: users.id }).from(users).limit(1);
  if (!usuario) {
    throw new Error('La base no tiene usuarios. Sembrala con: npm run db:seed');
  }

  scope = {
    db,
    actor: new Actor({
      id: usuario.id,
      fullName: 'Procedencia',
      roles: [],
      capabilities: resolveCapabilities({
        fromRoles: ['products.product.admin', 'knowledge.document.admin'],
      }),
    }),
  };

  const producto = await createEntity(scope, {
    type: 'product',
    slug: `producto-procedencia-${marca}`,
    displayName: `Producto procedencia ${marca}`,
    status: 'activo',
  });
  const documento = await createEntity(scope, {
    type: 'document',
    slug: `documento-procedencia-${marca}`,
    displayName: `Documento procedencia ${marca}`,
    status: 'vigente',
  });

  productoId = producto.id;
  documentoId = documento.id;
  creado.push(productoId, documentoId);

  await relate(scope, { type: 'documents', fromId: documentoId, toId: productoId });
});

after(async () => {
  if (db && creado.length > 0) {
    await db.delete(entities).where(inArray(entities.id, creado)).catch(() => {});
  }
  if (db) await db.$client.end().catch(() => {});
});

/**
 * Aplana un error y sus causas.
 *
 * Drizzle envuelve el error de PostgreSQL: su `message` dice "Failed query" y
 * el motivo real —el nombre de la restricción que se violó— queda en `cause`.
 * Buscar sólo en `message` haría fallar la comprobación por el lugar donde se
 * mira, no por lo que pasó.
 */
function describir(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const partes = [error.message];
  if (error.cause) partes.push(describir(error.cause));
  return partes.join(' · ');
}

/** Señal interna para deshacer una consulta que no debería haber pasado. */
class NoHuboRechazo extends Error {}

/**
 * Ejecuta SQL y devuelve el motivo del rechazo, o `null` si la consulta pasó.
 * Ninguna consulta de estas pruebas debe pasar.
 *
 * Cada comprobación corre en su propia transacción y siempre termina en
 * rollback: si la restricción funciona, deshace el intento fallido y deja la
 * conexión limpia para la comprobación siguiente; si no funciona, deshace el
 * dato inválido que acaba de entrar y la prueba falla igual. Encadenar errores
 * sobre una misma conexión sin cerrar la transacción deja el estado del
 * protocolo a merced del motor.
 */
async function rechazo(consulta: ReturnType<typeof sql>): Promise<string | null> {
  try {
    await db!.transaction(async (tx) => {
      await tx.execute(consulta);
      throw new NoHuboRechazo();
    });
    return null;
  } catch (error) {
    return error instanceof NoHuboRechazo ? null : describir(error);
  }
}

describe('La base rechaza una procedencia inventada', () => {
  it('en un nodo', async () => {
    const motivo = await rechazo(
      sql`update entities set source = 'importado' where id = ${productoId}`,
    );

    assert.ok(motivo, 'un origen fuera del vocabulario tiene que rechazarse');
    assert.match(motivo, /entities_source_valid/);
  });

  it('en una arista', async () => {
    const motivo = await rechazo(
      sql`update entity_relations set source = 'importado' where from_id = ${documentoId}`,
    );

    assert.ok(motivo);
    assert.match(motivo, /entity_relations_source_valid/);
  });

  it('el vocabulario es el mismo para los dos', async () => {
    // Consistencia entre nodo y arista: si algún día divergen, esto lo dice.
    const filas = await db!.execute<{ conname: string; consrc: string }>(sql`
      select conname, pg_get_constraintdef(oid) as consrc
      from pg_constraint
      where conname in ('entities_source_valid', 'entity_relations_source_valid')
    `);

    const definiciones = [...filas].map((fila) =>
      String(fila.consrc).replace(/entity_relations|entities/g, 'TABLA'),
    );

    assert.equal(definiciones.length, 2);
    assert.equal(definiciones[0], definiciones[1], 'nodo y arista tienen que admitir lo mismo');
  });
});

describe('La base rechaza una certeza fuera de rango', () => {
  it('en un nodo, por encima de 1', async () => {
    const motivo = await rechazo(
      sql`update entities set confidence = 1.5 where id = ${productoId}`,
    );

    assert.ok(motivo, 'la certeza va de 0 a 1, no en porcentaje ni sin tope');
    assert.match(motivo, /entities_confidence_valid/);
  });

  it('en un nodo, por debajo de 0', async () => {
    const motivo = await rechazo(
      sql`update entities set confidence = -0.1 where id = ${productoId}`,
    );

    assert.ok(motivo);
    assert.match(motivo, /entities_confidence_valid/);
  });

  it('en una arista', async () => {
    const motivo = await rechazo(
      sql`update entity_relations set confidence = 2 where from_id = ${documentoId}`,
    );

    assert.ok(motivo);
    assert.match(motivo, /entity_relations_confidence_valid/);
  });

  it('ya no admite texto donde iba un número', async () => {
    // El motivo del cambio de tipo: como texto, esto entraba sin quejarse.
    const motivo = await rechazo(
      sql`update entities set confidence = 'alta' where id = ${productoId}`,
    );

    assert.ok(motivo, 'una certeza escrita en palabras no puede entrar');
  });
});

describe('Lo válido sigue entrando', () => {
  it('un nodo inferido con su certeza', async () => {
    const inferido = await createEntity(scope, {
      type: 'product',
      slug: `producto-inferido-${marca}`,
      displayName: `Producto inferido ${marca}`,
      status: 'activo',
      source: 'ai',
      confidence: 0.8,
    });
    creado.push(inferido.id);

    assert.equal(inferido.source, 'ai');
    assert.equal(inferido.confidence, 0.8);
  });

  it('un nodo afirmado por una persona no lleva certeza', async () => {
    const afirmado = await createEntity(scope, {
      type: 'product',
      slug: `producto-afirmado-${marca}`,
      displayName: `Producto afirmado ${marca}`,
      status: 'activo',
    });
    creado.push(afirmado.id);

    // El valor por defecto: lo que se creó hasta hoy lo creó una persona.
    assert.equal(afirmado.source, 'user');
    assert.equal(afirmado.confidence, null);
  });
});
