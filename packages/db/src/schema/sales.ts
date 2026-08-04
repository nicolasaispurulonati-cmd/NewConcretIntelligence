/**
 * Dominio Sales — el proceso comercial.
 *
 * "El presupuesto no es un PDF. Es una entidad."
 *
 * De ahí sale casi todo lo de acá. Un PDF se genera y se pierde; una entidad
 * tiene estado, versiones, historia y relaciones. Se le puede preguntar en qué
 * quedó, qué cambió respecto de la versión anterior y por qué se perdió.
 *
 * Ver: 4. Domain Model — Presupuesto.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { entities } from './graph.js';
import { users } from './identity.js';

/**
 * Los estados por los que pasa un presupuesto.
 *
 * Se declaran acá y se validan en la base: un estado inventado por un dominio
 * futuro rompería los listados y los indicadores en silencio.
 */
export const QUOTE_STATUSES = [
  'borrador',
  'enviado',
  'aceptado',
  'rechazado',
  'vencido',
] as const;

export const quotes = pgTable(
  'quotes',
  {
    entityId: uuid('entity_id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),

    /** Correlativo legible: `P-2026-0042`. Es el displayName de la entidad. */
    number: text('number').notNull(),

    /**
     * Número de versión dentro de la misma negociación.
     *
     * Una versión nueva es un presupuesto nuevo, relacionado con el anterior
     * por `supersedes` en el grafo. No se pisa el original: lo que se le envió
     * al cliente tiene que poder leerse tal como se envió.
     */
    version: integer('version').notNull().default(1),

    currency: text('currency').notNull().default('ARS'),
    validUntil: date('valid_until'),

    /**
     * Condición de pago, copiada del cliente al crear el presupuesto.
     *
     * Es una copia y no una consulta: si mañana al cliente se le cambia el
     * plazo, el presupuesto que ya se envió sigue diciendo lo que decía.
     */
    paymentTermsDays: integer('payment_terms_days'),

    // ── Importes, en centavos ──────────────────────────────────────────
    // Se calculan a partir de los renglones y se guardan. Recalcularlos en
    // cada consulta haría imposible listar o sumar presupuestos sin leer
    // todos sus renglones.
    subtotal: bigint('subtotal', { mode: 'number' }).notNull().default(0),
    discountTotal: bigint('discount_total', { mode: 'number' }).notNull().default(0),
    taxTotal: bigint('tax_total', { mode: 'number' }).notNull().default(0),
    total: bigint('total', { mode: 'number' }).notNull().default(0),

    notes: text('notes'),

    // ── Seguimiento ────────────────────────────────────────────────────
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** Por dónde se envió: 'correo' | 'whatsapp' | 'mano'. */
    sentVia: text('sent_via'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    /**
     * Por qué se rechazó. Junto con `lostReason` de la oportunidad, es lo que
     * convierte un pipeline en conocimiento en vez de un tablero de números.
     */
    rejectionReason: text('rejection_reason'),

    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('quotes_number_version_unique').on(table.number, table.version),
    index('quotes_owner_idx').on(table.ownerId),
    index('quotes_sent_idx').on(table.sentAt),
    check('quotes_version_positive', sql`${table.version} >= 1`),
    check(
      'quotes_totals_not_negative',
      sql`${table.subtotal} >= 0 and ${table.taxTotal} >= 0 and ${table.total} >= 0`,
    ),
  ],
);

/**
 * Los renglones del presupuesto.
 *
 * Cada uno guarda una copia de la descripción y del precio del producto en el
 * momento de cotizar. Es deliberado: un presupuesto es un compromiso comercial,
 * y no puede cambiar solo porque cambió una lista de precios.
 */
export const quoteItems = pgTable(
  'quote_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.entityId, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),

    /**
     * La variante cotizada. Nula permite renglones libres — un flete, una
     * mano de obra, un ítem que todavía no está en el catálogo.
     */
    variantId: uuid('variant_id').references(() => entities.id, { onDelete: 'set null' }),

    /** Copia del nombre al momento de cotizar. Nunca se actualiza sola. */
    description: text('description').notNull(),

    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    /** 'litro' | 'kg' | 'unidad' | 'm2' | 'hora'. */
    unit: text('unit').notNull().default('unidad'),
    /** Copia del precio unitario al momento de cotizar, en centavos. */
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),

    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    /** IVA del renglón. En Argentina la mayoría es 21, pero no toda. */
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('21'),

    /** Neto del renglón con descuento aplicado, sin IVA. En centavos. */
    lineTotal: bigint('line_total', { mode: 'number' }).notNull().default(0),
  },
  (table) => [
    index('quote_items_quote_idx').on(table.quoteId, table.position),
    index('quote_items_variant_idx').on(table.variantId),
    check('quote_items_quantity_positive', sql`${table.quantity} > 0`),
    check('quote_items_price_not_negative', sql`${table.unitPrice} >= 0`),
    check(
      'quote_items_discount_valid',
      sql`${table.discountPercent} >= 0 and ${table.discountPercent} <= 100`,
    ),
  ],
);

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  entity: one(entities, { fields: [quotes.entityId], references: [entities.id] }),
  owner: one(users, { fields: [quotes.ownerId], references: [users.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.entityId] }),
  variant: one(entities, { fields: [quoteItems.variantId], references: [entities.id] }),
}));
