/**
 * restrictedCount: el número que evita que la plataforma mienta.
 *
 * Cuando alguien abre una entidad, ve sólo los vecinos que puede consultar. Sin
 * este número, la IA y la interfaz afirmarían que no hay nada más — cuando en
 * realidad hay algo que esa persona no está autorizada a ver. La diferencia
 * entre "no existe" y "no podés verlo" es la que sostiene la confianza.
 *
 * Se prueba contra una base real porque el número sale de comparar dos
 * consultas: la que filtra por permisos y la que no.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { inArray } from 'drizzle-orm';

import { createDatabase, entities, loadEnv, users, type Database } from '@nci/db';
import { ROLES } from '@nci/domain';

import { Actor, resolveCapabilities } from '../authorization/actor.js';
import type { Scope } from '../authorization/resolve.js';
import { createEntity } from './entities.js';
import { relate } from './relations.js';
import { getEntityUniverse } from './universe.js';

let db: Database | undefined;
let disponible = false;

/** Quien prepara el escenario: necesita ver y relacionar de los dos lados. */
let preparador: Scope;
/** Marketing: ve productos, no ve ventas. Es el caso del documento de roles. */
let marketing: Scope;

const marca = Date.now().toString(36);
const creado: string[] = [];

before(async () => {
  loadEnv();
  const url = process.env['DATABASE_URL'];
  if (!url) return;

  try {
    db = createDatabase({ url, max: 1 });
    await db.execute('select 1');
  } catch {
    return;
  }

  const [usuario] = await db.select({ id: users.id }).from(users).limit(1);
  if (!usuario) return;

  disponible = true;

  preparador = {
    db,
    actor: new Actor({
      id: usuario.id,
      fullName: 'Preparador',
      roles: [],
      capabilities: resolveCapabilities({
        fromRoles: ['products.product.admin', 'sales.sale.admin', 'executive.financials.read'],
      }),
    }),
  };

  marketing = {
    db,
    actor: new Actor({
      id: usuario.id,
      fullName: 'Marketing',
      roles: ['marketing'],
      capabilities: resolveCapabilities({ fromRoles: ROLES.marketing.capabilities }),
    }),
  };
});

after(async () => {
  if (db && creado.length > 0) {
    await db.delete(entities).where(inArray(entities.id, creado)).catch(() => {});
  }
  if (db) await db.$client.end().catch(() => {});
});

async function crear(scope: Scope, entrada: Parameters<typeof createEntity>[1]) {
  const entidad = await createEntity(scope, entrada);
  creado.push(entidad.id);
  return entidad;
}

describe('restrictedCount refleja lo que el permiso oculta', () => {
  it('cuenta los vecinos que la persona no puede ver, sin revelarlos', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    // Un producto que Marketing sí puede ver.
    const producto = await crear(preparador, {
      type: 'product',
      slug: `producto-restringido-${marca}`,
      displayName: `Producto restringido ${marca}`,
      status: 'activo',
    });

    // Y dos ventas relacionadas. Una venta está clasificada como financiera:
    // Marketing no tiene executive.financials.read, así que no las ve.
    for (const n of [1, 2]) {
      const venta = await crear(preparador, {
        type: 'sale',
        slug: `venta-restringida-${marca}-${n}`,
        displayName: `Venta ${marca}-${n}`,
        status: 'facturada',
      });
      await relate(preparador, {
        type: 'includes_product',
        fromId: venta.id,
        toId: producto.id,
      });
    }

    // Quien sí puede verlas, las ve.
    const completo = await getEntityUniverse(preparador, producto.id);
    const vecinosCompletos = completo.sections.flatMap((s) => s.nodes);
    assert.equal(vecinosCompletos.length, 2, 'el preparador ve las dos ventas');
    assert.equal(completo.restrictedCount, 0, 'no hay nada oculto para quien puede verlo todo');

    // Marketing no las ve, pero sabe que existen.
    const parcial = await getEntityUniverse(marketing, producto.id);
    const vecinosVisibles = parcial.sections.flatMap((s) => s.nodes);

    assert.equal(vecinosVisibles.length, 0, 'Marketing no ve ninguna venta');
    assert.equal(parcial.restrictedCount, 2, 'pero el sistema le informa que hay dos');
  });

  it('no filtra nada sobre los elementos restringidos', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const producto = await crear(preparador, {
      type: 'product',
      slug: `producto-secreto-${marca}`,
      displayName: `Producto secreto ${marca}`,
      status: 'activo',
    });

    const venta = await crear(preparador, {
      type: 'sale',
      slug: `venta-secreta-${marca}`,
      displayName: `Venta confidencial ${marca}`,
      status: 'facturada',
    });
    await relate(preparador, { type: 'includes_product', fromId: venta.id, toId: producto.id });

    const parcial = await getEntityUniverse(marketing, producto.id);
    const serializado = JSON.stringify(parcial);

    assert.equal(parcial.restrictedCount, 1);
    assert.ok(
      !serializado.includes('Venta confidencial'),
      'el nombre de lo restringido no puede aparecer en ninguna parte de la respuesta',
    );
    assert.ok(!serializado.includes(venta.id), 'ni su identificador');
  });

  it('un producto sin vecinos ocultos informa cero', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const producto = await crear(preparador, {
      type: 'product',
      slug: `producto-abierto-${marca}`,
      displayName: `Producto abierto ${marca}`,
      status: 'activo',
    });

    const universo = await getEntityUniverse(marketing, producto.id);
    assert.equal(universo.restrictedCount, 0);
  });
});
