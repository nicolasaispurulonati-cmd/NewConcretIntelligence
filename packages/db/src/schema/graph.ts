/**
 * El grafo de conocimiento.
 *
 * Dos tablas sostienen la idea central del producto: `entities` son los nodos y
 * `entity_relations` las aristas. Cualquier objeto del negocio — un producto,
 * un cliente, un procedimiento, una conversación — es un nodo con la misma
 * forma, y por eso la búsqueda universal, la línea de tiempo, los permisos y la
 * recuperación de la IA se escriben una sola vez y sirven para todo.
 *
 * "La información no tiene dueño; tiene contexto."
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  customType,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { EXTERNAL_SOURCE, SOURCE_IDS } from '@nci/domain';

import { users } from './identity.js';

/**
 * Las tres restricciones de procedencia, construidas desde el vocabulario de
 * @nci/domain.
 *
 * Se generan en vez de escribirse a mano en cada tabla: es lo que garantiza
 * que nodo, arista y actividad admitan exactamente lo mismo. Antes eran cuatro
 * copias del literal, tres tablas con la lista y una sin restricción ninguna.
 */
function procedenciaValida(source: AnyPgColumn) {
  const valores = SOURCE_IDS.map((id) => `'${id}'`).join(',');
  return sql.raw(`${source.name} in (${valores})`);
}

/**
 * Los dos campos externos van juntos, y sólo con procedencia externa.
 *
 * Obligatorios cuando el dato viene de afuera —sin la fecha de lectura no se
 * puede mostrar que envejeció, que es lo que exige D-001— y prohibidos cuando
 * no, porque un sistema de origen en un dato que nadie importó es una mentira
 * silenciosa sobre de dónde salió.
 */
function origenExternoCoherente(source: AnyPgColumn, sistema: AnyPgColumn, leido: AnyPgColumn) {
  return sql.raw(
    `case when ${source.name} = '${EXTERNAL_SOURCE}'` +
      ` then ${sistema.name} is not null and ${leido.name} is not null` +
      ` else ${sistema.name} is null and ${leido.name} is null end`,
  );
}

/** Columna `tsvector` de PostgreSQL, mantenida por trigger. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * Embedding para búsqueda semántica (pgvector).
 * 1024 dimensiones — el tamaño de los modelos de embedding actuales de uso
 * general. Cambiarlo exige reindexar, así que se fija acá y en un solo lugar.
 */
export const EMBEDDING_DIMENSIONS = 1024;

const vector = customType<{ data: number[]; driverData: string }>({
  dataType: () => `vector(${EMBEDDING_DIMENSIONS})`,
  toDriver: (value) => `[${value.join(',')}]`,
  fromDriver: (value) => JSON.parse(value) as number[],
});

/**
 * Los nodos del grafo.
 *
 * Las columnas de esta tabla son las que todo nodo comparte: identidad,
 * presentación, propiedad, clasificación, tiempo. Los datos propios de cada
 * tipo viven en `data`, validados contra el esquema de @nci/domain al escribir.
 * A medida que un dominio madura, sus campos más consultados se promueven a
 * columnas o a una tabla de detalle — sin que cambie nada de lo que está acá.
 */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** EntityTypeId de @nci/domain. */
    type: text('type').notNull(),
    /** Identificador legible y estable: `concret-d`. Único dentro de su tipo. */
    slug: text('slug').notNull(),

    // ── Identidad visual (Principio 12 del PDL) ───────────────────────────
    /** El título. Siempre presente, siempre en el mismo lugar. */
    displayName: text('display_name').notNull(),
    /** El contexto inmediato bajo el título. */
    subtitle: text('subtitle'),
    /** El estado, siempre como palabra. El PDL prohíbe comunicarlo sólo con color. */
    status: text('status'),

    // ── Autoridad ─────────────────────────────────────────────────────────
    /** DataClassification de @nci/domain. Se copia del tipo para poder filtrar
     *  sin unir tablas: es la columna que decide si un dato financiero sale o no. */
    classification: text('classification').notNull().default('internal'),
    /** Quién responde por este nodo. Todo documento debe tener propietario. */
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

    // ── Procedencia ───────────────────────────────────────────────────────
    // Mismo vocabulario que las aristas, a propósito: un nodo y una relación
    // se afirman de la misma manera, y quien lee el grafo no tiene que
    // aprender dos idiomas. Ver D-007.
    /**
     * Quién afirmó que este nodo existe. El vocabulario está en @nci/domain.
     *
     * Un nodo inferido —una máquina deducida del historial de ventas— tiene
     * que poder decir que fue inferido. Sin esto, la única forma de anotarlo
     * sería enterrarlo en `data`, que no está tipado ni validado.
     */
    source: text('source').notNull().default('user'),
    /**
     * Certeza de la inferencia, de 0 a 1. Nula cuando lo afirmó una persona:
     * una afirmación humana no lleva probabilidad, lleva responsable.
     */
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    /** Qué integración lo trajo. Sólo con procedencia externa. */
    sourceSystem: text('source_system'),
    /** Cuándo se leyó del sistema de origen. Sólo con procedencia externa. */
    sourceReadAt: timestamp('source_read_at', { withTimezone: true }),

    // ── Contenido ─────────────────────────────────────────────────────────
    data: jsonb('data').notNull().default({}),
    /** Texto plano derivado del nodo. Alimenta búsqueda y embeddings. */
    searchableText: text('searchable_text'),
    searchVector: tsvector('search_vector'),
    embedding: vector('embedding'),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),

    // ── Tiempo (Principio 10 del PDL: el tiempo es visible) ───────────────
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Nada se elimina: se archiva. Principio 7 del PDL — una acción importante
     * nunca puede ser irreversible.
     */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: uuid('archived_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('entities_type_slug_unique').on(table.type, table.slug),
    index('entities_type_idx').on(table.type),
    index('entities_status_idx').on(table.type, table.status),
    index('entities_owner_idx').on(table.ownerId),
    index('entities_classification_idx').on(table.classification),
    index('entities_updated_idx').on(table.updatedAt),
    // Búsqueda léxica. El índice GIN se crea en la migración porque Drizzle no
    // expresa el método de índice para tsvector.
    index('entities_search_idx').using('gin', table.searchVector),
    check(
      'entities_classification_valid',
      sql`${table.classification} in ('public','internal','financial','restricted')`,
    ),
    check('entities_source_valid', procedenciaValida(table.source)),
    check(
      'entities_external_origin',
      origenExternoCoherente(table.source, table.sourceSystem, table.sourceReadAt),
    ),
    check(
      'entities_confidence_valid',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
);

/**
 * Las aristas del grafo.
 *
 * Se guarda una sola fila por relación y se recorre en los dos sentidos. El
 * tipo se valida contra @nci/domain antes de insertar: una arista sin
 * significado convierte el grafo en ruido y le quita a la IA la posibilidad de
 * explicar por qué relacionó dos cosas.
 */
export const entityRelations = pgTable(
  'entity_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** RelationTypeId de @nci/domain. */
    type: text('type').notNull(),
    fromId: uuid('from_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    toId: uuid('to_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    /** Contexto de la arista: cantidad en un presupuesto, orden en una lista. */
    metadata: jsonb('metadata').notNull().default({}),
    /** Qué integración la trajo. Sólo con procedencia externa. */
    sourceSystem: text('source_system'),
    /** Cuándo se leyó del sistema de origen. Sólo con procedencia externa. */
    sourceReadAt: timestamp('source_read_at', { withTimezone: true }),
    /**
     * Quién la creó. El vocabulario está en @nci/domain. Una relación inferida
     * por la IA se distingue siempre de una que afirmó una persona.
     */
    source: text('source').notNull().default('user'),
    /**
     * 0 a 1 cuando la infirió la IA; nulo cuando la afirmó una persona.
     *
     * Numérico y con rango validado en la base: como texto admitía "alta",
     * "0,8" o "-3" sin que nada se quejara, y ordenar por certeza daba un
     * orden alfabético. Ver D-007.
     */
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('entity_relations_unique').on(table.type, table.fromId, table.toId),
    index('entity_relations_from_idx').on(table.fromId, table.type),
    index('entity_relations_to_idx').on(table.toId, table.type),
    check('entity_relations_no_self', sql`${table.fromId} <> ${table.toId}`),
    check('entity_relations_source_valid', procedenciaValida(table.source)),
    check(
      'entity_relations_external_origin',
      origenExternoCoherente(table.source, table.sourceSystem, table.sourceReadAt),
    ),
    check(
      'entity_relations_confidence_valid',
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
);

/**
 * La línea de tiempo.
 *
 * "Cada entidad tendrá actividad." Es lo que alimenta el Timeline de cada
 * entidad y el Activity Feed del Workspace. A diferencia de la auditoría, esto
 * se escribe para que una persona lo lea.
 */
export const activity = pgTable(
  'activity',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    /** Qué ocurrió, en pasado y en el lenguaje del negocio: 'publicó', 'recibió'. */
    verb: text('verb').notNull(),
    /** La frase completa ya redactada: "Se recibieron 40 unidades." */
    summary: text('summary').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    /** El vocabulario está en @nci/domain, igual que en nodos y aristas. */
    source: text('source').notNull().default('user'),
    /** Qué integración lo produjo. Sólo con procedencia externa. */
    sourceSystem: text('source_system'),
    /** Cuándo se leyó del sistema de origen. Sólo con procedencia externa. */
    sourceReadAt: timestamp('source_read_at', { withTimezone: true }),
    /** Entidad secundaria involucrada: la orden de compra en una recepción. */
    relatedEntityId: uuid('related_entity_id').references(() => entities.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('activity_entity_idx').on(table.entityId, table.occurredAt),
    index('activity_actor_idx').on(table.actorId, table.occurredAt),
    index('activity_feed_idx').on(table.occurredAt),
    // Esta tabla no tenía ninguna restricción sobre `source`: admitía cualquier
    // palabra. Era la tercera forma distinta del mismo vocabulario.
    check('activity_source_valid', procedenciaValida(table.source)),
    check(
      'activity_external_origin',
      origenExternoCoherente(table.source, table.sourceSystem, table.sourceReadAt),
    ),
  ],
);

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  owner: one(users, { fields: [entities.ownerId], references: [users.id] }),
  outgoing: many(entityRelations, { relationName: 'from' }),
  incoming: many(entityRelations, { relationName: 'to' }),
  activity: many(activity),
}));

export const entityRelationsRelations = relations(entityRelations, ({ one }) => ({
  from: one(entities, {
    fields: [entityRelations.fromId],
    references: [entities.id],
    relationName: 'from',
  }),
  to: one(entities, {
    fields: [entityRelations.toId],
    references: [entities.id],
    relationName: 'to',
  }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  entity: one(entities, { fields: [activity.entityId], references: [entities.id] }),
  actor: one(users, { fields: [activity.actorId], references: [users.id] }),
}));
