/**
 * Las aristas del grafo.
 *
 * Una relación se guarda una vez y se lee en los dos sentidos. Se valida contra
 * el modelo antes de existir: sin esa validación "todo conectado con todo" se
 * vuelve ruido, y la IA pierde la capacidad de explicar por qué relacionó dos
 * cosas — que es justamente lo que el producto promete.
 */

import { and, eq, inArray, or } from 'drizzle-orm';

import { entities, entityRelations } from '@nci/db';
import {
  ENTITY_TYPES,
  RELATION_TYPES,
  validateRelation,
  type EntityTypeId,
  type RelationTypeId,
} from '@nci/domain';

import { recordActivity, recordAudit } from '../audit.js';
import type { Scope } from '../authorization/resolve.js';
import { NotFoundError, ValidationError } from '../errors.js';

export interface RelateInput {
  readonly type: RelationTypeId;
  readonly fromId: string;
  readonly toId: string;
  readonly metadata?: Record<string, unknown>;
  /** Quién la afirma. Una relación inferida por la IA nunca se confunde con una humana. */
  readonly source?: 'user' | 'system' | 'ai';
  /** 0 a 1 cuando la infirió la IA. */
  readonly confidence?: number;
}

export async function relate(scope: Scope, input: RelateInput): Promise<void> {
  const [from, to] = await Promise.all([
    loadEndpoint(scope, input.fromId),
    loadEndpoint(scope, input.toId),
  ]);

  const check = validateRelation(input.type, from.type, to.type);
  if (!check.valid) {
    throw new ValidationError({
      message: 'No fue posible relacionar estos elementos.',
      reason: check.reason ?? 'La relación no está prevista en el modelo.',
    });
  }

  // Relacionar es modificar ambos extremos: quien no puede editar el producto
  // no puede colgarle documentos.
  scope.actor.assertCanActOn(from.type, 'update');
  scope.actor.assertCanActOn(to.type, 'update');

  const definition = RELATION_TYPES[input.type];

  await scope.db
    .insert(entityRelations)
    .values({
      type: input.type,
      fromId: input.fromId,
      toId: input.toId,
      metadata: input.metadata ?? {},
      source: input.source ?? 'user',
      confidence: input.confidence !== undefined ? String(input.confidence) : null,
      createdBy: scope.actor.id,
    })
    .onConflictDoNothing({
      target: [entityRelations.type, entityRelations.fromId, entityRelations.toId],
    });

  await recordActivity(scope, {
    entityId: input.fromId,
    verb: 'relacionó',
    summary: `${scope.actor.fullName} relacionó "${from.displayName}" con "${to.displayName}" (${definition.label.toLowerCase()}).`,
    relatedEntityId: input.toId,
    source: input.source === 'ai' ? 'ai' : 'user',
  });
  await recordAudit(scope, {
    action: 'relation.create',
    entityId: input.fromId,
    entityType: from.type,
    after: { type: input.type, toId: input.toId },
  });
}

export async function unrelate(
  scope: Scope,
  params: { type: RelationTypeId; fromId: string; toId: string },
): Promise<void> {
  const from = await loadEndpoint(scope, params.fromId);
  scope.actor.assertCanActOn(from.type, 'update');

  await scope.db
    .delete(entityRelations)
    .where(
      and(
        eq(entityRelations.type, params.type),
        eq(entityRelations.fromId, params.fromId),
        eq(entityRelations.toId, params.toId),
      ),
    );

  await recordAudit(scope, {
    action: 'relation.delete',
    entityId: params.fromId,
    entityType: from.type,
    before: { type: params.type, toId: params.toId },
  });
}

/** Un vecino en el grafo, ya con la etiqueta con la que se lee desde el origen. */
export interface RelatedNode {
  readonly id: string;
  readonly type: EntityTypeId;
  readonly slug: string;
  readonly displayName: string;
  readonly subtitle: string | null;
  readonly status: string | null;
  readonly relationType: RelationTypeId;
  /** Cómo se lee desde el nodo que se está mirando. */
  readonly relationLabel: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly source: string;
  readonly confidence: number | null;
  readonly metadata: Record<string, unknown>;
}

/**
 * Todos los vecinos de un nodo, en ambos sentidos.
 *
 * Filtra por lo que el actor puede consultar: dos personas abriendo el mismo
 * producto ven universos distintos, y ninguna se entera de lo que le falta.
 */
export async function getRelated(
  scope: Scope,
  entityId: string,
  options: { readonly types?: readonly RelationTypeId[]; readonly limit?: number } = {},
): Promise<RelatedNode[]> {
  const readable = scope.actor.readableEntityTypes();
  if (readable.length === 0) return [];

  const matchesType = options.types?.length
    ? inArray(entityRelations.type, [...options.types])
    : undefined;

  const rows = await scope.db
    .select({
      relationType: entityRelations.type,
      fromId: entityRelations.fromId,
      toId: entityRelations.toId,
      source: entityRelations.source,
      confidence: entityRelations.confidence,
      metadata: entityRelations.metadata,
      neighbourId: entities.id,
      neighbourType: entities.type,
      neighbourSlug: entities.slug,
      neighbourName: entities.displayName,
      neighbourSubtitle: entities.subtitle,
      neighbourStatus: entities.status,
    })
    .from(entityRelations)
    .innerJoin(
      entities,
      or(
        and(eq(entityRelations.fromId, entityId), eq(entities.id, entityRelations.toId)),
        and(eq(entityRelations.toId, entityId), eq(entities.id, entityRelations.fromId)),
      ),
    )
    .where(
      and(
        or(eq(entityRelations.fromId, entityId), eq(entityRelations.toId, entityId)),
        inArray(entities.type, [...readable]),
        ...(matchesType ? [matchesType] : []),
      ),
    )
    .limit(options.limit ?? 200);

  return rows.map((row) => {
    const outgoing = row.fromId === entityId;
    const definition = RELATION_TYPES[row.relationType as RelationTypeId];
    return {
      id: row.neighbourId,
      type: row.neighbourType as EntityTypeId,
      slug: row.neighbourSlug,
      displayName: row.neighbourName,
      subtitle: row.neighbourSubtitle,
      status: row.neighbourStatus,
      relationType: row.relationType as RelationTypeId,
      relationLabel: outgoing ? definition.label : definition.inverseLabel,
      direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
      source: row.source,
      confidence: row.confidence === null ? null : Number(row.confidence),
      metadata: row.metadata as Record<string, unknown>,
    };
  });
}

/**
 * Cuenta las relaciones de un nodo antes de una acción destructiva.
 *
 * Principio 3 del PDL: primero comprender, después actuar. Es lo que permite
 * decir "Este documento está relacionado con 14 procedimientos" en vez de
 * ofrecer un botón "Borrar" sin contexto.
 */
export async function countRelations(scope: Scope, entityId: string): Promise<
  { readonly label: string; readonly count: number }[]
> {
  const related = await getRelated(scope, entityId);
  const byType = new Map<string, number>();

  for (const node of related) {
    const label = ENTITY_TYPES[node.type].plural;
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }

  return [...byType.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function loadEndpoint(
  scope: Scope,
  id: string,
): Promise<{ type: EntityTypeId; displayName: string }> {
  const [row] = await scope.db
    .select({ type: entities.type, displayName: entities.displayName })
    .from(entities)
    .where(eq(entities.id, id))
    .limit(1);

  if (!row || !scope.actor.canActOn(row.type as EntityTypeId, 'read')) {
    throw new NotFoundError('uno de los elementos a relacionar');
  }

  return { type: row.type as EntityTypeId, displayName: row.displayName };
}
