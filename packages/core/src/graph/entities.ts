/**
 * Los nodos del grafo.
 *
 * Crear, leer, modificar y archivar cualquier entidad pasa por acá. Que sea un
 * único camino es lo que garantiza que todas cumplan lo mismo: permiso
 * verificado, actividad registrada, auditoría escrita, texto de búsqueda
 * actualizado. Un dominio nuevo no vuelve a implementar nada de eso.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { entities } from '@nci/db';
import { ENTITY_TYPES, type EntityTypeId } from '@nci/domain';

import { recordActivity, recordAudit } from '../audit.js';
import type { Scope } from '../authorization/resolve.js';
import { NotFoundError, ValidationError } from '../errors.js';

export interface EntityNode {
  readonly id: string;
  readonly type: EntityTypeId;
  readonly slug: string;
  readonly displayName: string;
  readonly subtitle: string | null;
  readonly status: string | null;
  readonly classification: string;
  readonly ownerId: string | null;
  /** Quién afirmó que este nodo existe. Ver D-007. */
  readonly source: EntitySource;
  /** Certeza de la inferencia, de 0 a 1. Nula cuando lo afirmó una persona. */
  readonly confidence: number | null;
  readonly data: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

/**
 * Cómo entró un nodo al grafo.
 *
 * El mismo vocabulario que usan las aristas. Un dato inferido y uno afirmado
 * por una persona no valen lo mismo, y la diferencia tiene que poder leerse
 * sin abrir el `data`.
 */
export type EntitySource = 'user' | 'system' | 'ai';

export interface CreateEntityInput {
  readonly type: EntityTypeId;
  /** Si no se pasa, se deriva del nombre. */
  readonly slug?: string;
  readonly displayName: string;
  readonly subtitle?: string;
  readonly status?: string;
  readonly ownerId?: string;
  /** Por defecto 'user': si nadie dice lo contrario, lo afirmó una persona. */
  readonly source?: EntitySource;
  /** Sólo tiene sentido junto a un `source` que no sea 'user'. De 0 a 1. */
  readonly confidence?: number;
  readonly data?: Record<string, unknown>;
  /**
   * Texto plano que representa al nodo para la búsqueda y para la IA. Cada
   * dominio decide qué de su entidad merece ser encontrado.
   */
  readonly searchableText?: string;
}

/** `Concret D 20 L` → `concret-d-20-l`. Estable y legible en una URL. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function createEntity(scope: Scope, input: CreateEntityInput): Promise<EntityNode> {
  scope.actor.assertCanActOn(input.type, 'create');

  const definition = ENTITY_TYPES[input.type];
  const slug = input.slug ?? slugify(input.displayName);

  if (slug.length === 0) {
    throw new ValidationError({
      message: `No fue posible crear ${definition.singular.toLowerCase()}.`,
      reason: 'El nombre no produce un identificador válido.',
      field: 'displayName',
    });
  }

  const [created] = await scope.db
    .insert(entities)
    .values({
      type: input.type,
      slug,
      displayName: input.displayName,
      subtitle: input.subtitle ?? null,
      status: input.status ?? null,
      classification: definition.classification,
      ownerId: input.ownerId ?? scope.actor.id,
      source: input.source ?? 'user',
      confidence: input.confidence !== undefined ? String(input.confidence) : null,
      data: input.data ?? {},
      searchableText: input.searchableText ?? input.displayName,
      createdBy: scope.actor.id,
      updatedBy: scope.actor.id,
    })
    .onConflictDoNothing({ target: [entities.type, entities.slug] })
    .returning();

  if (!created) {
    throw new ValidationError({
      message: `Ya existe ${definition.singular.toLowerCase()} con ese nombre.`,
      reason: `El identificador "${slug}" está en uso dentro de ${definition.plural.toLowerCase()}.`,
      field: 'displayName',
      actions: [{ label: `Ver ${definition.singular.toLowerCase()} existente`, href: `/${input.type}/${slug}` }],
    });
  }

  const node = toNode(created);

  await recordActivity(scope, {
    entityId: node.id,
    verb: 'creó',
    summary: `${scope.actor.fullName} creó ${definition.singular.toLowerCase()} "${node.displayName}".`,
  });
  await recordAudit(scope, {
    action: `${input.type}.create`,
    entityId: node.id,
    entityType: input.type,
    capabilityUsed: `${input.type}.create`,
    after: node,
  });

  return node;
}

export async function getEntity(scope: Scope, id: string): Promise<EntityNode> {
  const [row] = await scope.db.select().from(entities).where(eq(entities.id, id)).limit(1);

  // Inexistente y prohibido devuelven lo mismo: distinguirlos confirmaría la
  // existencia del dato a quien no puede verlo.
  if (!row || !scope.actor.canActOn(row.type as EntityTypeId, 'read')) {
    throw new NotFoundError('la información solicitada');
  }

  return toNode(row);
}

export async function getEntityBySlug(
  scope: Scope,
  type: EntityTypeId,
  slug: string,
): Promise<EntityNode> {
  scope.actor.assertCanActOn(type, 'read');

  const [row] = await scope.db
    .select()
    .from(entities)
    .where(and(eq(entities.type, type), eq(entities.slug, slug)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(ENTITY_TYPES[type].singular.toLowerCase());
  }

  return toNode(row);
}

export interface UpdateEntityInput {
  readonly displayName?: string;
  readonly subtitle?: string | null;
  readonly status?: string | null;
  readonly ownerId?: string | null;
  readonly data?: Record<string, unknown>;
  readonly searchableText?: string;
}

export async function updateEntity(
  scope: Scope,
  id: string,
  input: UpdateEntityInput,
): Promise<EntityNode> {
  const before = await getEntity(scope, id);
  scope.actor.assertCanActOn(before.type, 'update');

  const definition = ENTITY_TYPES[before.type];
  if (definition.immutable) {
    throw new ValidationError({
      message: `${definition.singular} no se modifica.`,
      reason: `Un ${definition.singular.toLowerCase()} es un registro histórico. Para corregirlo se registra uno nuevo que lo compense, de modo que la trazabilidad quede intacta.`,
    });
  }

  const [updated] = await scope.db
    .update(entities)
    .set({
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      // `data` se reemplaza por combinación: un dominio actualiza sus campos
      // sin pisar los que escribió otro sobre la misma entidad.
      ...(input.data !== undefined
        ? { data: sql`${entities.data} || ${JSON.stringify(input.data)}::jsonb` }
        : {}),
      ...(input.searchableText !== undefined ? { searchableText: input.searchableText } : {}),
      updatedBy: scope.actor.id,
    })
    .where(eq(entities.id, id))
    .returning();

  if (!updated) throw new NotFoundError(definition.singular.toLowerCase());

  const after = toNode(updated);

  await recordActivity(scope, {
    entityId: id,
    verb: 'actualizó',
    summary: `${scope.actor.fullName} actualizó ${definition.singular.toLowerCase()} "${after.displayName}".`,
  });
  await recordAudit(scope, {
    action: `${before.type}.update`,
    entityId: id,
    entityType: before.type,
    capabilityUsed: `${before.type}.update`,
    before,
    after,
  });

  return after;
}

/**
 * Archiva un nodo. Nada se elimina.
 *
 * Principio 7 del PDL: una acción importante nunca puede ser irreversible. El
 * nodo deja de aparecer, sus relaciones quedan, y la decisión puede revertirse.
 */
export async function archiveEntity(scope: Scope, id: string, reason?: string): Promise<void> {
  const node = await getEntity(scope, id);
  scope.actor.assertCanActOn(node.type, 'update');

  const definition = ENTITY_TYPES[node.type];

  await scope.db
    .update(entities)
    .set({ archivedAt: new Date(), archivedBy: scope.actor.id, updatedBy: scope.actor.id })
    .where(and(eq(entities.id, id), isNull(entities.archivedAt)));

  await recordActivity(scope, {
    entityId: id,
    verb: 'archivó',
    summary: reason
      ? `${scope.actor.fullName} archivó ${definition.singular.toLowerCase()} "${node.displayName}": ${reason}`
      : `${scope.actor.fullName} archivó ${definition.singular.toLowerCase()} "${node.displayName}".`,
  });
  await recordAudit(scope, {
    action: `${node.type}.archive`,
    entityId: id,
    entityType: node.type,
    capabilityUsed: `${node.type}.update`,
    before: node,
  });
}

/** Varios nodos por id, ya filtrados por lo que el actor puede ver. */
export async function getEntities(scope: Scope, ids: readonly string[]): Promise<EntityNode[]> {
  if (ids.length === 0) return [];

  const readable = scope.actor.readableEntityTypes();
  if (readable.length === 0) return [];

  const rows = await scope.db
    .select()
    .from(entities)
    .where(and(inArray(entities.id, [...ids]), inArray(entities.type, [...readable])));

  return rows.map(toNode);
}

type EntityRow = typeof entities.$inferSelect;

function toNode(row: EntityRow): EntityNode {
  return {
    id: row.id,
    type: row.type as EntityTypeId,
    slug: row.slug,
    displayName: row.displayName,
    subtitle: row.subtitle,
    status: row.status,
    classification: row.classification,
    ownerId: row.ownerId,
    source: row.source as EntitySource,
    confidence: row.confidence === null ? null : Number(row.confidence),
    data: row.data as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}
