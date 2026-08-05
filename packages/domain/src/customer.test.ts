/**
 * Las reglas de alta de un cliente.
 *
 * Son las mismas que ejecuta el navegador y las que ejecuta el servidor. Que
 * estén probadas acá y no en cada lado es la única forma de que no se separen.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeSameCustomer, validateCustomer } from './customer.js';

const problemasDe = (draft: Parameters<typeof validateCustomer>[0]) =>
  validateCustomer(draft).map((p) => p.field);

describe('Lo mínimo para dar de alta un cliente', () => {
  it('con nombre y un teléfono alcanza', () => {
    assert.deepEqual(validateCustomer({ legalName: 'Constructora del Litoral', phone: '3415551234' }), []);
  });

  it('con nombre y un correo también', () => {
    assert.deepEqual(validateCustomer({ legalName: 'Industrias del Sur', email: 'compras@sur.com' }), []);
  });

  it('con nombre y un WhatsApp también', () => {
    assert.deepEqual(validateCustomer({ legalName: 'Obras Paraná', whatsapp: '+5493415551234' }), []);
  });

  it('sin nombre no se puede', () => {
    assert.deepEqual(problemasDe({ legalName: '', phone: '341' }), ['legalName']);
    assert.deepEqual(problemasDe({ legalName: '  ', phone: '341' }), ['legalName']);
  });

  it('sin ningún canal de contacto tampoco', () => {
    assert.deepEqual(problemasDe({ legalName: 'Constructora del Litoral' }), ['contacto']);
  });

  it('informa todos los problemas juntos, no el primero', () => {
    // Corregir de a uno, reenviando el formulario cada vez para descubrir el
    // siguiente, es la forma más rápida de que alguien abandone.
    assert.deepEqual(problemasDe({ legalName: '' }), ['legalName', 'contacto']);
  });
});

describe('Lo que Tango necesita y NCI no', () => {
  it('CUIT, segmento y condición de pago nunca son obligatorios', () => {
    // Pedirlos antes de dejar trabajar es el reflejo de ERP que este producto
    // no copia. Ver D-013.
    assert.deepEqual(validateCustomer({ legalName: 'Cliente nuevo', phone: '341' }), []);
  });

  it('pero si se cargan, se validan', () => {
    assert.deepEqual(
      problemasDe({ legalName: 'Cliente', phone: '341', paymentTermsDays: 400 }),
      ['paymentTermsDays'],
    );
    assert.deepEqual(
      problemasDe({ legalName: 'Cliente', phone: '341', paymentTermsDays: -1 }),
      ['paymentTermsDays'],
    );
    assert.deepEqual(
      problemasDe({ legalName: 'Cliente', phone: '341', paymentTermsDays: 15.5 }),
      ['paymentTermsDays'],
    );
  });

  it('cero días es válido: es pago contra entrega', () => {
    assert.deepEqual(validateCustomer({ legalName: 'Cliente', phone: '341', paymentTermsDays: 0 }), []);
  });

  it('un correo mal escrito se marca por lo que es', () => {
    // Sólo "email", no también "falta un canal": el canal está, lo que está
    // mal es cómo se escribió. Decir las dos cosas manda a arreglar algo que
    // no está roto.
    assert.deepEqual(problemasDe({ legalName: 'Cliente', email: 'compras arroba sur' }), ['email']);
  });
});

describe('Detección de duplicados', () => {
  it('reconoce el mismo nombre escrito distinto', () => {
    assert.ok(looksLikeSameCustomer('Constructora del Litoral SA', 'Constructora del Litoral S.A.'));
    assert.ok(looksLikeSameCustomer('CONSTRUCTORA DEL LITORAL', 'constructora del litoral'));
    assert.ok(looksLikeSameCustomer('Obras Paraná', 'Obras Parana'));
  });

  it('reconoce uno contenido en el otro', () => {
    assert.ok(looksLikeSameCustomer('Industrias del Sur', 'Industrias del Sur SRL'));
  });

  it('no confunde dos clientes distintos', () => {
    assert.equal(looksLikeSameCustomer('Constructora del Litoral', 'Constructora del Norte'), false);
    assert.equal(looksLikeSameCustomer('Obras Paraná', 'Industrias del Sur'), false);
  });

  it('un nombre vacío no se parece a nada', () => {
    assert.equal(looksLikeSameCustomer('', 'Constructora'), false);
    assert.equal(looksLikeSameCustomer('S.A.', 'Constructora'), false);
  });
});
