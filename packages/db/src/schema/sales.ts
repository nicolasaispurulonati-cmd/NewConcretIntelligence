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
 * `emitido` y `enviado` son dos hechos distintos y por eso son dos estados.
 * Emitir es el acto interno de cerrar el documento: desde ahí deja de ser
 * editable y los importes quedan comprometidos. Enviar es habérselo hecho
 * llegar al cliente, por un medio y en un momento concretos. Colapsarlos
 * obligaría a llamar "enviado" a un presupuesto con `sent_at` en nulo, que es
 * un campo prometiendo algo que no ocurrió. Ver D-016.
 *
 * El estado vive en `entities.status`, que es una columna compartida por los
 * treinta tipos de entidad: no hay restricción en la base que la limite a esta
 * lista. Quien la sostiene es `TRANSITIONS` en `@nci/sales`.
 */
export const QUOTE_STATUSES = [
  'borrador',
  'emitido',
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
    /**
     * Cuándo se emitió: el acto interno de cerrar el documento.
     *
     * Es lo que congela el presupuesto. Un presupuesto emitido y todavía no
     * enviado es un caso real y frecuente — se cierra para revisarlo, se manda
     * después—, y hasta que este campo existió no había forma de representarlo.
     */
    issuedAt: timestamp('issued_at', { withTimezone: true }),
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
    // No se puede haber enviado algo que nunca se emitió. Es la única parte
    // del orden entre los dos hechos que la base puede sostener sola.
    check('quotes_sent_requires_issued', sql`${table.sentAt} is null or ${table.issuedAt} is not null`),
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

/**
 * Los canales por los que un presupuesto le llega al cliente.
 *
 * A diferencia de los estados, éstos sí tienen restricción en la base: viven
 * en una tabla propia del dominio comercial y no en una columna compartida por
 * los treinta tipos de entidad, así que enumerarlos acá no obliga a enumerar
 * los de nadie más. Es el contraste exacto con DT-007.
 */
export const DELIVERY_CHANNELS = ['whatsapp', 'correo', 'mano'] as const;

/**
 * Cada vez que el presupuesto salió hacia el cliente.
 *
 * Es una tabla de hechos sucesivos y no un campo que se sobrescribe. Reenviar
 * es normal —el cliente lo perdió, se manda también por correo, se reenvía
 * después de una llamada— y cuándo y por dónde salió cada vez es información
 * comercial: un presupuesto que hubo que mandar tres veces dice algo sobre esa
 * negociación que un único `sent_at` pisado no dice.
 *
 * `quotes.sent_at` y `quotes.sent_via` siguen existiendo y son **el primer
 * envío**, que es el que define desde cuándo se espera respuesta. No se pisan
 * al reenviar.
 *
 * Lo que esto registra es que el documento se generó y se le entregó al
 * vendedor para que lo mande. El transporte es manual a propósito, así que no
 * hay acuse de recibo y el sistema no afirma que el cliente lo haya abierto.
 */
export const quoteDeliveries = pgTable(
  'quote_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.entityId, { onDelete: 'cascade' }),

    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    via: text('via').notNull(),

    /** Quién lo mandó. Se conserva el envío aunque la persona ya no esté. */
    sentBy: uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('quote_deliveries_quote_idx').on(table.quoteId, table.sentAt),
    check('quote_deliveries_via_valid', sql`${table.via} in ('whatsapp','correo','mano')`),
  ],
);

export const quoteDeliveriesRelations = relations(quoteDeliveries, ({ one }) => ({
  quote: one(quotes, { fields: [quoteDeliveries.quoteId], references: [quotes.entityId] }),
  sender: one(users, { fields: [quoteDeliveries.sentBy], references: [users.id] }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  entity: one(entities, { fields: [quotes.entityId], references: [entities.id] }),
  owner: one(users, { fields: [quotes.ownerId], references: [users.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.entityId] }),
  variant: one(entities, { fields: [quoteItems.variantId], references: [entities.id] }),
}));
