/**
 * Búsqueda universal.
 *
 * "El usuario escribe: Concret D. El sistema devuelve producto, stock, ventas,
 *  documentos, videos, casos técnicos, procedimientos, consultas, compras,
 *  campañas. Todo relacionado. No importa dónde esté almacenado."
 *
 * Tres formas de encontrar, combinadas en un solo resultado:
 *
 *   léxica    — coincidencia de palabras con pesos por campo. Precisa.
 *   difusa    — tolerante a errores de tipeo y a acentos. Responde con dos
 *               letras, que es lo que necesita el Command Palette.
 *   semántica — por significado. Encuentra "cómo pulir un piso" en un
 *               procedimiento que nunca usa esas palabras.
 *
 * Las tres respetan el mismo filtro de permisos, porque las tres parten del
 * mismo Scope.
 */

import { and, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { entities } from '@nci/db';
import { ENTITY_TYPES, type DomainId, type EntityTypeId } from '@nci/domain';

import type { Scope } from './authorization/resolve.js';

export interface SearchOptions {
  readonly types?: readonly EntityTypeId[];
  readonly domains?: readonly DomainId[];
  readonly limit?: number;
  /** Incluir lo archivado. Por defecto no: archivar es sacar de la vista. */
  readonly includeArchived?: boolean;
  /** Embedding de la consulta. Sin él la búsqueda es léxica y difusa solamente. */
  readonly queryEmbedding?: readonly number[];
}

export interface SearchHit {
  readonly id: string;
  readonly type: EntityTypeId;
  readonly typeName: string;
  readonly domain: DomainId;
  readonly slug: string;
  readonly displayName: string;
  readonly subtitle: string | null;
  readonly status: string | null;
  readonly updatedAt: Date;
  readonly score: number;
  /** Por qué apareció. El PDL pide que el sistema explique, no sólo informe. */
  readonly matchedBy: 'exacta' | 'texto' | 'aproximada' | 'significado';
}

const DEFAULT_LIMIT = 20;

export async function search(
  scope: Scope,
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const term = query.trim();
  if (term.length === 0) return [];

  const allowed = allowedTypes(scope, options);
  if (allowed.length === 0) return [];

  const limit = options.limit ?? DEFAULT_LIMIT;

  // El vector semántico es opcional: sin embedding la consulta sigue siendo
  // válida y el término semántico aporta cero. Así la búsqueda funciona
  // aunque el indexador esté atrasado o la API de embeddings no responda.
  const semantic: SQL<number> = options.queryEmbedding
    ? sql<number>`case
        when ${entities.embedding} is null then 0
        else greatest(0, 1 - (${entities.embedding} <=> ${`[${options.queryEmbedding.join(',')}]`}::vector))
      end`
    : sql<number>`0`;

  // `nci_unaccent` y no `unaccent`: es la versión inmutable sobre la que está
  // construido el índice trigram. Con `unaccent` a secas la consulta daría el
  // mismo resultado, pero recorriendo la tabla entera.
  const lexical = sql<number>`ts_rank(${entities.searchVector}, websearch_to_tsquery('nci_es', ${term}))`;
  const fuzzy = sql<number>`similarity(lower(nci_unaccent(${entities.displayName})), lower(nci_unaccent(${term})))`;
  const exact = sql<number>`case when lower(nci_unaccent(${entities.displayName})) = lower(nci_unaccent(${term})) then 1 else 0 end`;

  // Los pesos ordenan por intención: un nombre exacto siempre gana; el
  // significado desempata cuando nada coincide literalmente.
  const score = sql<number>`(
      (${exact} * 10)
    + (${lexical} * 4)
    + (${fuzzy} * 2)
    + (${semantic} * 3)
  )`;

  const rows = await scope.db
    .select({
      id: entities.id,
      type: entities.type,
      slug: entities.slug,
      displayName: entities.displayName,
      subtitle: entities.subtitle,
      status: entities.status,
      updatedAt: entities.updatedAt,
      score,
      exact,
      lexical,
      fuzzy,
      semantic,
    })
    .from(entities)
    .where(
      and(
        inArray(entities.type, [...allowed]),
        inArray(entities.classification, [...scope.actor.visibleClassifications()]),
        ...(options.includeArchived ? [] : [isNull(entities.archivedAt)]),
        // Un candidato tiene que coincidir por algún camino. El umbral difuso
        // evita que una búsqueda devuelva la base entera con puntaje casi cero.
        sql`(
             ${entities.searchVector} @@ websearch_to_tsquery('nci_es', ${term})
          or similarity(lower(nci_unaccent(${entities.displayName})), lower(nci_unaccent(${term}))) > 0.15
          ${options.queryEmbedding ? sql`or ${entities.embedding} is not null` : sql``}
        )`,
      ),
    )
    .orderBy(sql`${score} desc`, sql`${entities.updatedAt} desc`)
    .limit(limit);

  return rows.map((row) => {
    const definition = ENTITY_TYPES[row.type as EntityTypeId];
    return {
      id: row.id,
      type: row.type as EntityTypeId,
      typeName: definition.singular,
      domain: definition.domain,
      slug: row.slug,
      displayName: row.displayName,
      subtitle: row.subtitle,
      status: row.status,
      updatedAt: row.updatedAt,
      score: Number(row.score),
      matchedBy: explainMatch(row),
    };
  });
}

/**
 * Resultados agrupados por dominio, que es como los espera la pantalla de
 * búsqueda: "Producto. Stock. Ventas. Documentos. Videos…"
 */
export async function searchGrouped(
  scope: Scope,
  query: string,
  options: SearchOptions = {},
): Promise<{ readonly domain: DomainId; readonly hits: readonly SearchHit[] }[]> {
  const hits = await search(scope, query, { ...options, limit: options.limit ?? 50 });
  const byDomain = new Map<DomainId, SearchHit[]>();

  for (const hit of hits) {
    const bucket = byDomain.get(hit.domain);
    if (bucket) bucket.push(hit);
    else byDomain.set(hit.domain, [hit]);
  }

  return [...byDomain.entries()]
    .map(([domain, group]) => ({ domain, hits: group }))
    .sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0));
}

function allowedTypes(scope: Scope, options: SearchOptions): readonly EntityTypeId[] {
  let allowed = scope.actor.readableEntityTypes().filter((type) => ENTITY_TYPES[type].searchable);

  if (options.types?.length) {
    const requested = new Set(options.types);
    allowed = allowed.filter((type) => requested.has(type));
  }

  if (options.domains?.length) {
    const requested = new Set(options.domains);
    allowed = allowed.filter((type) => requested.has(ENTITY_TYPES[type].domain));
  }

  return allowed;
}

function explainMatch(row: {
  exact: number;
  lexical: number;
  fuzzy: number;
  semantic: number;
}): SearchHit['matchedBy'] {
  if (Number(row.exact) > 0) return 'exacta';
  if (Number(row.lexical) > 0) return 'texto';
  if (Number(row.fuzzy) > 0.15) return 'aproximada';
  return 'significado';
}
