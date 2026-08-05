/**
 * El contrato de respuesta.
 *
 * El esquema es lo único que garantiza que una respuesta traiga justificación,
 * fuentes y confianza. Si se degrada, la IA vuelve a poder devolver una
 * afirmación sin respaldo — que es exactamente lo que el PDL prohíbe.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ANSWER_SCHEMA, type AiAnswer } from './contract.js';

// ─────────────────────────────────────────────────────────────────────────
// Validador del subconjunto de JSON Schema que usa el contrato.
//
// Se escribe acá a propósito: comprobar el esquema con la misma biblioteca que
// lo construye no probaría nada. Esto verifica de forma independiente que el
// esquema acepta lo que debe y rechaza lo que no.
// ─────────────────────────────────────────────────────────────────────────

type Schema = Record<string, unknown>;

function validate(schema: Schema, value: unknown, path = 'raíz'): string[] {
  const errors: string[] = [];
  const tipos = Array.isArray(schema['type']) ? (schema['type'] as string[]) : [schema['type']];

  const coincideTipo = tipos.some((tipo) => {
    if (tipo === 'null') return value === null;
    if (tipo === 'array') return Array.isArray(value);
    if (tipo === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
    return typeof value === tipo;
  });

  if (!coincideTipo) {
    return [`${path}: se esperaba ${tipos.join(' o ')} y llegó ${value === null ? 'null' : typeof value}`];
  }

  if (schema['enum'] && !(schema['enum'] as unknown[]).includes(value)) {
    errors.push(`${path}: "${String(value)}" no está entre los valores permitidos`);
  }

  if (tipos.includes('object') && typeof value === 'object' && value !== null) {
    const props = (schema['properties'] ?? {}) as Record<string, Schema>;
    const required = (schema['required'] ?? []) as string[];
    const objeto = value as Record<string, unknown>;

    for (const clave of required) {
      if (!(clave in objeto)) errors.push(`${path}: falta el campo obligatorio "${clave}"`);
    }

    if (schema['additionalProperties'] === false) {
      for (const clave of Object.keys(objeto)) {
        if (!(clave in props)) errors.push(`${path}: campo no permitido "${clave}"`);
      }
    }

    for (const [clave, subesquema] of Object.entries(props)) {
      if (clave in objeto) errors.push(...validate(subesquema, objeto[clave], `${path}.${clave}`));
    }
  }

  if (tipos.includes('array') && Array.isArray(value)) {
    const items = schema['items'] as Schema | undefined;
    if (items) {
      value.forEach((item, i) => errors.push(...validate(items, item, `${path}[${i}]`)));
    }
  }

  return errors;
}

const esquema = ANSWER_SCHEMA as unknown as Schema;

/** Una respuesta que cumple el contrato, para partir de algo válido. */
function respuestaValida(): AiAnswer {
  return {
    answer: 'El stock de Concret D cubre 21 días.',
    explanation: 'Quedan 25 bidones y el consumo promedio es de 8 por semana.',
    justification: 'Calculado sobre los movimientos de los últimos 90 días.',
    proposedActions: [
      { label: 'Generar orden de compra', rationale: 'El proveedor entrega en 15 días.' },
    ],
    sources: [
      {
        entityId: '11111111-1111-1111-1111-111111111111',
        entityType: 'product',
        displayName: 'Concret D',
        updatedAt: '2026-08-04T12:00:00.000Z',
      },
    ],
    confidence: 'alta',
    missingInformation: null,
  };
}

describe('Forma del esquema', () => {
  it('exige los siete campos del contrato', () => {
    // Responder, explicar, justificar, proponer — más las tres cosas que
    // hacen verificable la respuesta.
    assert.deepEqual(esquema['required'], [
      'answer',
      'explanation',
      'justification',
      'proposedActions',
      'sources',
      'confidence',
      'missingInformation',
    ]);
  });

  it('todo campo obligatorio está declarado como propiedad', () => {
    const props = Object.keys(esquema['properties'] as object);
    for (const clave of esquema['required'] as string[]) {
      assert.ok(props.includes(clave), `"${clave}" es obligatorio pero no está definido`);
    }
  });

  it('no admite campos fuera del contrato', () => {
    assert.equal(esquema['additionalProperties'], false);
    const sources = (esquema['properties'] as Record<string, Schema>)['sources'] as Schema;
    assert.equal((sources['items'] as Schema)['additionalProperties'], false);
  });

  it('la confianza es un conjunto cerrado', () => {
    const confidence = (esquema['properties'] as Record<string, Schema>)['confidence'] as Schema;
    assert.deepEqual(confidence['enum'], ['alta', 'media', 'baja']);
  });

  it('cada fuente identifica la entidad y cuándo se actualizó', () => {
    const sources = (esquema['properties'] as Record<string, Schema>)['sources'] as Schema;
    assert.deepEqual((sources['items'] as Schema)['required'], [
      'entityId',
      'entityType',
      'displayName',
      'updatedAt',
    ]);
  });
});

describe('Una respuesta cumple el esquema', () => {
  it('acepta una respuesta completa', () => {
    assert.deepEqual(validate(esquema, respuestaValida()), []);
  });

  it('acepta missingInformation en null cuando la información alcanza', () => {
    assert.deepEqual(validate(esquema, { ...respuestaValida(), missingInformation: null }), []);
  });

  it('acepta missingInformation con texto cuando falta algo', () => {
    const respuesta = { ...respuestaValida(), missingInformation: 'No hay consumo cargado.' };
    assert.deepEqual(validate(esquema, respuesta), []);
  });

  it('acepta que no haya acciones propuestas', () => {
    assert.deepEqual(validate(esquema, { ...respuestaValida(), proposedActions: [] }), []);
  });
});

describe('El esquema rechaza lo que rompe el contrato', () => {
  it('rechaza una respuesta sin justificación', () => {
    const { justification, ...sinJustificar } = respuestaValida();
    void justification;
    const errores = validate(esquema, sinJustificar);
    assert.ok(errores.some((e) => e.includes('justification')), errores.join(' | '));
  });

  it('rechaza una respuesta sin fuentes declaradas', () => {
    const { sources, ...sinFuentes } = respuestaValida();
    void sources;
    assert.ok(validate(esquema, sinFuentes).some((e) => e.includes('sources')));
  });

  it('rechaza una confianza inventada', () => {
    const errores = validate(esquema, { ...respuestaValida(), confidence: 'altísima' });
    assert.ok(errores.some((e) => e.includes('confidence')), errores.join(' | '));
  });

  it('rechaza una fuente sin fecha de actualización', () => {
    const respuesta = {
      ...respuestaValida(),
      sources: [{ entityId: 'x', entityType: 'product', displayName: 'Concret D' }],
    };
    assert.ok(validate(esquema, respuesta).some((e) => e.includes('updatedAt')));
  });

  it('rechaza campos que el contrato no contempla', () => {
    const respuesta = { ...respuestaValida(), certeza: 100 };
    assert.ok(validate(esquema, respuesta).some((e) => e.includes('certeza')));
  });

  it('rechaza una acción sin su fundamento', () => {
    const respuesta = { ...respuestaValida(), proposedActions: [{ label: 'Comprar' }] };
    assert.ok(validate(esquema, respuesta).some((e) => e.includes('rationale')));
  });
});
