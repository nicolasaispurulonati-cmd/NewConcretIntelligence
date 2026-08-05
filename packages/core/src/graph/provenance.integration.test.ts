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

describe('El origen externo va completo o no va', () => {
  /** Las tres tablas que comparten el vocabulario. Ver D-009. */
  const TABLAS = ['entities', 'entity_relations', 'activity'] as const;

  it('el vocabulario es exactamente el mismo en las tres tablas', async () => {
    const filas = await db!.execute<{ conname: string; consrc: string }>(sql`
      select conname, pg_get_constraintdef(oid) as consrc
      from pg_constraint
      where conname in (
        'entities_source_valid',
        'entity_relations_source_valid',
        'activity_source_valid'
      )
    `);

    const definiciones = [...filas].map((fila) => String(fila.consrc));

    assert.equal(definiciones.length, 3, 'las tres tienen que tener restricción');
    assert.equal(new Set(definiciones).size, 1, 'y tienen que decir exactamente lo mismo');
    assert.match(definiciones[0] ?? '', /integration/, 'con integration adentro');
  });

  it('una procedencia externa sin sistema de origen se rechaza', async () => {
    const motivo = await rechazo(
      sql`update entities set source = 'integration' where id = ${productoId}`,
    );

    assert.ok(motivo, 'sin decir de qué sistema vino, el dato no se puede mostrar con su origen');
    assert.match(motivo, /entities_external_origin/);
  });

  it('una procedencia externa sin fecha de lectura se rechaza', async () => {
    const motivo = await rechazo(
      sql`update entities set source = 'integration', source_system = 'tango' where id = ${productoId}`,
    );

    // Sin la fecha no se puede mostrar que el dato envejeció, que es lo que
    // D-001 exige para todo lo que NCI no es dueño.
    assert.ok(motivo);
    assert.match(motivo, /entities_external_origin/);
  });

  it('un dato que no vino de afuera no puede declarar sistema de origen', async () => {
    const motivo = await rechazo(
      sql`update entities set source_system = 'tango' where id = ${productoId}`,
    );

    assert.ok(motivo, 'un origen externo en un dato que nadie importó miente sobre su procedencia');
    assert.match(motivo, /entities_external_origin/);
  });

  it('la misma regla rige en aristas y en actividad', async () => {
    const enAristas = await rechazo(
      sql`update entity_relations set source = 'integration' where from_id = ${documentoId}`,
    );
    assert.ok(enAristas);
    assert.match(enAristas, /entity_relations_external_origin/);

    const enActividad = await rechazo(
      sql`update activity set source_system = 'tango' where entity_id = ${productoId}`,
    );
    assert.ok(enActividad);
    assert.match(enActividad, /activity_external_origin/);
  });

  it('la actividad ya no admite una procedencia inventada', async () => {
    // Antes de D-009 esta tabla no tenía ninguna restricción sobre `source`.
    const motivo = await rechazo(
      sql`update activity set source = 'importado' where entity_id = ${productoId}`,
    );

    assert.ok(motivo);
    assert.match(motivo, /activity_source_valid/);
  });

  it('completa, la procedencia externa entra en las tres tablas', async () => {
    for (const tabla of TABLAS) {
      const columna = tabla === 'activity' ? sql`entity_id` : sql`id`;
      const donde = tabla === 'entity_relations' ? sql`from_id` : columna;

      const motivo = await rechazo(sql`
        update ${sql.raw(tabla)}
           set source = 'integration',
               source_system = 'tango',
               source_read_at = now()
         where ${donde} = ${tabla === 'entity_relations' ? documentoId : productoId}
      `);

      assert.equal(motivo, null, `${tabla} rechazó una procedencia externa completa`);
    }
  });
});

describe('Lo válido sigue entrando', () => {
  it('un nodo inferido con su certeza', async () => {
    const inferido = await createEntity(scope, {
      type: 'product',
      slug: `producto-inferido-${marca}`,
      displayName: `Producto inferido ${marca}`,
      status: 'activo',
      provenance: { source: 'ai' },
      confidence: 0.8,
    });
    creado.push(inferido.id);

    assert.equal(inferido.source, 'ai');
    assert.equal(inferido.confidence, 0.8);
    assert.equal(inferido.sourceSystem, null, 'la IA no es un sistema externo');
  });

  it('un nodo traído de una integración, con su sistema y su fecha', async () => {
    const leidoEn = new Date('2026-08-05T10:00:00.000Z');

    const importado = await createEntity(scope, {
      type: 'product',
      slug: `producto-importado-${marca}`,
      displayName: `Producto importado ${marca}`,
      status: 'activo',
      provenance: { source: 'integration', sourceSystem: 'tango', sourceReadAt: leidoEn },
    });
    creado.push(importado.id);

    assert.equal(importado.source, 'integration');
    assert.equal(importado.sourceSystem, 'tango');
    // La fecha de lectura es lo que permite mostrar que el dato envejeció.
    assert.equal(importado.sourceReadAt?.toISOString(), leidoEn.toISOString());
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
