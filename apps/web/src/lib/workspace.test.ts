/**
 * La presentación del indicador de comprometido.
 *
 * Es lógica pura: recibe el agregado por moneda y decide qué se muestra. La
 * parte que va a la base está probada aparte, contra PostgreSQL real.
 *
 * Lo que se verifica acá es la regla que dio origen a D-003: dos monedas no se
 * combinan nunca, ni siquiera en la presentación, porque no hay tipo de cambio
 * en el sistema y un número solo daría a entender que sí.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OpenQuoteTotals } from '@nci/sales';

import { comprometido } from './workspace.js';

function fila(currency: string, total: number, drafts = 1, awaiting = 0): OpenQuoteTotals {
  return { currency, total, drafts, awaiting };
}

describe('Con una sola moneda', () => {
  it('muestra el importe y el rótulo no la menciona', () => {
    const metric = comprometido([fila('ARS', 121_000)]);

    assert.equal(metric.label, 'Comprometido en presupuestos abiertos');
    assert.match(metric.value, /1\.210,00/);
  });

  it('el contexto separa lo que depende de cada uno', () => {
    // Principio 2 del PDL: un número solo no ayuda a decidir. Lo que importa
    // es cuánto espera una acción tuya y cuánto una respuesta del cliente.
    const metric = comprometido([fila('ARS', 121_000, 3, 5)]);

    assert.deepEqual(
      metric.context.map((linea) => [linea.label, linea.value]),
      [
        ['Sin enviar', '3'],
        ['Esperando respuesta', '5'],
      ],
    );
  });
});

describe('Con más de una moneda', () => {
  it('el rótulo avisa que hay más de una', () => {
    const metric = comprometido([fila('ARS', 121_000), fila('USD', 60_500)]);

    assert.match(metric.label, /por moneda/);
  });

  it('los importes van separados y ninguno absorbe al otro', () => {
    const metric = comprometido([fila('ARS', 121_000), fila('USD', 60_500)]);

    assert.match(metric.value, /1\.210,00/, 'el total en pesos, entero');
    assert.match(metric.value, /605,00/, 'el total en dólares, aparte');

    // La suma cruda daría 1.815,00. Que no aparezca es el punto: sin tipo de
    // cambio, ese número no significaría nada y parecería un total.
    assert.ok(!metric.value.includes('1.815,00'), 'las monedas no se suman');
  });

  it('los conteos sí se suman, porque contar presupuestos no depende de la moneda', () => {
    const metric = comprometido([fila('ARS', 121_000, 2, 1), fila('USD', 60_500, 1, 3)]);

    assert.equal(metric.context[0]?.value, '3', 'dos borradores más uno');
    assert.equal(metric.context[1]?.value, '4', 'uno esperando más tres');
  });
});
