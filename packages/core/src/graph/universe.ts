/**
 * El universo de una entidad.
 *
 * "Imaginá abrir Concret D. No estarías viendo una ficha. Estarías viendo todo
 *  el universo relacionado con ese producto. No importa desde qué área
 *  ingreses: siempre llegás al mismo Concret D."
 *
 * Esta función es la que hace cierta esa frase. Devuelve el nodo, todo lo que
 * lo rodea agrupado por dominio, y su línea de tiempo — filtrado por lo que la
 * persona puede ver. Marketing y Compras abren el mismo producto y reciben dos
 * universos distintos sin que ninguna de las dos vea un hueco.
 */

import { and, count, desc, eq, inArray, or } from 'drizzle-orm';

import { activity, entities, entityRelations } from '@nci/db';
import {
  DOMAINS,
  ENTITY_TYPES,
  type DomainId,
  type EntityTypeId,
} from '@nci/domain';

import type { Scope } from '../authorization/resolve.js';
import { getEntity, type EntityNode } from './entities.js';
import { getRelated, type RelatedNode } from './relations.js';

/** Los vecinos de un nodo agrupados por el dominio al que pertenecen. */
export interface UniverseSection {
  readonly domain: DomainId;
  readonly title: string;
  readonly nodes: readonly RelatedNode[];
}

export interface TimelineEvent {
  readonly id: number;
  readonly verb: string;
  readonly summary: string;
  readonly actorName: string;
  readonly source: string;
  readonly occurredAt: Date;
}

export interface EntityUniverse {
  readonly entity: EntityNode;
  /** Cómo se presenta: qué es, de qué dominio viene, qué significa. */
  readonly meaning: {
    readonly typeName: string;
    readonly domainName: string;
    readonly description: string;
  };
  readonly sections: readonly UniverseSection[];
  readonly timeline: readonly TimelineEvent[];
  /**
   * Lo que existe alrededor de este nodo pero queda fuera del alcance de la
   * persona. Se informa el número, nunca el contenido.
   *
   * El PDL exige que el usuario nunca se pierda: saber que hay información
   * relacionada que no puede ver es distinto de creer que no existe.
   */
  readonly restrictedCount: number;
}

export async function getEntityUniverse(
  scope: Scope,
  entityId: string,
  options: { readonly timelineLimit?: number } = {},
): Promise<EntityUniverse> {
  const entity = await getEntity(scope, entityId);
  const definition = ENTITY_TYPES[entity.type];

  const [related, events, visibility] = await Promise.all([
    getRelated(scope, entityId),
    scope.db
      .select({
        id: activity.id,
        verb: activity.verb,
        summary: activity.summary,
        actorName: activity.actorName,
        source: activity.source,
        occurredAt: activity.occurredAt,
      })
      .from(activity)
      .where(eq(activity.entityId, entityId))
      .orderBy(desc(activity.occurredAt))
      .limit(options.timelineLimit ?? 25),
    countRelationVisibility(scope, entityId),
  ]);

  return {
    entity,
    meaning: {
      typeName: definition.singular,
      domainName: DOMAINS[definition.domain].name,
      description: definition.meaning,
    },
    sections: groupByDomain(related),
    timeline: events,
    restrictedCount: Math.max(0, visibility.total - visibility.visible),
  };
}

/**
 * Agrupa por dominio y ordena poniendo primero lo que suele buscarse.
 *
 * El orden no es alfabético a propósito: quien abre un producto busca antes su
 * conocimiento técnico que su historial de campañas.
 */
const SECTION_ORDER: readonly DomainId[] = [
  'knowledge',
  'products',
  'inventory',
  'sales',
  'procurement',
  'support',
  'crm',
  'academy',
  'marketing',
  'ai',
  'executive',
  'identity',
];

function groupByDomain(nodes: readonly RelatedNode[]): UniverseSection[] {
  const byDomain = new Map<DomainId, RelatedNode[]>();

  for (const node of nodes) {
    const domain = ENTITY_TYPES[node.type].domain;
    const bucket = byDomain.get(domain);
    if (bucket) bucket.push(node);
    else byDomain.set(domain, [node]);
  }

  return SECTION_ORDER.filter((domain) => byDomain.has(domain)).map((domain) => ({
    domain,
    title: DOMAINS[domain].name,
    nodes: (byDomain.get(domain) ?? []).sort((a, b) => a.displayName.localeCompare(b.displayName, 'es')),
  }));
}

/**
 * Cuántos vecinos tiene el nodo, con y sin el filtro de permisos.
 *
 * La diferencia entre ambos números es lo único que se publica sobre lo que la
 * persona no puede ver: se entera de que hay algo más, nunca de qué es.
 */
async function countRelationVisibility(
  scope: Scope,
  entityId: string,
): Promise<{ total: number; visible: number }> {
  const touchesEntity = or(
    eq(entityRelations.fromId, entityId),
    eq(entityRelations.toId, entityId),
  );

  const readable = scope.actor.readableEntityTypes();

  const [totals] = await scope.db
    .select({ total: count() })
    .from(entityRelations)
    .where(touchesEntity);

  if (readable.length === 0) {
    return { total: totals?.total ?? 0, visible: 0 };
  }

  const [visibles] = await scope.db
    .select({ total: count() })
    .from(entityRelations)
    .innerJoin(
      entities,
      or(
        and(eq(entityRelations.fromId, entityId), eq(entities.id, entityRelations.toId)),
        and(eq(entityRelations.toId, entityId), eq(entities.id, entityRelations.fromId)),
      ),
    )
    .where(and(touchesEntity, inArray(entities.type, [...readable])));

  return { total: totals?.total ?? 0, visible: visibles?.total ?? 0 };
}

/** Los tipos de entidad presentes en un universo. Útil para la navegación lateral. */
export function universeTypes(universe: EntityUniverse): readonly EntityTypeId[] {
  return [...new Set(universe.sections.flatMap((s) => s.nodes.map((n) => n.type)))];
}
