/**
 * La fecha de validez.
 *
 * Es un cálculo de tres líneas y aun así tiene dos trampas que ya mordieron a
 * otros sistemas: el cambio de mes y el huso horario. Las dos están cubiertas.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QUOTE_VALIDITY_DAYS, validUntilFrom } from './quote-validity.js';

describe('Hasta cuándo vale', () => {
  it('son treinta días, decididos por la empresa', () => {
    // Si alguien cambia el número, que sea una decisión y no un descuido: esta
    // prueba lo obliga a pasar por acá. Ver D-017.
    assert.equal(QUOTE_VALIDITY_DAYS, 30);
  });

  it('suma los días a la fecha de emisión', () => {
    assert.equal(validUntilFrom(new Date(2026, 7, 6, 10, 0)), '2026-09-05');
  });

  it('cruza el fin de mes sin ayuda', () => {
    assert.equal(validUntilFrom(new Date(2026, 0, 20, 10, 0)), '2026-02-19');
  });

  it('cruza el fin de año', () => {
    assert.equal(validUntilFrom(new Date(2026, 11, 20, 10, 0)), '2027-01-19');
  });

  it('sabe que 2028 es bisiesto', () => {
    // Febrero de 2028 tiene 29 días. Sumar 30 desde el 5 cae en el 6 de marzo.
    assert.equal(validUntilFrom(new Date(2028, 1, 5, 10, 0)), '2028-03-06');
  });

  it('usa la fecha local y no la UTC', () => {
    // Un presupuesto emitido a las 21 de Buenos Aires ya es del día siguiente
    // en UTC. Si el cálculo fuera en UTC, el documento prometería un día más
    // del que el vendedor entiende que dio.
    const tarde = new Date(2026, 7, 6, 21, 30);

    assert.equal(validUntilFrom(tarde), '2026-09-05');
    assert.notEqual(validUntilFrom(tarde), '2026-09-06');
  });

  it('acepta otro plazo sin volverlo el valor por defecto', () => {
    // El parámetro existe para poder probar el cálculo, no para que cada
    // presupuesto elija el suyo. Que el defecto siga siendo el de la empresa
    // es parte de la decisión.
    assert.equal(validUntilFrom(new Date(2026, 7, 6, 10, 0), 7), '2026-08-13');

    // `length` cuenta los parámetros hasta el primero con valor por defecto:
    // que sea 1 es la prueba de que el plazo de la empresa se aplica solo.
    assert.equal(validUntilFrom.length, 1);
  });
});
