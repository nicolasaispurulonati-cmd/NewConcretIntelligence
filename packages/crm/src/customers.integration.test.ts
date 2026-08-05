/**
 * El alta de un cliente, contra una base real.
 *
 * Lo que se verifica acá es lo que no se puede verificar sin base: que un
 * cliente creado con dos campos quede consultable, que la detección de
 * duplicados encuentre lo que hay, y que no bloquee.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { inArray } from 'drizzle-orm';

import { Actor, ValidationError, resolveCapabilities, type Scope } from '@nci/core';
import { createDatabase, entities, requireDatabaseUrl, users, type Database } from '@nci/db';
import { ROLES } from '@nci/domain';

import { createCustomer, findSimilarCustomers, loadCustomer, setPaymentTerms } from './customers.js';

let db: Database | undefined;
let scope: Scope;

const marca = Date.now().toString(36);
const creado: string[] = [];

before(async () => {
  db = createDatabase({ url: requireDatabaseUrl(), max: 1 });
  await db.execute('select 1');

  const [usuario] = await db.select({ id: users.id }).from(users).limit(1);
  assert.ok(usuario, 'la base de pruebas necesita al menos un usuario');

  scope = {
    db,
    actor: new Actor({
      id: usuario.id,
      fullName: 'Comercial',
      roles: ['comercial'],
      capabilities: resolveCapabilities({ fromRoles: [...ROLES.comercial.capabilities] }),
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

async function alta(draft: Parameters<typeof createCustomer>[1]) {
  const cliente = await createCustomer(scope, draft);
  creado.push(cliente.entity.id);
  return cliente;
}

describe('Dar de alta un cliente', () => {
  it('con nombre y un teléfono, nada más', async () => {
    const cliente = await alta({
      legalName: `Constructora Mínima ${marca}`,
      phone: '3415551234',
    });

    assert.equal(cliente.entity.type, 'customer');
    assert.equal(cliente.entity.displayName, `Constructora Mínima ${marca}`);
    assert.equal(cliente.phone, '3415551234');

    // Lo que Tango necesita queda vacío y eso no impide nada.
    assert.equal(cliente.taxId, null);
    assert.equal(cliente.paymentTermsDays, null);
  });

  it('la procedencia queda en "user"', async () => {
    // Lo creó una persona, no una inferencia ni una integración. Es el valor
    // por defecto de la entidad y esta prueba lo sostiene.
    const cliente = await alta({ legalName: `Cliente Procedencia ${marca}`, phone: '341' });

    assert.equal(cliente.entity.source, 'user');
    assert.equal(cliente.entity.confidence, null);
  });

  it('queda consultable enseguida', async () => {
    const cliente = await alta({ legalName: `Cliente Consultable ${marca}`, email: 'a@b.com' });
    const leido = await loadCustomer(scope, cliente.entity.id);

    assert.equal(leido.entity.id, cliente.entity.id);
    assert.equal(leido.email, 'a@b.com');
  });

  it('sin canal de contacto se rechaza, con el motivo', async () => {
    let error: ValidationError | undefined;
    try {
      await alta({ legalName: `Cliente Sin Contacto ${marca}` });
    } catch (caught) {
      error = caught as ValidationError;
    }

    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /canal de contacto/);
    assert.match(error.reason, /correo, un teléfono o un WhatsApp/);
  });

  it('acepta los datos de Tango si se cargan', async () => {
    const cliente = await alta({
      legalName: `Cliente Completo ${marca}`,
      phone: '341',
      taxId: '30-12345678-9',
      segment: 'constructora',
      paymentTermsDays: 30,
    });

    assert.equal(cliente.taxId, '30-12345678-9');
    assert.equal(cliente.segment, 'constructora');
    assert.equal(cliente.paymentTermsDays, 30);
  });
});

describe('Duplicados: se sugieren, no se impiden', () => {
  it('encuentra un cliente parecido y lo marca como probable', async () => {
    await alta({ legalName: `Constructora del Litoral ${marca}`, phone: '341' });

    const parecidos = await findSimilarCustomers(scope, `Constructora del Litoral ${marca} S.A.`);

    assert.ok(parecidos.length > 0, 'tiene que encontrarlo');
    assert.ok(
      parecidos.some((p) => p.probablyTheSame),
      'y marcar que probablemente sea el mismo',
    );
  });

  it('deja crear el duplicado igual', async () => {
    // El vendedor sabe cosas que el sistema no: pueden ser dos sucursales.
    // Sospechar y bloquear es lo que lo manda de vuelta al cuaderno.
    const primero = await alta({ legalName: `Duplicado Permitido ${marca}`, phone: '341' });
    const segundo = await alta({ legalName: `Duplicado Permitido ${marca}`, phone: '342' });

    assert.notEqual(primero.entity.id, segundo.entity.id);
  });

  it('con un nombre nuevo no sugiere nada', async () => {
    // Sin la marca de la corrida: todos los clientes de esta prueba la llevan
    // en el nombre, así que incluirla haría que la búsqueda difusa los traiga
    // a todos y la prueba no verificaría nada.
    const parecidos = await findSimilarCustomers(scope, 'Zzzqxw Inexistente Absoluto');
    assert.deepEqual(parecidos, []);
  });

  it('no busca con menos de dos letras', async () => {
    assert.deepEqual(await findSimilarCustomers(scope, 'a'), []);
  });
});

describe('Completar la condición de pago después', () => {
  it('se puede cargar cuando haga falta', async () => {
    const cliente = await alta({ legalName: `Cliente Plazo ${marca}`, phone: '341' });
    assert.equal(cliente.paymentTermsDays, null);

    const actualizado = await setPaymentTerms(scope, cliente.entity.id, 30);
    assert.equal(actualizado.paymentTermsDays, 30);
  });

  it('rechaza un plazo imposible', async () => {
    const cliente = await alta({ legalName: `Cliente Plazo Malo ${marca}`, phone: '341' });

    await assert.rejects(() => setPaymentTerms(scope, cliente.entity.id, 400), ValidationError);
  });
});
