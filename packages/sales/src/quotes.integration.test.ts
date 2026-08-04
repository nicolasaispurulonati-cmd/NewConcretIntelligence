/**
 * El ciclo de vida del presupuesto, contra una base real.
 *
 * Se salta solo si no hay base disponible: así `npm test` sigue sirviendo en
 * una máquina recién clonada, y las reglas se verifican de verdad cuando la
 * base está levantada.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Actor, ValidationError, createEntity, resolveCapabilities, type Scope } from '@nci/core';
import { createDatabase, customers, entities, loadEnv, users, type Database } from '@nci/db';
import { ROLES } from '@nci/domain';
import { inArray } from 'drizzle-orm';

import {
  acceptQuote,
  addQuoteItem,
  createNewVersion,
  createQuote,
  rejectQuote,
  sendQuote,
} from './quotes.js';

let db: Database | undefined;
let scope: Scope;
let disponible = false;

/** Sufijo único para que dos corridas no choquen entre sí. */
const marca = Date.now().toString(36);

before(async () => {
  loadEnv();
  const url = process.env['DATABASE_URL'];
  if (!url) return;

  try {
    db = createDatabase({ url, max: 1 });
    await db.execute('select 1');
    disponible = true;
  } catch {
    disponible = false;
    return;
  }

  // Toda entidad registra quién la creó, así que el actor de prueba tiene que
  // ser un usuario real. Se toma el primero que exista en la base.
  const [existente] = await db.select({ id: users.id }).from(users).limit(1);
  if (!existente) {
    disponible = false;
    return;
  }

  scope = {
    db,
    actor: new Actor({
      id: existente.id,
      fullName: 'Prueba Comercial',
      roles: ['comercial'],
      capabilities: resolveCapabilities({
        fromRoles: [...ROLES.comercial.capabilities, 'sales.quote.approve'],
      }),
    }),
  };
});

/**
 * Todo lo que la corrida creó, para poder borrarlo después.
 *
 * Una prueba que deja rastro convierte la base de desarrollo en un depósito de
 * clientes inventados, y el escritorio de quien esté trabajando se llena de
 * datos que no significan nada.
 */
const creado: string[] = [];

after(async () => {
  if (db && creado.length > 0) {
    // Las entidades se borran de verdad, no se archivan: nunca existieron
    // para el negocio. El borrado en cascada se lleva renglones y relaciones.
    await db.delete(entities).where(inArray(entities.id, creado)).catch(() => {});
  }
  if (db) await db.$client.end().catch(() => {});
});

/** Crea una entidad y la anota para limpiarla al terminar. */
async function crearTemporal(...args: Parameters<typeof createEntity>) {
  const entidad = await createEntity(...args);
  creado.push(entidad.id);
  return entidad;
}

/** Registra un presupuesto creado por el servicio, para limpiarlo también. */
function anotar<T extends { entity: { id: string } }>(quote: T): T {
  creado.push(quote.entity.id);
  return quote;
}


describe('Presupuesto: ciclo de vida', () => {
  it('no se emite a un cliente sin condición de pago', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const sinCondicion = await crearTemporal(scope, {
      type: 'customer',
      slug: `cliente-sin-condicion-${marca}`,
      displayName: `Cliente sin condición ${marca}`,
      status: 'activo',
    });
    await scope.db.insert(customers).values({ entityId: sinCondicion.id, paymentTermsDays: null });

    let error: ValidationError | undefined;
    try {
      anotar(await createQuote(scope, { customerId: sinCondicion.id }));
    } catch (caught) {
      error = caught as ValidationError;
    }

    assert.ok(error instanceof ValidationError, 'debería rechazarse');
    assert.match(error.message, /no tiene una condición de pago asignada/);
    assert.ok(error.actions.length > 0, 'el error tiene que ofrecer la acción que lo resuelve');
    assert.equal(error.actions[0]?.label, 'Configurar condición de pago');
  });

  it('recorre borrador → enviado → aceptado', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const cliente = await crearTemporal(scope, {
      type: 'customer',
      slug: `constructora-${marca}`,
      displayName: `Constructora ${marca}`,
      status: 'activo',
    });
    await scope.db.insert(customers).values({ entityId: cliente.id, paymentTermsDays: 30 });

    // Crear
    let presupuesto = anotar(await createQuote(scope, { customerId: cliente.id }));
    assert.equal(presupuesto.status, 'borrador');
    assert.equal(presupuesto.version, 1);
    assert.equal(presupuesto.paymentTermsDays, 30, 'copia la condición del cliente');
    assert.match(presupuesto.number, /^P-\d{4}-\d{4}$/);

    // No se puede enviar vacío
    let vacio: ValidationError | undefined;
    try {
      await sendQuote(scope, presupuesto.entity.id, 'correo');
    } catch (caught) {
      vacio = caught as ValidationError;
    }
    assert.match(String(vacio?.message), /no tiene renglones/);

    // Renglones
    presupuesto = await addQuoteItem(scope, presupuesto.entity.id, {
      description: 'Concret D · bidón 20 L',
      quantity: 10,
      unit: 'bidón',
      unitPrice: 15_000,
    });
    presupuesto = await addQuoteItem(scope, presupuesto.entity.id, {
      description: 'Flete',
      quantity: 1,
      unitPrice: 100_000,
      discountPercent: 10,
    });

    assert.equal(presupuesto.items.length, 2);
    assert.equal(presupuesto.subtotal, 250_000);
    assert.equal(presupuesto.discountTotal, 10_000);
    assert.equal(presupuesto.total, 290_400);

    // Enviar
    presupuesto = await sendQuote(scope, presupuesto.entity.id, 'whatsapp');
    assert.equal(presupuesto.status, 'enviado');
    assert.ok(presupuesto.sentAt, 'queda registrado cuándo se envió');
    assert.equal(presupuesto.sentVia, 'whatsapp');

    // Ya no se edita
    let bloqueado: ValidationError | undefined;
    try {
      await addQuoteItem(scope, presupuesto.entity.id, {
        description: 'Otro ítem',
        quantity: 1,
        unitPrice: 1_000,
      });
    } catch (caught) {
      bloqueado = caught as ValidationError;
    }
    assert.match(String(bloqueado?.message), /ya no se puede modificar/);
    assert.match(String(bloqueado?.reason), /como se envió/);

    // Aceptar
    presupuesto = await acceptQuote(scope, presupuesto.entity.id);
    assert.equal(presupuesto.status, 'aceptado');
  });

  it('el rechazo exige un motivo', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const cliente = await crearTemporal(scope, {
      type: 'customer',
      slug: `cliente-rechazo-${marca}`,
      displayName: `Cliente rechazo ${marca}`,
      status: 'activo',
    });
    await scope.db.insert(customers).values({ entityId: cliente.id, paymentTermsDays: 15 });

    let presupuesto = anotar(await createQuote(scope, { customerId: cliente.id }));
    presupuesto = await addQuoteItem(scope, presupuesto.entity.id, {
      description: 'Concret D',
      quantity: 1,
      unitPrice: 50_000,
    });
    presupuesto = await sendQuote(scope, presupuesto.entity.id, 'correo');

    let sinMotivo: ValidationError | undefined;
    try {
      await rejectQuote(scope, presupuesto.entity.id, '');
    } catch (caught) {
      sinMotivo = caught as ValidationError;
    }
    assert.match(String(sinMotivo?.message), /por qué se rechazó/);

    const rechazado = await rejectQuote(scope, presupuesto.entity.id, 'Precio por encima del competidor');
    assert.equal(rechazado.status, 'rechazado');
    assert.equal(rechazado.rejectionReason, 'Precio por encima del competidor');
  });

  it('una versión nueva copia los renglones y no toca la anterior', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const cliente = await crearTemporal(scope, {
      type: 'customer',
      slug: `cliente-version-${marca}`,
      displayName: `Cliente versión ${marca}`,
      status: 'activo',
    });
    await scope.db.insert(customers).values({ entityId: cliente.id, paymentTermsDays: 30 });

    let original = anotar(await createQuote(scope, { customerId: cliente.id }));
    original = await addQuoteItem(scope, original.entity.id, {
      description: 'Concret D',
      quantity: 4,
      unitPrice: 25_000,
    });
    original = await sendQuote(scope, original.entity.id, 'correo');

    const segunda = anotar(await createNewVersion(scope, original.entity.id));

    assert.equal(segunda.version, 2);
    assert.equal(segunda.status, 'borrador', 'la versión nueva nace editable');
    assert.equal(segunda.number, original.number, 'conserva el número de la negociación');
    assert.equal(segunda.items.length, original.items.length);
    assert.equal(segunda.total, original.total, 'arranca con los mismos importes');

    // El original queda intacto y sigue siendo consultable tal como se envió.
    const { loadQuote } = await import('./quotes.js');
    const revisado = await loadQuote(scope, original.entity.id);
    assert.equal(revisado.status, 'enviado');
    assert.equal(revisado.version, 1);
  });

  it('un estado final no admite más transiciones', async (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    const cliente = await crearTemporal(scope, {
      type: 'customer',
      slug: `cliente-final-${marca}`,
      displayName: `Cliente final ${marca}`,
      status: 'activo',
    });
    await scope.db.insert(customers).values({ entityId: cliente.id, paymentTermsDays: 30 });

    let presupuesto = anotar(await createQuote(scope, { customerId: cliente.id }));
    presupuesto = await addQuoteItem(scope, presupuesto.entity.id, {
      description: 'Concret D',
      quantity: 1,
      unitPrice: 10_000,
    });
    presupuesto = await sendQuote(scope, presupuesto.entity.id, 'correo');
    presupuesto = await acceptQuote(scope, presupuesto.entity.id);

    let cerrado: ValidationError | undefined;
    try {
      await rejectQuote(scope, presupuesto.entity.id, 'me arrepentí');
    } catch (caught) {
      cerrado = caught as ValidationError;
    }
    assert.match(String(cerrado?.reason), /estado final/);
  });
});

describe('Permisos del perfil comercial', () => {
  it('Comercial puede cotizar pero no tocar stock', (t) => {
    if (!disponible) return t.skip('sin base de datos disponible');

    assert.ok(scope.actor.canActOn('quote', 'create'));
    assert.ok(scope.actor.canActOn('customer', 'update'));
    assert.equal(scope.actor.canActOn('stock', 'update'), false);
    assert.equal(scope.actor.canActOn('purchase_order', 'create'), false);
  });
});

