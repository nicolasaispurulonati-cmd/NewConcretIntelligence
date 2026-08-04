/**
 * La aritmética del dinero, contra los casos que realmente aparecen.
 *
 * Si algo de este archivo falla, hay un presupuesto mal calculado esperando a
 * llegarle a un cliente.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateLine, calculateQuote, formatMoney, parseMoney, roundCents } from './money.js';

describe('Redondeo', () => {
  it('redondea al centavo más cercano', () => {
    assert.equal(roundCents(100.4), 100);
    assert.equal(roundCents(100.5), 101);
    assert.equal(roundCents(100.6), 101);
  });

  it('trata los negativos con simetría', () => {
    // Math.round(-100.5) da -100, que rompe la simetría con +101.
    assert.equal(roundCents(-100.5), -101);
    assert.equal(roundCents(-100.4), -100);
  });
});

describe('Cálculo de un renglón', () => {
  it('cantidad por precio, con IVA', () => {
    // 10 unidades a $150,00 = $1.500,00 + 21% = $1.815,00
    const line = calculateLine({
      quantity: 10,
      unitPrice: 15_000,
      discountPercent: 0,
      taxRate: 21,
    });

    assert.equal(line.gross, 150_000);
    assert.equal(line.discount, 0);
    assert.equal(line.net, 150_000);
    assert.equal(line.tax, 31_500);
    assert.equal(line.total, 181_500);
  });

  it('aplica el descuento antes del IVA', () => {
    // El IVA se calcula sobre el neto: cobrar IVA sobre un descuento que no
    // se cobró sería cobrarle al cliente un impuesto inexistente.
    const line = calculateLine({
      quantity: 1,
      unitPrice: 100_000,
      discountPercent: 10,
      taxRate: 21,
    });

    assert.equal(line.discount, 10_000);
    assert.equal(line.net, 90_000);
    assert.equal(line.tax, 18_900, 'IVA sobre 90.000, no sobre 100.000');
    assert.equal(line.total, 108_900);
  });

  it('acepta cantidades con decimales', () => {
    // 2,5 litros a $1.234,56
    const line = calculateLine({
      quantity: 2.5,
      unitPrice: 123_456,
      discountPercent: 0,
      taxRate: 21,
    });

    assert.equal(line.gross, 308_640);
  });

  it('soporta IVA reducido', () => {
    const line = calculateLine({
      quantity: 1,
      unitPrice: 100_000,
      discountPercent: 0,
      taxRate: 10.5,
    });

    assert.equal(line.tax, 10_500);
  });

  it('no arrastra error al redondear en cascada', () => {
    // 3 unidades a $33,33 con 15% de descuento.
    // bruto 9.999 → descuento 1.500 (redondeado) → neto 8.499
    const line = calculateLine({
      quantity: 3,
      unitPrice: 3_333,
      discountPercent: 15,
      taxRate: 21,
    });

    assert.equal(line.gross, 9_999);
    assert.equal(line.discount, 1_500);
    assert.equal(line.net, 8_499);
    assert.equal(line.net + line.discount, line.gross, 'neto y descuento deben reconstruir el bruto');
  });
});

describe('Total del presupuesto', () => {
  it('suma los renglones ya redondeados', () => {
    const amounts = calculateQuote([
      { quantity: 10, unitPrice: 15_000, discountPercent: 0, taxRate: 21 },
      { quantity: 1, unitPrice: 100_000, discountPercent: 10, taxRate: 21 },
    ]);

    assert.equal(amounts.subtotal, 250_000);
    assert.equal(amounts.discountTotal, 10_000);
    assert.equal(amounts.taxTotal, 50_400);
    assert.equal(amounts.total, 290_400);
  });

  it('el total cierra con la suma de sus partes', () => {
    const lines = [
      { quantity: 7, unitPrice: 3_333, discountPercent: 13, taxRate: 21 },
      { quantity: 2.75, unitPrice: 89_990, discountPercent: 5, taxRate: 10.5 },
      { quantity: 1, unitPrice: 1, discountPercent: 0, taxRate: 21 },
    ];
    const amounts = calculateQuote(lines);

    // Es la comprobación que hace un contador: neto + IVA = total.
    assert.equal(
      amounts.subtotal - amounts.discountTotal + amounts.taxTotal,
      amounts.total,
      'subtotal menos descuentos más IVA tiene que dar el total',
    );
  });

  it('un presupuesto sin renglones vale cero', () => {
    const amounts = calculateQuote([]);
    assert.deepEqual(amounts, { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 });
  });
});

describe('Presentación', () => {
  it('formatea en pesos argentinos', () => {
    const formatted = formatMoney(125_000);
    assert.match(formatted, /1\.250,00/);
    assert.match(formatted, /\$/);
  });

  it('lee lo que escribe una persona', () => {
    assert.equal(parseMoney('1.250,50'), 125_050);
    assert.equal(parseMoney('$ 1.250,50'), 125_050);
    assert.equal(parseMoney('1250'), 125_000);
    assert.equal(parseMoney('no es un número'), null);
  });

  it('lo formateado se puede volver a leer', () => {
    for (const cents of [0, 1, 99, 100, 123_456, 999_999_99]) {
      assert.equal(parseMoney(formatMoney(cents)), cents, `falla con ${cents}`);
    }
  });
});
