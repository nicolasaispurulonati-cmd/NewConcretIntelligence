/**
 * El Product Design Language, verificado.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeStatus, describeStockCoverage } from './status.js';
import { formatRelativeTime, metric } from './metrics.js';
import { assertVoice, checkVoice } from './voice.js';

describe('Los estados siempre se explican (Principio 8)', () => {
  it('rechaza un estado sin etiqueta', () => {
    assert.throws(() => describeStatus({ label: '  ', detail: 'algo' }), /sólo con color/);
  });

  it('rechaza un estado que no explica nada', () => {
    assert.throws(() => describeStatus({ label: 'Disponible', detail: '' }), /siempre explica/);
  });

  it('produce la frase del documento para stock disponible', () => {
    const status = describeStockCoverage({ quantity: 32, unit: 'unidades', weeklyConsumption: 8 });
    assert.equal(status.label, 'Disponible');
    assert.equal(status.detail, '32 unidades. El consumo promedio cubre unos 28 días.');
    assert.equal(status.tone, 'ok');
  });

  it('marca como crítico lo que se agota en una semana', () => {
    const status = describeStockCoverage({ quantity: 5, unit: 'bidones', weeklyConsumption: 8 });
    assert.equal(status.label, 'Crítico');
    assert.match(status.detail, /cubre unos 4 días/);
  });

  it('no estima cobertura cuando no hay consumo', () => {
    const status = describeStockCoverage({ quantity: 40, unit: 'litros', weeklyConsumption: 0 });
    assert.equal(status.label, 'Sin rotación');
    assert.match(status.detail, /No hay consumo registrado/);
  });
});

describe('Las métricas nunca son un número solo (Principio 2)', () => {
  it('rechaza una métrica sin contexto', () => {
    assert.throws(
      () => metric({ label: 'Stock', value: '25', context: [] }),
      /no tiene contexto/,
    );
  });

  it('acepta una métrica con contexto', () => {
    const stock = metric({
      label: 'Stock',
      value: '25 unidades',
      context: [
        { label: 'Consumo promedio', value: '8 por semana' },
        { label: 'Cobertura estimada', value: '21 días' },
        { label: 'Última compra', value: 'Hace 15 días' },
      ],
    });
    assert.equal(stock.context.length, 3);
    assert.ok(stock.asOf instanceof Date);
  });
});

describe('El tiempo es visible y se lee como habla una persona (Principio 10)', () => {
  const now = new Date('2026-08-03T12:00:00Z');

  it('usa singular y plural correctamente', () => {
    assert.equal(formatRelativeTime(new Date('2026-08-03T11:00:00Z'), now), 'Hace una hora');
    assert.equal(formatRelativeTime(new Date('2026-08-03T10:00:00Z'), now), 'Hace 2 horas');
    assert.equal(formatRelativeTime(new Date('2026-08-02T12:00:00Z'), now), 'Ayer');
  });

  it('no usa abreviaturas de teléfono', () => {
    const rendered = formatRelativeTime(new Date('2026-08-03T09:00:00Z'), now);
    assert.ok(!/^\d+h$/.test(rendered), 'debería decir "Hace 3 horas", no "3h"');
  });
});

describe('La voz de la plataforma (Principio 1)', () => {
  it('rechaza el ejemplo incorrecto del documento', () => {
    const violations = checkVoice('¡Excelente! ¡Has creado un presupuesto increíble!');
    const rules = violations.map((violation) => violation.rule);
    assert.ok(rules.includes('Sin signos de exclamación'));
    assert.ok(rules.includes('Sin frases exageradas'));
  });

  it('acepta el ejemplo correcto del documento', () => {
    assert.deepEqual(checkVoice('Presupuesto generado correctamente.'), []);
  });

  it('rechaza emojis', () => {
    const violations = checkVoice('Stock disponible 🟢');
    assert.equal(violations[0]?.rule, 'Sin emojis');
  });

  it('rechaza errores que no enseñan (Principio 18)', () => {
    const violations = checkVoice('Error 500');
    assert.equal(violations[0]?.rule, 'El error enseña');
    assert.match(String(violations[0]?.suggestion), /condición de pago/);
  });

  it('acepta un error que sí enseña', () => {
    assertVoice(
      'No fue posible generar el presupuesto porque el cliente no tiene una condición de pago asignada.',
    );
  });

  it('acepta la respuesta de la IA del documento', () => {
    assertVoice(
      'Se recomienda comprar 20 bidones porque el consumo promedio de los últimos 90 días aumentó un 18 %, el stock actual cubre aproximadamente 10 días y el proveedor tiene un plazo habitual de entrega de 15 días.',
    );
  });

  it('acepta la respuesta correcta ante una búsqueda vacía', () => {
    assertVoice(
      'No encontré procedimientos relacionados con este producto. ¿Desea crear uno nuevo o ampliar la búsqueda a productos similares?',
    );
  });
});
