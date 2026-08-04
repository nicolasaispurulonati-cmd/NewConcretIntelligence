/**
 * Las aristas del grafo de conocimiento.
 *
 * "No quiero que NewConcret Intelligence sea una colección de pantallas.
 *  Quiero que sea un grafo de conocimiento empresarial."
 *
 * Una relación es explícita, tipada y bidireccional: se guarda una vez y se
 * recorre en los dos sentidos, cada uno con su propia etiqueta. Eso es lo que
 * permite abrir Concret D y ver su universo completo sin importar desde qué
 * área se entró, y lo que le da a la IA contexto en lugar de coincidencias.
 *
 * Ver: 4. Domain Model — "El centro deben ser las entidades".
 */

import type { EntityTypeId } from './entity-types.js';

export const RELATION_TYPE_IDS = [
  'documents',
  'explains',
  'demonstrates',
  'answers_about',
  'belongs_to',
  'variant_of',
  'stocked_as',
  'stored_in',
  'affects',
  'supplied_by',
  'ordered_in',
  'received_in',
  'works_at',
  'located_at',
  'quoted_to',
  'sold_to',
  'includes_product',
  'reported_by',
  'diagnosed_in',
  'covers',
  'teaches',
  'certifies',
  'promotes',
  'about',
  'derived_from',
  'supersedes',
  'related_to',
] as const;

export type RelationTypeId = (typeof RELATION_TYPE_IDS)[number];

export type RelationCardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';

export interface RelationTypeDefinition {
  readonly id: RelationTypeId;
  /** Cómo se lee desde el origen: "Concret D · documentado por · Ficha técnica". */
  readonly label: string;
  /** Cómo se lee desde el destino. */
  readonly inverseLabel: string;
  readonly from: readonly EntityTypeId[];
  readonly to: readonly EntityTypeId[];
  readonly cardinality: RelationCardinality;
  /**
   * La relación significa lo mismo en ambos sentidos. Se guarda una sola fila y
   * el motor la devuelve desde cualquiera de los dos extremos.
   */
  readonly symmetric: boolean;
  /**
   * La IA la recorre al construir contexto. Se apaga en relaciones de alto
   * volumen y bajo valor semántico, para que el contexto no se llene de ruido.
   */
  readonly traversedByAi: boolean;
}

function relation(
  id: RelationTypeId,
  label: string,
  inverseLabel: string,
  from: readonly EntityTypeId[],
  to: readonly EntityTypeId[],
  options: Partial<Pick<RelationTypeDefinition, 'cardinality' | 'symmetric' | 'traversedByAi'>> = {},
): RelationTypeDefinition {
  return {
    id,
    label,
    inverseLabel,
    from,
    to,
    cardinality: options.cardinality ?? 'many-to-many',
    symmetric: options.symmetric ?? false,
    traversedByAi: options.traversedByAi ?? true,
  };
}

const KNOWLEDGE_SUBJECTS: readonly EntityTypeId[] = [
  'product',
  'variant',
  'category',
  'procedure',
  'technical_case',
  'course',
  'customer',
  'supplier',
  'ticket',
  'project',
];

export const RELATION_TYPES: { readonly [K in RelationTypeId]: RelationTypeDefinition } = {
  // ── Knowledge hacia el resto del negocio ───────────────────────────────
  documents: relation('documents', 'Documenta', 'Documentado por', ['document'], KNOWLEDGE_SUBJECTS),
  explains: relation('explains', 'Explica cómo trabajar con', 'Tiene procedimiento', ['procedure'], [
    'product',
    'variant',
    'warehouse',
    'course',
  ]),
  demonstrates: relation('demonstrates', 'Muestra', 'Tiene video', ['video'], KNOWLEDGE_SUBJECTS),
  answers_about: relation('answers_about', 'Responde sobre', 'Tiene preguntas frecuentes', ['faq'], [
    'product',
    'variant',
    'procedure',
    'course',
  ]),

  // ── Productos ──────────────────────────────────────────────────────────
  belongs_to: relation(
    'belongs_to',
    'Pertenece a',
    'Contiene',
    ['product', 'category', 'contact', 'project'],
    ['category', 'customer'],
    { cardinality: 'one-to-many' },
  ),
  variant_of: relation('variant_of', 'Es variante de', 'Tiene variantes', ['variant'], ['product'], {
    cardinality: 'one-to-many',
  }),

  // ── Inventario ─────────────────────────────────────────────────────────
  stocked_as: relation('stocked_as', 'Tiene stock', 'Es stock de', ['variant'], ['stock'], {
    cardinality: 'one-to-many',
  }),
  stored_in: relation('stored_in', 'Se almacena en', 'Almacena', ['stock'], ['warehouse'], {
    cardinality: 'one-to-many',
    traversedByAi: false,
  }),
  affects: relation('affects', 'Modifica', 'Modificado por', ['movement'], ['stock'], {
    cardinality: 'one-to-many',
    traversedByAi: false,
  }),

  // ── Compras ────────────────────────────────────────────────────────────
  supplied_by: relation('supplied_by', 'Provisto por', 'Provee', ['product', 'variant'], ['supplier']),
  ordered_in: relation(
    'ordered_in',
    'Se compra en',
    'Incluye',
    ['variant'],
    ['purchase_order'],
  ),
  received_in: relation(
    'received_in',
    'Recibido en',
    'Recibe',
    ['purchase_order'],
    ['goods_receipt'],
    { cardinality: 'one-to-many' },
  ),

  // ── Personas ───────────────────────────────────────────────────────────
  works_at: relation('works_at', 'Trabaja en', 'Tiene contactos', ['contact'], ['customer', 'supplier'], {
    cardinality: 'one-to-many',
  }),
  located_at: relation('located_at', 'Se ejecuta en', 'Tiene obras', ['project'], ['customer'], {
    cardinality: 'one-to-many',
  }),

  // ── Comercial ──────────────────────────────────────────────────────────
  quoted_to: relation('quoted_to', 'Presupuestado a', 'Tiene presupuestos', ['quote'], [
    'customer',
    'project',
    'opportunity',
  ]),
  sold_to: relation('sold_to', 'Vendido a', 'Tiene ventas', ['sale'], ['customer', 'project']),
  includes_product: relation(
    'includes_product',
    'Incluye',
    'Figura en',
    ['quote', 'sale', 'campaign'],
    ['product', 'variant'],
  ),

  // ── Soporte ────────────────────────────────────────────────────────────
  reported_by: relation('reported_by', 'Reportado por', 'Reportó', ['ticket'], ['customer', 'contact'], {
    cardinality: 'one-to-many',
  }),
  diagnosed_in: relation('diagnosed_in', 'Diagnostica', 'Tiene diagnóstico', ['diagnosis'], ['ticket'], {
    cardinality: 'one-to-many',
  }),
  covers: relation('covers', 'Cubre', 'Cubierto por', ['warranty'], ['product', 'variant', 'sale']),

  // ── Academy ────────────────────────────────────────────────────────────
  teaches: relation('teaches', 'Enseña', 'Se enseña en', ['course'], ['product', 'procedure']),
  certifies: relation('certifies', 'Certifica a', 'Certificado por', ['certification'], [
    'user',
    'contact',
    'customer',
  ]),

  // ── Marketing ──────────────────────────────────────────────────────────
  promotes: relation('promotes', 'Promociona', 'Promocionado en', ['campaign', 'content_asset'], [
    'product',
    'category',
    'course',
  ]),

  // ── IA y trazabilidad ──────────────────────────────────────────────────
  about: relation('about', 'Trata sobre', 'Tiene conversaciones', ['conversation', 'recommendation'], [
    'customer',
    'contact',
    'supplier',
    'product',
    'variant',
    'quote',
    'purchase_order',
    'ticket',
    'stock',
    'campaign',
  ]),
  derived_from: relation(
    'derived_from',
    'Se basó en',
    'Fundamentó',
    ['recommendation', 'technical_case', 'faq'],
    // Trazabilidad de la IA: qué información concreta sostuvo una
    // recomendación. Es lo que hace que nunca sea una caja negra.
    ['document', 'procedure', 'technical_case', 'conversation', 'movement', 'sale', 'ticket'],
  ),
  supersedes: relation(
    'supersedes',
    'Reemplaza a',
    'Reemplazado por',
    ['document', 'procedure', 'quote', 'product'],
    ['document', 'procedure', 'quote', 'product'],
    { cardinality: 'one-to-one' },
  ),
  related_to: relation(
    'related_to',
    'Relacionado con',
    'Relacionado con',
    // Válido entre cualquier par. Es la salida de emergencia del modelo:
    // el usuario puede conectar dos cosas que el sistema todavía no supo tipar.
    [],
    [],
    { symmetric: true },
  ),
};

export const ALL_RELATION_TYPES: readonly RelationTypeDefinition[] = RELATION_TYPE_IDS.map(
  (id) => RELATION_TYPES[id],
);

export function isRelationTypeId(value: string): value is RelationTypeId {
  return (RELATION_TYPE_IDS as readonly string[]).includes(value);
}

export interface RelationValidation {
  readonly valid: boolean;
  /** Principio 18 del PDL: el error enseña. Nunca "relación inválida" a secas. */
  readonly reason?: string;
}

/**
 * Verifica que una relación tenga sentido antes de crearla. El grafo sólo vale
 * si sus aristas significan algo: sin esta validación, "todo conectado con
 * todo" degenera en ruido y la IA pierde la capacidad de explicar por qué
 * relacionó dos cosas.
 */
export function validateRelation(
  type: RelationTypeId,
  fromType: EntityTypeId,
  toType: EntityTypeId,
): RelationValidation {
  const definition = RELATION_TYPES[type];

  // `related_to` no declara extremos: es deliberadamente universal.
  if (definition.from.length === 0 && definition.to.length === 0) {
    return { valid: true };
  }

  if (!definition.from.includes(fromType)) {
    return {
      valid: false,
      reason:
        `La relación "${definition.label}" no puede partir de ${fromType}. ` +
        `Parte de: ${definition.from.join(', ')}.`,
    };
  }

  if (!definition.to.includes(toType)) {
    return {
      valid: false,
      reason:
        `La relación "${definition.label}" no puede apuntar a ${toType}. ` +
        `Apunta a: ${definition.to.join(', ')}.`,
    };
  }

  return { valid: true };
}

/** Todas las relaciones que un tipo de entidad puede tener, en ambos sentidos. */
export function relationsFor(entityType: EntityTypeId): {
  readonly outgoing: readonly RelationTypeDefinition[];
  readonly incoming: readonly RelationTypeDefinition[];
} {
  const universal = ALL_RELATION_TYPES.filter((r) => r.from.length === 0 && r.to.length === 0);
  return {
    outgoing: [...ALL_RELATION_TYPES.filter((r) => r.from.includes(entityType)), ...universal],
    incoming: [...ALL_RELATION_TYPES.filter((r) => r.to.includes(entityType)), ...universal],
  };
}
