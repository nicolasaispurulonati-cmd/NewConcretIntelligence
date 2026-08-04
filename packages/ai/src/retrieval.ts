/**
 * Cómo la IA obtiene contexto.
 *
 * Este módulo sólo sabe pedirle cosas al motor a través de un Scope. No tiene
 * acceso a la base de datos y no puede construirse uno. Esa es la garantía
 * estructural detrás de la regla del documento de roles: la IA no puede ver lo
 * que la persona no vería, porque literalmente usa las mismas funciones que la
 * interfaz.
 */

import {
  getEntityUniverse,
  search,
  type Scope,
  type SearchHit,
} from '@nci/core';
import { ENTITY_TYPES, type DomainId } from '@nci/domain';

/** Un elemento del contexto, listo para entrar al prompt. */
export interface ContextItem {
  readonly entityId: string;
  readonly entityType: string;
  readonly typeName: string;
  readonly displayName: string;
  readonly subtitle: string | null;
  readonly status: string | null;
  readonly updatedAt: string;
  /** Cómo llegó al contexto: por búsqueda, por ser el foco, o por estar relacionado. */
  readonly via: 'foco' | 'búsqueda' | 'relación';
  readonly detail: Record<string, unknown>;
}

export interface RetrievedContext {
  readonly items: readonly ContextItem[];
  /**
   * Cuántos elementos relacionados existen pero quedan fuera del alcance de la
   * persona. La IA lo sabe para no afirmar que algo no existe cuando sólo no
   * puede verlo — pero nunca revela de qué se trata.
   */
  readonly restrictedCount: number;
  /** Qué se buscó. Se le informa a la IA para que pueda explicar una respuesta vacía. */
  readonly searched: string;
}

export interface RetrievalOptions {
  readonly question: string;
  /** La entidad que el usuario está mirando cuando pregunta. */
  readonly focusEntityId?: string;
  readonly domain?: DomainId;
  /** Tope de elementos. Más contexto no es mejor contexto. */
  readonly maxItems?: number;
}

const DEFAULT_MAX_ITEMS = 24;

export async function retrieveContext(
  scope: Scope,
  options: RetrievalOptions,
): Promise<RetrievedContext> {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const items: ContextItem[] = [];
  const seen = new Set<string>();
  let restrictedCount = 0;

  // El foco primero: si el usuario pregunta mirando Concret D, Concret D y su
  // universo pesan más que cualquier coincidencia de texto.
  if (options.focusEntityId) {
    const universe = await getEntityUniverse(scope, options.focusEntityId, { timelineLimit: 10 });
    restrictedCount = universe.restrictedCount;

    items.push({
      entityId: universe.entity.id,
      entityType: universe.entity.type,
      typeName: universe.meaning.typeName,
      displayName: universe.entity.displayName,
      subtitle: universe.entity.subtitle,
      status: universe.entity.status,
      updatedAt: universe.entity.updatedAt.toISOString(),
      via: 'foco',
      detail: {
        ...universe.entity.data,
        actividadReciente: universe.timeline.slice(0, 5).map((event) => ({
          cuando: event.occurredAt.toISOString(),
          que: event.summary,
        })),
      },
    });
    seen.add(universe.entity.id);

    for (const section of universe.sections) {
      for (const node of section.nodes) {
        if (seen.has(node.id) || items.length >= maxItems) continue;
        items.push({
          entityId: node.id,
          entityType: node.type,
          typeName: ENTITY_TYPES[node.type].singular,
          displayName: node.displayName,
          subtitle: node.subtitle,
          status: node.status,
          updatedAt: new Date().toISOString(),
          via: 'relación',
          detail: { relacion: node.relationLabel, dominio: section.title },
        });
        seen.add(node.id);
      }
    }
  }

  // Después la búsqueda, para traer lo que el foco no alcanza.
  if (items.length < maxItems) {
    const hits = await search(scope, options.question, {
      limit: maxItems - items.length,
      ...(options.domain ? { domains: [options.domain] } : {}),
    });

    for (const hit of hits) {
      if (seen.has(hit.id) || items.length >= maxItems) continue;
      items.push(toContextItem(hit));
      seen.add(hit.id);
    }
  }

  return { items, restrictedCount, searched: options.question };
}

function toContextItem(hit: SearchHit): ContextItem {
  return {
    entityId: hit.id,
    entityType: hit.type,
    typeName: hit.typeName,
    displayName: hit.displayName,
    subtitle: hit.subtitle,
    status: hit.status,
    updatedAt: hit.updatedAt.toISOString(),
    via: 'búsqueda',
    detail: { coincidencia: hit.matchedBy },
  };
}

/**
 * Convierte el contexto en el bloque de texto que recibe el modelo.
 *
 * Cada elemento lleva su identificador para que la IA pueda citarlo: sin eso
 * las fuentes de la respuesta no serían verificables.
 */
export function renderContext(context: RetrievedContext): string {
  if (context.items.length === 0) {
    return [
      `Se buscó "${context.searched}" en toda la plataforma y no se encontró información relacionada.`,
      context.restrictedCount > 0
        ? `Existen ${context.restrictedCount} elementos relacionados fuera del alcance de acceso de esta persona.`
        : '',
      'Respondé diciendo qué se buscó y qué no se encontró, y proponé cómo obtener la información o ampliar la búsqueda.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const lines = context.items.map((item, index) => {
    const parts = [
      `[${index + 1}] ${item.typeName}: ${item.displayName}`,
      `    id: ${item.entityId}`,
      `    tipo: ${item.entityType}`,
      item.subtitle ? `    contexto: ${item.subtitle}` : '',
      item.status ? `    estado: ${item.status}` : '',
      `    actualizado: ${item.updatedAt}`,
      `    llegó por: ${item.via}`,
      `    datos: ${JSON.stringify(item.detail)}`,
    ];
    return parts.filter(Boolean).join('\n');
  });

  const footer =
    context.restrictedCount > 0
      ? `\n\nAdemás existen ${context.restrictedCount} elementos relacionados que esta persona no está autorizada a consultar. No los menciones ni especules sobre su contenido; tenelos en cuenta sólo para no afirmar que algo no existe.`
      : '';

  return `Información disponible para responder (ya filtrada por los permisos de esta persona):\n\n${lines.join('\n\n')}${footer}`;
}
