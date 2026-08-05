/**
 * El Presupuesto.
 *
 * "No es un PDF. Es una entidad."
 *
 * Todo lo que se puede hacer con un presupuesto pasa por acá: crearlo, cargar
 * renglones, enviarlo, aceptarlo, rechazarlo y versionarlo. Las reglas viven
 * en un solo lugar para que la pantalla, la API y la IA no puedan aplicar
 * criterios distintos sobre el mismo documento.
 */

import { and, asc, count, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';

import {
  ValidationError,
  createEntity,
  getEntity,
  recordActivity,
  relate,
  updateEntity,
  type EntityNode,
  type Scope,
} from '@nci/core';
import { customers, entities, quoteItems, quotes } from '@nci/db';

import { calculateLine, calculateQuote, formatMoney, type Cents } from './money.js';

/** Los estados por los que pasa un presupuesto, y a cuáles puede ir cada uno. */
const TRANSITIONS: Record<string, readonly string[]> = {
  borrador: ['enviado'],
  enviado: ['aceptado', 'rechazado', 'vencido'],
  aceptado: [],
  rechazado: [],
  vencido: [],
};

export interface QuoteItemInput {
  /** La variante cotizada. Nula para un renglón libre: flete, mano de obra. */
  readonly variantId?: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit?: string;
  readonly unitPrice: Cents;
  readonly discountPercent?: number;
  readonly taxRate?: number;
  /**
   * La moneda es del presupuesto, no del renglón. Ver D-003.
   *
   * Declarada como `never` para que asignarla sea un error de compilación y
   * no un campo que se acepta y se descarta en silencio. La moneda se elige
   * al crear el presupuesto, en `CreateQuoteInput`.
   */
  readonly currency?: never;
}

export interface QuoteLine extends QuoteItemInput {
  readonly id: string;
  readonly position: number;
  readonly unit: string;
  readonly discountPercent: number;
  readonly taxRate: number;
  readonly lineTotal: Cents;
}

export interface Quote {
  readonly entity: EntityNode;
  readonly number: string;
  readonly version: number;
  readonly currency: string;
  readonly status: string;
  readonly validUntil: string | null;
  readonly paymentTermsDays: number | null;
  readonly subtotal: Cents;
  readonly discountTotal: Cents;
  readonly taxTotal: Cents;
  readonly total: Cents;
  readonly notes: string | null;
  readonly sentAt: Date | null;
  readonly sentVia: string | null;
  readonly rejectionReason: string | null;
  readonly items: readonly QuoteLine[];
}

// ─────────────────────────────────────────────────────────────────────────
// Crear
// ─────────────────────────────────────────────────────────────────────────

export interface CreateQuoteInput {
  readonly customerId: string;
  readonly validUntil?: string;
  readonly notes?: string;
  readonly currency?: string;
}

/**
 * Crea un presupuesto en borrador para un cliente.
 *
 * Antes de crear nada verifica que el cliente tenga condición de pago. Es la
 * situación que el PDL usa como ejemplo de error que enseña: en lugar de
 * fallar al generar el PDF, se explica la causa y se ofrece la acción que la
 * resuelve.
 */
export async function createQuote(scope: Scope, input: CreateQuoteInput): Promise<Quote> {
  scope.actor.assertCanActOn('quote', 'create');

  const customer = await getEntity(scope, input.customerId);
  if (customer.type !== 'customer') {
    throw new ValidationError({
      message: 'No fue posible generar el presupuesto.',
      reason: 'Un presupuesto se emite a un cliente, y el elemento indicado no lo es.',
    });
  }

  const [commercial] = await scope.db
    .select({ paymentTermsDays: customers.paymentTermsDays, currency: customers.currency })
    .from(customers)
    .where(eq(customers.entityId, input.customerId))
    .limit(1);

  if (!commercial || commercial.paymentTermsDays === null) {
    throw new ValidationError({
      message: `No fue posible generar el presupuesto porque ${customer.displayName} no tiene una condición de pago asignada.`,
      reason:
        'La condición de pago determina el vencimiento y las cuotas, así que el presupuesto no puede emitirse sin ella.',
      field: 'paymentTermsDays',
      actions: [
        {
          label: 'Configurar condición de pago',
          href: `/e/customer/${customer.slug}`,
          requires: 'crm.customer.update',
        },
      ],
    });
  }

  const number = await nextQuoteNumber(scope);
  const currency = input.currency ?? commercial.currency;

  const entity = await createEntity(scope, {
    type: 'quote',
    slug: number.toLowerCase(),
    displayName: number,
    subtitle: customer.displayName,
    status: 'borrador',
    searchableText: `${number} ${customer.displayName} presupuesto`,
  });

  await scope.db.insert(quotes).values({
    entityId: entity.id,
    number,
    version: 1,
    currency,
    validUntil: input.validUntil ?? null,
    paymentTermsDays: commercial.paymentTermsDays,
    notes: input.notes ?? null,
    ownerId: scope.actor.id,
  });

  // La relación con el cliente vive en el grafo, no en una clave foránea: es
  // lo que hace que abrir el cliente muestre sus presupuestos sin que el CRM
  // sepa que existe el dominio de ventas.
  await relate(scope, { type: 'quoted_to', fromId: entity.id, toId: customer.id });

  return loadQuote(scope, entity.id);
}

/**
 * Correlativo del año: `P-2026-0001`.
 *
 * Se calcula a partir del último emitido. El índice único sobre número y
 * versión es la garantía real: si dos personas cotizan en el mismo instante,
 * una de las dos reintenta en lugar de duplicar el número.
 */
async function nextQuoteNumber(scope: Scope): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `P-${year}-`;

  const [last] = await scope.db
    .select({ number: quotes.number })
    .from(quotes)
    .where(like(quotes.number, `${prefix}%`))
    .orderBy(desc(quotes.number))
    .limit(1);

  const sequence = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Renglones
// ─────────────────────────────────────────────────────────────────────────

/**
 * Agrega un renglón y recalcula los totales.
 *
 * La descripción y el precio se guardan tal como están hoy. Si mañana cambia
 * la lista de precios, este presupuesto sigue diciendo lo que se le prometió
 * al cliente.
 */
export async function addQuoteItem(
  scope: Scope,
  quoteId: string,
  item: QuoteItemInput,
): Promise<Quote> {
  const quote = await loadQuote(scope, quoteId);
  assertEditable(quote);
  scope.actor.assertCanActOn('quote', 'update');

  if (item.quantity <= 0) {
    throw new ValidationError({
      message: 'La cantidad tiene que ser mayor que cero.',
      reason: 'Un renglón sin cantidad no representa nada que se pueda vender.',
      field: 'quantity',
    });
  }

  const position = quote.items.length;

  const amounts = calculateLine({
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountPercent: item.discountPercent ?? 0,
    taxRate: item.taxRate ?? 21,
  });

  await scope.db.insert(quoteItems).values({
    quoteId,
    position,
    variantId: item.variantId ?? null,
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit ?? 'unidad',
    unitPrice: item.unitPrice,
    discountPercent: String(item.discountPercent ?? 0),
    taxRate: String(item.taxRate ?? 21),
    lineTotal: amounts.net,
  });

  // Cotizar un producto lo relaciona con el presupuesto: desde el producto se
  // puede ver en cuántos presupuestos aparece y por cuánto.
  if (item.variantId) {
    await relate(scope, {
      type: 'includes_product',
      fromId: quoteId,
      toId: item.variantId,
      metadata: { quantity: item.quantity, unitPrice: item.unitPrice },
    });
  }

  return recalculate(scope, quoteId);
}

export async function removeQuoteItem(
  scope: Scope,
  quoteId: string,
  itemId: string,
): Promise<Quote> {
  const quote = await loadQuote(scope, quoteId);
  assertEditable(quote);
  scope.actor.assertCanActOn('quote', 'update');

  await scope.db.delete(quoteItems).where(and(eq(quoteItems.id, itemId), eq(quoteItems.quoteId, quoteId)));

  return recalculate(scope, quoteId);
}

/** Recalcula los totales a partir de los renglones y los guarda. */
async function recalculate(scope: Scope, quoteId: string): Promise<Quote> {
  const lines = await scope.db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId))
    .orderBy(asc(quoteItems.position));

  const amounts = calculateQuote(
    lines.map((line) => ({
      quantity: Number(line.quantity),
      unitPrice: line.unitPrice,
      discountPercent: Number(line.discountPercent),
      taxRate: Number(line.taxRate),
    })),
  );

  await scope.db
    .update(quotes)
    .set({
      subtotal: amounts.subtotal,
      discountTotal: amounts.discountTotal,
      taxTotal: amounts.taxTotal,
      total: amounts.total,
    })
    .where(eq(quotes.entityId, quoteId));

  return loadQuote(scope, quoteId);
}

// ─────────────────────────────────────────────────────────────────────────
// Ciclo de vida
// ─────────────────────────────────────────────────────────────────────────

/**
 * Marca el presupuesto como enviado.
 *
 * Desde acá deja de ser editable. Lo que el cliente recibió tiene que poder
 * leerse tal como se envió — para cambiar algo se emite una versión nueva.
 */
export async function sendQuote(
  scope: Scope,
  quoteId: string,
  via: 'correo' | 'whatsapp' | 'mano',
): Promise<Quote> {
  const quote = await loadQuote(scope, quoteId);
  scope.actor.assertCanActOn('quote', 'update');
  assertTransition(quote, 'enviado');

  if (quote.items.length === 0) {
    throw new ValidationError({
      message: 'No fue posible enviar el presupuesto porque no tiene renglones.',
      reason: 'Un presupuesto sin ítems no comunica ninguna oferta.',
      actions: [{ label: 'Agregar un producto' }],
    });
  }

  await scope.db
    .update(quotes)
    .set({ sentAt: new Date(), sentVia: via })
    .where(eq(quotes.entityId, quoteId));

  await updateEntity(scope, quoteId, { status: 'enviado' });

  await recordActivity(scope, {
    entityId: quoteId,
    verb: 'envió',
    summary: `${scope.actor.fullName} envió ${quote.number} por ${via} — ${formatMoney(quote.total, quote.currency)}.`,
  });

  return loadQuote(scope, quoteId);
}

export async function acceptQuote(scope: Scope, quoteId: string): Promise<Quote> {
  const quote = await loadQuote(scope, quoteId);
  scope.actor.assertCanActOn('quote', 'approve');
  assertTransition(quote, 'aceptado');

  await scope.db
    .update(quotes)
    .set({ respondedAt: new Date() })
    .where(eq(quotes.entityId, quoteId));

  await updateEntity(scope, quoteId, { status: 'aceptado' });

  await recordActivity(scope, {
    entityId: quoteId,
    verb: 'aceptó',
    summary: `${quote.number} fue aceptado por ${formatMoney(quote.total, quote.currency)}.`,
  });

  return loadQuote(scope, quoteId);
}

/**
 * Rechaza el presupuesto. El motivo es obligatorio.
 *
 * Sin el motivo, el pipeline sabe cuánto se perdió pero nunca por qué — y esa
 * es justamente la información que sirve para la próxima cotización.
 */
export async function rejectQuote(
  scope: Scope,
  quoteId: string,
  reason: string,
): Promise<Quote> {
  const quote = await loadQuote(scope, quoteId);
  scope.actor.assertCanActOn('quote', 'update');
  assertTransition(quote, 'rechazado');

  if (reason.trim().length < 3) {
    throw new ValidationError({
      message: 'Falta indicar por qué se rechazó.',
      reason:
        'El motivo es lo que permite entender qué ajustar la próxima vez. Sin él sólo queda registrado que se perdió.',
      field: 'reason',
    });
  }

  await scope.db
    .update(quotes)
    .set({ respondedAt: new Date(), rejectionReason: reason.trim() })
    .where(eq(quotes.entityId, quoteId));

  await updateEntity(scope, quoteId, { status: 'rechazado' });

  await recordActivity(scope, {
    entityId: quoteId,
    verb: 'rechazó',
    summary: `${quote.number} fue rechazado: ${reason.trim()}`,
  });

  return loadQuote(scope, quoteId);
}

/**
 * Crea la versión siguiente, copiando los renglones.
 *
 * El original no se toca. Quedan relacionados por `supersedes`, así que desde
 * cualquiera de los dos se puede ver la negociación completa.
 */
export async function createNewVersion(scope: Scope, quoteId: string): Promise<Quote> {
  scope.actor.assertCanActOn('quote', 'create');
  const previous = await loadQuote(scope, quoteId);

  const customer = await customerOf(scope, quoteId);
  const number = previous.number;
  const version = previous.version + 1;

  const entity = await createEntity(scope, {
    type: 'quote',
    slug: `${number.toLowerCase()}-v${version}`,
    displayName: `${number} v${version}`,
    ...(previous.entity.subtitle ? { subtitle: previous.entity.subtitle } : {}),
    status: 'borrador',
    searchableText: `${number} versión ${version} presupuesto`,
  });

  await scope.db.insert(quotes).values({
    entityId: entity.id,
    number,
    version,
    currency: previous.currency,
    validUntil: previous.validUntil,
    paymentTermsDays: previous.paymentTermsDays,
    notes: previous.notes,
    ownerId: scope.actor.id,
  });

  if (previous.items.length > 0) {
    await scope.db.insert(quoteItems).values(
      previous.items.map((item) => ({
        quoteId: entity.id,
        position: item.position,
        variantId: item.variantId ?? null,
        description: item.description,
        quantity: String(item.quantity),
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountPercent: String(item.discountPercent),
        taxRate: String(item.taxRate),
        lineTotal: item.lineTotal,
      })),
    );
  }

  await relate(scope, { type: 'supersedes', fromId: entity.id, toId: quoteId });
  if (customer) {
    await relate(scope, { type: 'quoted_to', fromId: entity.id, toId: customer });
  }

  await recordActivity(scope, {
    entityId: quoteId,
    verb: 'versionó',
    summary: `${scope.actor.fullName} creó la versión ${version} de ${number}.`,
    relatedEntityId: entity.id,
  });

  return recalculate(scope, entity.id);
}

// ─────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────

export async function loadQuote(scope: Scope, quoteId: string): Promise<Quote> {
  const entity = await getEntity(scope, quoteId);

  const [header] = await scope.db.select().from(quotes).where(eq(quotes.entityId, quoteId)).limit(1);
  if (!header) {
    throw new ValidationError({
      message: 'El presupuesto está incompleto.',
      reason: 'Existe la entidad pero no sus datos comerciales.',
    });
  }

  const lines = await scope.db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId))
    .orderBy(asc(quoteItems.position));

  return {
    entity,
    number: header.number,
    version: header.version,
    currency: header.currency,
    status: entity.status ?? 'borrador',
    validUntil: header.validUntil,
    paymentTermsDays: header.paymentTermsDays,
    subtotal: header.subtotal,
    discountTotal: header.discountTotal,
    taxTotal: header.taxTotal,
    total: header.total,
    notes: header.notes,
    sentAt: header.sentAt,
    sentVia: header.sentVia,
    rejectionReason: header.rejectionReason,
    items: lines.map((line) => ({
      id: line.id,
      position: line.position,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unitPrice: line.unitPrice,
      discountPercent: Number(line.discountPercent),
      taxRate: Number(line.taxRate),
      lineTotal: line.lineTotal,
    })),
  };
}

/** Los estados en los que un presupuesto todavía espera algo de alguien. */
const OPEN_STATUSES = ['borrador', 'enviado'] as const;

export interface OpenQuoteTotals {
  readonly currency: string;
  /** Suma de los totales de esa moneda. Nunca se combina con otra. */
  readonly total: Cents;
  readonly drafts: number;
  readonly awaiting: number;
}

/**
 * Cuánto hay comprometido en presupuestos abiertos, agrupado por moneda.
 *
 * Se agrega en la base y sobre el conjunto completo. Derivarlo de una lista
 * paginada produce un número que parece un total y no lo es — y el error es
 * silencioso: no hace falta ninguna condición rara, alcanza con tener más
 * presupuestos abiertos que filas muestre la lista.
 *
 * Se agrupa por moneda y no se suman dos. No hay tipo de cambio en el sistema
 * y convertir sin uno sería inventar una cifra. Ver D-003.
 *
 * `ownerId` acota la vista, no el permiso: quien puede leer presupuestos puede
 * leerlos todos, y este parámetro sólo elige con cuáles se abre la pantalla.
 * Ver D-004.
 */
export async function openQuoteTotals(
  scope: Scope,
  view: { readonly ownerId?: string } = {},
): Promise<OpenQuoteTotals[]> {
  scope.actor.assertCanActOn('quote', 'read');

  const rows = await scope.db
    .select({
      currency: quotes.currency,
      total: sql<number>`coalesce(sum(${quotes.total}), 0)`,
      drafts: sql<number>`count(*) filter (where ${entities.status} = 'borrador')`,
      awaiting: sql<number>`count(*) filter (where ${entities.status} = 'enviado')`,
    })
    .from(quotes)
    .innerJoin(entities, eq(entities.id, quotes.entityId))
    .where(
      and(
        inArray(entities.status, [...OPEN_STATUSES]),
        isNull(entities.archivedAt),
        ...(view.ownerId ? [eq(quotes.ownerId, view.ownerId)] : []),
      ),
    )
    .groupBy(quotes.currency)
    .orderBy(quotes.currency);

  // Las sumas y los conteos vuelven como texto: son `bigint` del lado del
  // servidor. Es el mismo camino que ya usa la búsqueda con su puntaje.
  return rows.map((row) => ({
    currency: row.currency,
    total: Number(row.total),
    drafts: Number(row.drafts),
    awaiting: Number(row.awaiting),
  }));
}

/**
 * Cuántos presupuestos esperan respuesta del cliente.
 *
 * El conteo completo, sin límite. Existe porque la pantalla lista unos pocos y
 * necesita poder decir cuántos quedaron afuera: un vendedor que ve seis
 * seguimientos y actúa como si fueran todos se forma una creencia falsa, y acá
 * el costo es un seguimiento que nunca se hace.
 *
 * Vive en el dominio y no en el widget, por D-008.
 */
export async function countAwaitingResponse(scope: Scope): Promise<number> {
  scope.actor.assertCanActOn('quote', 'read');

  const [fila] = await scope.db
    .select({ total: count() })
    .from(quotes)
    .innerJoin(entities, eq(entities.id, quotes.entityId))
    .where(
      and(
        eq(entities.status, 'enviado'),
        isNull(quotes.respondedAt),
        isNull(entities.archivedAt),
      ),
    );

  return Number(fila?.total ?? 0);
}

/** El cliente al que se le emitió, según el grafo. */
async function customerOf(scope: Scope, quoteId: string): Promise<string | null> {
  const [row] = await scope.db
    .select({ id: entities.id })
    .from(entities)
    .innerJoin(
      sql`entity_relations`,
      sql`entity_relations.to_id = ${entities.id} and entity_relations.from_id = ${quoteId} and entity_relations.type = 'quoted_to'`,
    )
    .where(eq(entities.type, 'customer'))
    .limit(1);

  return row?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Reglas de estado
// ─────────────────────────────────────────────────────────────────────────

function assertEditable(quote: Quote): void {
  if (quote.status === 'borrador') return;

  throw new ValidationError({
    message: `${quote.number} ya no se puede modificar.`,
    reason: `Está en estado "${quote.status}". Lo que se le envió al cliente tiene que quedar como se envió.`,
    actions: [{ label: 'Crear una versión nueva', requires: 'sales.quote.create' }],
  });
}

function assertTransition(quote: Quote, next: string): void {
  const allowed = TRANSITIONS[quote.status] ?? [];
  if (allowed.includes(next)) return;

  throw new ValidationError({
    message: `${quote.number} no puede pasar a "${next}".`,
    reason:
      allowed.length > 0
        ? `Desde "${quote.status}" sólo puede pasar a: ${allowed.join(', ')}.`
        : `"${quote.status}" es un estado final: el presupuesto ya está cerrado.`,
  });
}
