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

import { LISTA_MAXIMA, loadWorkspace } from './workspace.js';

/**
 * Cuántos presupuestos abiertos crea la prueba del seam.
 *
 * Se deriva del límite de la lista y no es un número escrito a mano. Si mañana
 * la lista muestra diez y acá quedara un ocho fijo, el escenario dejaría de
 * distinguir entre las dos fuentes posibles del indicador y la prueba seguiría
 * en verde sin probar nada. La discriminación tiene que sobrevivir a que ese
 * límite cambie.
 */
const ABIERTOS = LISTA_MAXIMA + 2;

/** El importe de los que quedan fuera de la ventana visible. */
const FUERA_DE_LA_LISTA = 777_00;
/** El importe de los que sí se listan. */
const EN_LA_LISTA = 10_000;

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
  /**
   * La prueba del cable.
   *
   * El defecto original nunca fue el cálculo: fue de dónde tomaba los datos.
   * Por eso no alcanza con verificar que el número sea correcto — hay que
   * construir un escenario en el que las dos fuentes posibles den resultados
   * distintos, y comprobar que el que llega a la interfaz es el de la base.
   *
   * Los dos presupuestos más viejos quedan fuera de la ventana que se lista y
   * llevan un importe distinto. Si el indicador se alimentara de las filas
   * visibles, ese importe no aparecería en el total.
   */
  it('el indicador se alimenta del agregado y no de las filas que muestra', async () => {
    const scope = await nuevoVendedor('conjunto');
    const customerId = await nuevoCliente(scope, 'conjunto');

    // Primero los que van a quedar fuera: la lista ordena por más reciente.
    await presupuestoAbierto(scope, customerId, FUERA_DE_LA_LISTA);
    await presupuestoAbierto(scope, customerId, FUERA_DE_LA_LISTA);

    for (let i = 0; i < LISTA_MAXIMA; i += 1) {
      await presupuestoAbierto(scope, customerId, EN_LA_LISTA);
    }

    const widget = await widgetDePresupuestos(scope);

    assert.ok(widget.metric, 'con presupuestos abiertos tiene que haber indicador');
    assert.equal(widget.lines?.length, LISTA_MAXIMA, 'la lista muestra su límite y nada más');

    const conIva = (centavos: number) => Math.round(centavos * 1.21);
    const todos = 2 * conIva(FUERA_DE_LA_LISTA) + LISTA_MAXIMA * conIva(EN_LA_LISTA);
    const soloLosVisibles = LISTA_MAXIMA * conIva(EN_LA_LISTA);

    const importe = (centavos: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(centavos / 100);

    assert.equal(widget.metric.value, importe(todos), 'el valor tiene que ser el del conjunto');
    assert.notEqual(
      widget.metric.value,
      importe(soloLosVisibles),
      'y no puede coincidir con el que darían las filas visibles: ahí está el cable',
    );

    const sinEnviar = widget.metric.context.find((c) => c.label === 'Sin enviar');
    assert.equal(sinEnviar?.value, String(ABIERTOS), 'el conteo también sale del conjunto completo');
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
