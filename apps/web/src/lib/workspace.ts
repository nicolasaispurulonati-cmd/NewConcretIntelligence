import 'server-only';

/**
 * El registro de widgets del Workspace.
 *
 * Cada dominio publica acá los widgets que sabe construir. El Workspace no
 * conoce ningún dominio: recorre la configuración de la persona y pide cada
 * widget por su identificador. Así, agregar Compras no obliga a tocar el
 * escritorio de nadie — que es el Principio 11 en la práctica.
 */

import { desc, eq, isNull, and } from 'drizzle-orm';

import type { Scope } from '@nci/core';
import { activity, entities, notifications, quotes, workspaceWidgets } from '@nci/db';
import { ROLES, type RoleId } from '@nci/domain';
import { formatRelativeTime, metric, type Metric } from '@nci/design';
import {
  countAwaitingResponse,
  countQuotes,
  formatMoney,
  openQuoteTotals,
  type OpenQuoteTotals,
} from '@nci/sales';

/**
 * Una fila de widget.
 *
 * `href` no es decoración. Un escritorio que enumera lo que hay que hacer y
 * no deja llegar a ninguna de esas cosas obliga a buscar de nuevo por nombre
 * lo que el sistema acaba de mostrar. La consulta ya trae el slug; lo que
 * faltaba era no descartarlo.
 */
export interface WidgetLineData {
  readonly primary: string;
  readonly secondary: string;
  /** A dónde lleva. Ausente cuando la fila no representa una entidad. */
  readonly href?: string;
  /** Quién y de dónde. Principio 10: el tiempo y el autor son visibles. */
  readonly meta?: string;
  /** La acción concreta que resuelve esta fila, cuando el dato la trae. */
  readonly action?: { readonly label: string; readonly href: string };
}

export interface WidgetRenderable {
  readonly id: string;
  readonly title: string;
  readonly metric?: Metric;
  readonly lines?: readonly WidgetLineData[];
  /**
   * Cuántos elementos existen más allá de los que se listan.
   *
   * Una lista truncada que no lo dice es indistinguible de una completa. Quien
   * la mira se forma una creencia sobre el total y decide con ella, que es el
   * mismo defecto del indicador que sumaba las filas visibles — con otra forma.
   *
   * Se declara sólo donde alguien decide algo mirando la lista.
   */
  readonly truncatedCount?: number;
  /** Cuando el widget no tiene nada que mostrar, dice por qué y qué hacer. */
  readonly emptyMessage?: string;
}

type WidgetLoader = (scope: Scope) => Promise<WidgetRenderable | null>;

/**
 * Cuántas filas muestra un widget.
 *
 * Es un límite de presentación y nada más. Ningún indicador puede calcularse
 * sobre estas filas: el agregado se pide aparte, sobre el conjunto completo.
 */
export const LISTA_MAXIMA = 6;

const REGISTRY: Record<string, WidgetLoader> = {
  /**
   * Los presupuestos de esta persona, con lo que hay que hacer con cada uno.
   *
   * No es una lista de documentos: es una lista de decisiones pendientes. Un
   * borrador sin enviar y un enviado hace ocho días sin respuesta requieren
   * cosas distintas, y el widget lo dice.
   */
  'sales.my_quotes': async (scope) => {
    if (!scope.actor.canActOn('quote', 'read')) return null;

    // Dos consultas con propósitos distintos. La lista muestra lo último que
    // se tocó y está truncada a propósito; el indicador tiene que hablar del
    // conjunto entero, así que se agrega en la base y no sobre estas filas.
    const [rows, abiertos, propios] = await Promise.all([
      scope.db
        .select({
          number: quotes.number,
          version: quotes.version,
          total: quotes.total,
          currency: quotes.currency,
          sentAt: quotes.sentAt,
          status: entities.status,
          customer: entities.subtitle,
          slug: entities.slug,
        })
        .from(quotes)
        .innerJoin(entities, eq(entities.id, quotes.entityId))
        .where(and(eq(quotes.ownerId, scope.actor.id), isNull(entities.archivedAt)))
        .orderBy(desc(entities.updatedAt))
        .limit(LISTA_MAXIMA),
      openQuoteTotals(scope, { ownerId: scope.actor.id }),
      countQuotes(scope, { ownerId: scope.actor.id }),
    ]);

    return {
      id: 'sales.my_quotes',
      title: 'Tus presupuestos',
      truncatedCount: Math.max(0, propios - rows.length),
      // El importe solo no dice nada: lo que importa es cuánto de eso todavía
      // depende de una acción tuya y cuánto de una respuesta del cliente.
      ...(abiertos.length > 0 ? { metric: comprometido(abiertos) } : {}),
      lines: rows.map((row) => ({
        primary: `${row.number}${row.version > 1 ? ` v${row.version}` : ''} · ${row.customer ?? 'sin cliente'}`,
        secondary: describeQuote(row.status, row.sentAt, row.total, row.currency),
        // Un borrador se sigue armando; lo demás ya está cerrado y se consulta.
        href: row.status === 'borrador' ? `/presupuesto/${row.slug}` : `/e/quote/${row.slug}`,
      })),
      emptyMessage:
        'Todavía no creaste presupuestos. Se crean desde la ficha del cliente, o con Ctrl+K.',
    };
  },

  /**
   * Clientes que quedaron esperando.
   *
   * Un presupuesto enviado sin respuesta es la deuda más común del trabajo
   * comercial, y la más fácil de olvidar.
   */
  'crm.follow_ups': async (scope) => {
    if (!scope.actor.canActOn('quote', 'read')) return null;

    // La lista y el total, por separado. El total no puede salir de la lista:
    // ése es exactamente el error que ya se corrigió en el indicador de
    // comprometido, y acá el costo de repetirlo es un seguimiento que nadie
    // hace porque nunca supo que existía.
    const [rows, esperando] = await Promise.all([
      scope.db
        .select({
          number: quotes.number,
          customer: entities.subtitle,
          total: quotes.total,
          currency: quotes.currency,
          sentAt: quotes.sentAt,
          slug: entities.slug,
        })
        .from(quotes)
        .innerJoin(entities, eq(entities.id, quotes.entityId))
        .where(
          and(
            eq(entities.status, 'enviado'),
            isNull(quotes.respondedAt),
            isNull(entities.archivedAt),
          ),
        )
        .orderBy(quotes.sentAt)
        .limit(LISTA_MAXIMA),
      countAwaitingResponse(scope),
    ]);

    return {
      id: 'crm.follow_ups',
      title: 'Esperan respuesta',
      truncatedCount: Math.max(0, esperando - rows.length),
      lines: rows.map((row) => ({
        primary: `${row.customer ?? 'Cliente'} · ${row.number}`,
        secondary: row.sentAt
          ? `${formatMoney(row.total, row.currency)} · enviado ${formatRelativeTime(row.sentAt).toLowerCase()}`
          : formatMoney(row.total, row.currency),
        href: `/e/quote/${row.slug}`,
      })),
      emptyMessage: 'No hay presupuestos esperando respuesta.',
    };
  },

  /** Lo que pasó en la empresa, en el orden en que pasó. */
  'activity.feed': async (scope) => {
    const events = await recentActivity(scope);

    return {
      id: 'activity.feed',
      title: 'Actividad de la empresa',
      // Acá el autor importa: es actividad de todos, y "se emitió P-2026-0007"
      // sin decir quién lo emitió es la mitad del hecho.
      lines: events.map((event) => comoLinea(event, { conAutor: true })),
      emptyMessage:
        'Todavía no hay actividad registrada. Aparecerá acá en cuanto alguien cree o modifique algo.',
    };
  },

  /** Lo que hizo esta persona. Su propia línea de tiempo. */
  'activity.mine': async (scope) => {
    const events = await recentActivity(scope, scope.actor.id);

    return {
      id: 'activity.mine',
      title: 'Tu actividad reciente',
      // Acá no: el autor sos vos en todas las filas, y repetirlo es ruido.
      lines: events.map((event) => comoLinea(event, { conAutor: false })),
      emptyMessage: 'Todavía no registraste actividad en la plataforma.',
    };
  },

  /** Sólo lo importante. Y siempre con la razón por la que aparece. */
  'notifications.important': async (scope) => {
    const pending = await scope.db
      .select({
        id: notifications.id,
        title: notifications.title,
        reason: notifications.reason,
        actionLabel: notifications.actionLabel,
        actionHref: notifications.actionHref,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.userId, scope.actor.id), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(LISTA_MAXIMA);

    return {
      id: 'notifications.important',
      title: 'Requiere tu atención',
      lines: pending.map((item) => ({
        primary: item.title,
        secondary: item.reason,
        meta: formatRelativeTime(item.createdAt),
        // "Sin acción posible no hay notificación", dice el esquema. La
        // pantalla no mostraba ninguna: avisaba de algo y dejaba a la persona
        // averiguando por su cuenta dónde se resolvía.
        ...(item.actionLabel && item.actionHref
          ? { action: { label: item.actionLabel, href: item.actionHref } }
          : {}),
      })),
      emptyMessage: 'No hay nada pendiente que requiera tu atención.',
    };
  },
};

/**
 * Los últimos hechos registrados, con su entidad.
 *
 * El join trae tipo y slug para poder llegar a lo que el hecho menciona. Sin
 * él, el escritorio cuenta que algo pasó y obliga a buscarlo por nombre.
 */
async function recentActivity(
  scope: Scope,
  actorId?: string,
): Promise<
  readonly {
    summary: string;
    occurredAt: Date;
    actorName: string;
    source: string;
    sourceSystem: string | null;
    type: string | null;
    slug: string | null;
  }[]
> {
  const base = scope.db
    .select({
      summary: activity.summary,
      occurredAt: activity.occurredAt,
      actorName: activity.actorName,
      source: activity.source,
      sourceSystem: activity.sourceSystem,
      type: entities.type,
      slug: entities.slug,
    })
    .from(activity)
    .leftJoin(entities, eq(entities.id, activity.entityId));

  return actorId
    ? base.where(eq(activity.actorId, actorId)).orderBy(desc(activity.occurredAt)).limit(LISTA_MAXIMA)
    : base.orderBy(desc(activity.occurredAt)).limit(LISTA_MAXIMA);
}

/** Un hecho, dicho como lo lee una persona. */
function comoLinea(
  event: {
    summary: string;
    occurredAt: Date;
    actorName: string;
    source: string;
    sourceSystem: string | null;
    type: string | null;
    slug: string | null;
  },
  opciones: { conAutor: boolean },
): WidgetLineData {
  // De dónde salió el hecho. Principio 14: lo que hizo la IA se distingue de
  // lo que hizo una persona, y de lo que llegó de otro sistema.
  const procedencia =
    event.source === 'ai'
      ? 'IA'
      : event.source === 'integration'
        ? (event.sourceSystem ?? 'Integración')
        : opciones.conAutor
          ? event.actorName
          : null;

  return {
    primary: event.summary,
    secondary: formatRelativeTime(event.occurredAt),
    ...(procedencia ? { meta: procedencia } : {}),
    ...(event.type && event.slug ? { href: `/e/${event.type}/${event.slug}` } : {}),
  };
}

export interface WorkspaceLayout {
  readonly widgets: readonly WidgetRenderable[];
  /**
   * Widgets configurados cuyo dominio todavía no existe. Se informan en lugar
   * de ocultarse: el usuario nunca se pierde, y sabe qué está por venir.
   */
  readonly pending: readonly string[];
}

/**
 * Arma el escritorio de una persona.
 *
 * Si nunca configuró el suyo, se usa el propuesto por sus roles — nadie
 * empieza frente a una pantalla vacía, y nadie ve el escritorio de otro.
 */
export async function loadWorkspace(scope: Scope): Promise<WorkspaceLayout> {
  const configured = await scope.db
    .select({ widgetId: workspaceWidgets.widgetId })
    .from(workspaceWidgets)
    .where(and(eq(workspaceWidgets.userId, scope.actor.id), eq(workspaceWidgets.visible, true)))
    .orderBy(workspaceWidgets.position);

  const wanted =
    configured.length > 0
      ? configured.map((row) => row.widgetId)
      : defaultWidgetsFor(scope.actor.roles);

  const widgets: WidgetRenderable[] = [];
  const pending: string[] = [];

  for (const widgetId of wanted) {
    const loader = REGISTRY[widgetId];
    if (!loader) {
      pending.push(widgetId);
      continue;
    }
    const rendered = await loader(scope);
    if (rendered) widgets.push(rendered);
  }

  return { widgets, pending };
}

/**
 * El indicador de comprometido, armado desde el agregado por moneda.
 *
 * Con más de una moneda los importes se muestran uno al lado del otro y el
 * rótulo lo aclara. No se suman ni se convierten: sin tipo de cambio, un único
 * número sería una cifra inventada con apariencia de total. Ver D-003.
 */
export function comprometido(abiertos: readonly OpenQuoteTotals[]): Metric {
  const importes = abiertos.map((fila) => formatMoney(fila.total, fila.currency));
  // "Sin enviar" son los dos estados que todavía no salieron: el que se está
  // escribiendo y el que ya se cerró y espera que alguien lo mande. Los dos le
  // piden algo a quien mira el tablero, y es la misma acción.
  const sinEnviar = abiertos.reduce((total, fila) => total + fila.drafts + fila.issued, 0);
  const esperando = abiertos.reduce((total, fila) => total + fila.awaiting, 0);

  return metric({
    label:
      abiertos.length > 1
        ? 'Comprometido en presupuestos abiertos, por moneda'
        : 'Comprometido en presupuestos abiertos',
    value: importes.join(' · '),
    context: [
      { label: 'Sin enviar', value: String(sinEnviar) },
      { label: 'Esperando respuesta', value: String(esperando) },
    ],
  });
}

/**
 * Qué significa el estado de un presupuesto, en una frase.
 *
 * Principio 8 del PDL: el estado nunca se comunica sólo con un color o una
 * etiqueta. "Enviado" no dice nada; "enviado hace 8 días, sin respuesta" dice
 * qué hacer.
 */
function describeQuote(
  status: string | null,
  sentAt: Date | null,
  total: number,
  currency: string,
): string {
  const importe = formatMoney(total, currency);

  switch (status) {
    case 'borrador':
      return `${importe} · borrador, todavía sin emitir`;
    case 'emitido':
      // Emitido y sin enviar es una tarea pendiente concreta, y el estado la
      // tiene que decir. Es el caso que antes no se podía representar.
      return `${importe} · emitido, falta enviarlo al cliente`;
    case 'enviado':
      return sentAt
        ? `${importe} · enviado ${formatRelativeTime(sentAt)}, sin respuesta`
        : `${importe} · enviado, sin respuesta`;
    case 'aceptado':
      return `${importe} · aceptado`;
    case 'rechazado':
      return `${importe} · rechazado`;
    case 'vencido':
      return `${importe} · vencido sin respuesta`;
    default:
      return importe;
  }
}

/** La unión de lo que proponen los roles de la persona, sin repetir. */
function defaultWidgetsFor(roles: readonly RoleId[]): readonly string[] {
  const proposed = roles.flatMap((roleId) => ROLES[roleId]?.defaultWorkspace ?? []);
  // Sin rol asignado igual se muestra algo útil y no una pantalla en blanco.
  return proposed.length > 0
    ? [...new Set(proposed)]
    : ['activity.mine', 'notifications.important'];
}
