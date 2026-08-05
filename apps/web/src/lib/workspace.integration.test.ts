/**
 * Los indicadores del Workspace, contra una base real.
 *
 * El alcance es deliberadamente chico: los dos defectos que ya ocurrieron en
 * este archivo, y nada más. El widget de presupuestos sumaba los importes de
 * las seis filas que alcanzaba a listar y los rotulaba con la moneda de la
 * primera. Ninguno de los dos errores lo ve el compilador, y los dos llegaron
 * a la pantalla.
 *
 * No hay pruebas de componentes, de extremo a extremo ni de accesibilidad.
 * Eso es otra conversación.
 *
 * Corre con `npm run test:integracion`, que verifica el motor antes de empezar.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { inArray } from 'drizzle-orm';

import { Actor, createEntity, resolveCapabilities, type Scope } from '@nci/core';
import {
  createDatabase,
  customers,
  entities,
  requireDatabaseUrl,
  userRoles,
  users,
  type Database,
} from '@nci/db';
import { ROLES } from '@nci/domain';
import { addQuoteItem, createQuote } from '@nci/sales';

import { loadWorkspace } from './workspace.js';

/**
 * Cuántos presupuestos abiertos crea la primera prueba.
 *
 * El widget lista seis. Ocho no entran, que es exactamente la condición bajo
 * la cual el cálculo anterior empezaba a mentir sin ninguna señal.
 */
const ABIERTOS = 8;

let db: Database | undefined;

const marca = Date.now().toString(36);
const entidades: string[] = [];
const vendedores: string[] = [];

before(async () => {
  db = createDatabase({ url: requireDatabaseUrl(), max: 1 });
  await db.execute('select 1');
});

after(async () => {
  if (!db) return;
  if (entidades.length > 0) {
    await db.delete(entities).where(inArray(entities.id, entidades)).catch(() => {});
  }
  if (vendedores.length > 0) {
    await db.delete(users).where(inArray(users.id, vendedores)).catch(() => {});
  }
  await db.$client.end().catch(() => {});
});

/**
 * Un vendedor recién creado, con su propio escritorio.
 *
 * Uno por prueba y no uno compartido: el widget filtra por dueño, así que con
 * un usuario común los presupuestos de la prueba anterior entrarían en la
 * cuenta de la siguiente y las tres medirían cualquier cosa.
 */
async function nuevoVendedor(sufijo: string): Promise<Scope> {
  const [vendedor] = await db!
    .insert(users)
    .values({
      email: `workspace-${sufijo}-${marca}@prueba.local`,
      fullName: `Vendedor ${sufijo}`,
      status: 'active',
    })
    .returning({ id: users.id });

  vendedores.push(vendedor!.id);
  await db!.insert(userRoles).values({ userId: vendedor!.id, roleId: 'comercial' });

  return {
    db: db!,
    actor: new Actor({
      id: vendedor!.id,
      fullName: `Vendedor ${sufijo}`,
      roles: ['comercial'],
      capabilities: resolveCapabilities({ fromRoles: [...ROLES.comercial.capabilities] }),
    }),
  };
}

/** Un cliente con condición de pago, que es lo que habilita cotizarle. */
async function nuevoCliente(scope: Scope, sufijo: string): Promise<string> {
  const cliente = await createEntity(scope, {
    type: 'customer',
    slug: `cliente-workspace-${sufijo}-${marca}`,
    displayName: `Cliente workspace ${sufijo} ${marca}`,
    status: 'activo',
  });
  entidades.push(cliente.id);
  await scope.db.insert(customers).values({ entityId: cliente.id, paymentTermsDays: 30 });
  return cliente.id;
}

/** Un presupuesto en borrador por el importe indicado. */
async function presupuestoAbierto(
  scope: Scope,
  customerId: string,
  unitPrice: number,
  currency?: string,
): Promise<void> {
  const presupuesto = await createQuote(scope, {
    customerId,
    ...(currency ? { currency } : {}),
  });
  entidades.push(presupuesto.entity.id);
  await addQuoteItem(scope, presupuesto.entity.id, {
    description: 'Concret D',
    quantity: 1,
    unitPrice,
  });
}

/** El widget de presupuestos del escritorio de esta persona. */
async function widgetDePresupuestos(scope: Scope) {
  const { widgets } = await loadWorkspace(scope);
  const widget = widgets.find((w) => w.id === 'sales.my_quotes');
  assert.ok(widget, 'el escritorio del rol Comercial tiene que traer sus presupuestos');
  return widget;
}

describe('Comprometido en presupuestos abiertos', () => {
  it('cuenta el conjunto completo y no las filas que muestra la lista', async () => {
    const scope = await nuevoVendedor('conjunto');
    const customerId = await nuevoCliente(scope, 'conjunto');

    for (let i = 0; i < ABIERTOS; i += 1) {
      await presupuestoAbierto(scope, customerId, 10_000);
    }

    const widget = await widgetDePresupuestos(scope);

    assert.ok(widget.metric, 'con presupuestos abiertos tiene que haber indicador');

    // 10.000 más 21 % de IVA son 12.100 por presupuesto. Ocho dan 96.800.
    // Seis darían 72.600, que es lo que mostraba antes.
    assert.match(
      widget.metric.value,
      /968,00/,
      'el importe tiene que salir de los ocho, no de los seis que se listan',
    );

    const sinEnviar = widget.metric.context.find((c) => c.label === 'Sin enviar');
    assert.equal(sinEnviar?.value, String(ABIERTOS), 'el conteo también sale del conjunto completo');

    assert.equal(widget.lines?.length, 6, 'la lista sigue mostrando seis, que es su límite');
  });

  it('con más de una moneda las muestra por separado y lo dice en el rótulo', async () => {
    const scope = await nuevoVendedor('monedas');
    const customerId = await nuevoCliente(scope, 'monedas');

    await presupuestoAbierto(scope, customerId, 100_000);
    await presupuestoAbierto(scope, customerId, 50_000, 'USD');

    const widget = await widgetDePresupuestos(scope);

    assert.ok(widget.metric);
    assert.match(widget.metric.label, /por moneda/, 'el rótulo tiene que avisar que hay más de una');

    // Los dos importes aparecen enteros y sin combinarse. Sumarlos daría un
    // número que no significa nada: no hay tipo de cambio en el sistema.
    assert.match(widget.metric.value, /1\.210,00/, 'el total en pesos, entero');
    assert.match(widget.metric.value, /605,00/, 'el total en dólares, aparte');
  });

  it('con una sola moneda el rótulo no la menciona', async () => {
    const scope = await nuevoVendedor('simple');
    const customerId = await nuevoCliente(scope, 'simple');
    await presupuestoAbierto(scope, customerId, 25_000);

    const widget = await widgetDePresupuestos(scope);

    assert.ok(widget.metric);
    assert.equal(widget.metric.label, 'Comprometido en presupuestos abiertos');
  });
});
