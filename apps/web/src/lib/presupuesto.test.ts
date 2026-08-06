/**
 * La proyección del presupuesto hacia la pantalla.
 *
 * Dos cosas que no puede ver el compilador. Una: que sólo el borrador sea
 * editable, porque de eso depende que la pantalla no ofrezca cambiar algo que
 * el servidor va a rechazar. La otra: que la proyección no arrastre campos que
 * la pantalla no pidió, que es como una frontera se corre sin que nadie lo
 * decida.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Quote } from '@nci/sales';

import { comoVista, esEditable } from './presupuesto.js';

function presupuesto(status: string): Quote {
  return {
    entity: {
      id: 'una-entidad',
      slug: 'p-2026-0001',
      type: 'quote',
      displayName: 'P-2026-0001',
      subtitle: 'Constructora del Litoral',
      status,
      classification: 'internal',
      ownerId: 'alguien',
      source: 'user',
      sourceSystem: null,
      sourceReadAt: null,
      confidence: null,
      data: {},
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Quote['entity'],
    number: 'P-2026-0001',
    version: 1,
    currency: 'ARS',
    status,
    validUntil: null,
    paymentTermsDays: 30,
    subtotal: 200_000,
    discountTotal: 20_000,
    taxTotal: 37_800,
    total: 217_800,
    notes: null,
    issuedAt: null,
    sentAt: null,
    sentVia: null,
    rejectionReason: null,
    items: [
      {
        id: 'un-renglon',
        position: 0,
        description: 'Concret D',
        quantity: 2,
        unit: 'bidón',
        unitPrice: 100_000,
        discountPercent: 10,
        taxRate: 21,
        lineTotal: 180_000,
      },
    ],
  };
}

describe('Qué se puede editar', () => {
  it('sólo el borrador', () => {
    assert.equal(esEditable(comoVista(presupuesto('borrador'))), true);
  });

  it('emitido ya no, aunque nunca se haya enviado', () => {
    // Es lo que significa emitir. Si la pantalla lo dejara editar, el servidor
    // rechazaría el cambio y el usuario no entendería por qué.
    assert.equal(esEditable(comoVista(presupuesto('emitido'))), false);
  });

  it('ninguno de los estados posteriores', () => {
    for (const status of ['enviado', 'aceptado', 'rechazado', 'vencido']) {
      assert.equal(esEditable(comoVista(presupuesto(status))), false, status);
    }
  });
});

describe('Lo que cruza al navegador', () => {
  it('lleva los importes y el descuento de cada renglón', () => {
    const vista = comoVista(presupuesto('borrador'));

    assert.equal(vista.total, 217_800);
    assert.equal(vista.currency, 'ARS');
    assert.equal(vista.items[0]?.discountPercent, 10, 'el descuento por renglón se muestra');
    assert.equal(vista.items[0]?.lineTotal, 180_000);
  });

  it('no lleva la entidad ni nada que la pantalla no use', () => {
    const vista = comoVista(presupuesto('borrador'));

    assert.equal('entity' in vista, false);
    assert.equal('notes' in vista, false);
    assert.equal('rejectionReason' in vista, false);

    // El renglón tampoco arrastra su posición ni la variante cotizada.
    assert.deepEqual(Object.keys(vista.items[0]!).sort(), [
      'description',
      'discountPercent',
      'id',
      'lineTotal',
      'quantity',
      'taxRate',
      'unit',
      'unitPrice',
    ]);
  });

  it('conserva la moneda del presupuesto y no la del renglón', () => {
    // El renglón no tiene moneda propia y no puede tenerla (D-003). La vista
    // tampoco la inventa: hay una sola, y está arriba.
    const vista = comoVista(presupuesto('borrador'));

    assert.equal('currency' in vista.items[0]!, false);
  });
});
