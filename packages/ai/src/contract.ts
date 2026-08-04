/**
 * El contrato de respuesta de la IA.
 *
 * "Primero responder. Segundo explicar. Tercero justificar. Cuarto proponer
 *  acciones. Nunca al revés."
 *
 * El orden no se pide en el prompt: se impone con un esquema. La API sólo puede
 * devolver esta forma, así que una respuesta sin justificación o sin fuentes no
 * es posible — no es que sea improbable.
 *
 * Ver: 7. Product Design Language, principios 4 y 14.
 */

import type { EntityTypeId } from '@nci/domain';

/** De dónde salió cada afirmación. El PDL prohíbe la caja negra. */
export interface AnswerSource {
  readonly entityId: string;
  readonly entityType: EntityTypeId;
  readonly displayName: string;
  /** Cuándo se actualizó por última vez. Una fuente vieja se muestra como vieja. */
  readonly updatedAt: string;
}

export interface ProposedAction {
  readonly label: string;
  /** Por qué esta acción y no otra. */
  readonly rationale: string;
  /** La capacidad que hace falta. Si el usuario no la tiene, no se le ofrece. */
  readonly requiresCapability?: string;
}

export interface AiAnswer {
  /** 1. La respuesta. Directa, sin preámbulo. */
  readonly answer: string;
  /** 2. La explicación. Qué significa, en contexto. */
  readonly explanation: string;
  /** 3. La justificación. Con qué información se llegó a eso. */
  readonly justification: string;
  /** 4. Las acciones posibles. Nunca obligatorias. */
  readonly proposedActions: readonly ProposedAction[];
  readonly sources: readonly AnswerSource[];
  /**
   * Confianza declarada.
   * 'alta' — la información alcanza y está vigente.
   * 'media' — alcanza, pero es parcial o no está actualizada.
   * 'baja' — se responde con lo que hay y se dice que no alcanza.
   */
  readonly confidence: 'alta' | 'media' | 'baja';
  /**
   * Qué información falta para responder mejor.
   *
   * "No encontré nada" no es una respuesta aceptable. Cuando el sistema no
   * sabe, lo dice y propone cómo obtener la información.
   */
  readonly missingInformation: string | null;
}

/**
 * El esquema con el que la API valida la respuesta.
 *
 * Sin `additionalProperties: false` y sin `required` completo, los outputs
 * estructurados no garantizan nada.
 */
export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      description:
        'La respuesta directa a la pregunta, sin preámbulo. Sin emojis. Sin felicitar al usuario.',
    },
    explanation: {
      type: 'string',
      description: 'Qué significa la respuesta en el contexto de la empresa.',
    },
    justification: {
      type: 'string',
      description:
        'Con qué información concreta se llegó a esa respuesta. Nombrar los datos, no describirlos vagamente.',
    },
    proposedActions: {
      type: 'array',
      description:
        'Acciones que el usuario podría tomar. Vacío si no hay ninguna que aporte valor.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          rationale: { type: 'string' },
          requiresCapability: { type: 'string' },
        },
        required: ['label', 'rationale'],
        additionalProperties: false,
      },
    },
    sources: {
      type: 'array',
      description: 'Los elementos del contexto que se usaron. Sólo los que realmente se usaron.',
      items: {
        type: 'object',
        properties: {
          entityId: { type: 'string' },
          entityType: { type: 'string' },
          displayName: { type: 'string' },
          updatedAt: { type: 'string' },
        },
        required: ['entityId', 'entityType', 'displayName', 'updatedAt'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
    missingInformation: {
      type: ['string', 'null'],
      description:
        'Qué información falta para responder mejor, y cómo obtenerla. null cuando la información alcanza.',
    },
  },
  required: [
    'answer',
    'explanation',
    'justification',
    'proposedActions',
    'sources',
    'confidence',
    'missingInformation',
  ],
  additionalProperties: false,
} as const;
