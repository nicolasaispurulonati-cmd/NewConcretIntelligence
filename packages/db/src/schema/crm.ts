/**
 * Dominio CRM — la relación comercial.
 *
 * Estas tablas guardan lo propio de cada entidad comercial. Su identidad, su
 * nombre, su estado y sus relaciones viven en el grafo, como cualquier otra
 * entidad: acá va sólo lo que el CRM necesita y ningún otro dominio conoce.
 *
 * Las relaciones entre cliente, contactos, obras y presupuestos NO se duplican
 * con claves foráneas. Existen una sola vez, en `entity_relations`. Guardarlas
 * dos veces sería tener dos verdades y, tarde o temprano, dos verdades
 * distintas.
 *
 * Ver: 4. Domain Model — Cliente, Contacto, Oportunidad.
 */

import { relations } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { entities } from './graph.js';

/**
 * Cliente: empresa o persona que compra productos o servicios.
 *
 * La condición de pago es opcional a propósito. Un cliente puede existir en el
 * sistema antes de tenerla definida — y es exactamente lo que impide emitirle
 * un presupuesto hasta que alguien la complete.
 */
export const customers = pgTable(
  'customers',
  {
    entityId: uuid('entity_id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),

    /** CUIT o documento. Único cuando está cargado. */
    taxId: text('tax_id'),
    /** 'constructora' | 'industria' | 'distribuidor' | 'particular' */
    segment: text('segment'),

    // ── Condiciones comerciales ────────────────────────────────────────
    /**
     * Días de plazo de pago. Nulo significa "sin condición asignada", y es la
     * causa exacta del error que el PDL usa como ejemplo:
     * "No fue posible generar el presupuesto porque el cliente no tiene una
     *  condición de pago asignada."
     */
    paymentTermsDays: integer('payment_terms_days'),
    /** Lista de precios que le corresponde. Nula usa la general. */
    priceList: text('price_list'),
    /** Tope de crédito en centavos. Nulo es sin tope definido. */
    creditLimit: bigint('credit_limit', { mode: 'number' }),
    currency: text('currency').notNull().default('ARS'),

    // ── Contacto ───────────────────────────────────────────────────────
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    province: text('province'),
  },
  (table) => [
    index('customers_tax_id_idx').on(table.taxId),
    index('customers_segment_idx').on(table.segment),
    check(
      'customers_payment_terms_valid',
      sql`${table.paymentTermsDays} is null or ${table.paymentTermsDays} between 0 and 365`,
    ),
  ],
);

/** Contacto: la persona concreta dentro de un cliente o un proveedor. */
export const contacts = pgTable(
  'contacts',
  {
    entityId: uuid('entity_id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),

    /** "Jefe de mantenimiento", "Compras", "Dirección". */
    role: text('role'),
    email: text('email'),
    phone: text('phone'),
    /**
     * Se guarda aparte del teléfono: no siempre coinciden, y el canal de
     * WhatsApp alimenta el dominio de Conversaciones.
     */
    whatsapp: text('whatsapp'),
    notes: text('notes'),
  },
  (table) => [index('contacts_email_idx').on(table.email)],
);

/**
 * Oportunidad: una posibilidad comercial concreta, en seguimiento.
 *
 * La etapa del pipeline vive en `entities.status`, como el estado de cualquier
 * entidad — así el Workspace y la búsqueda la muestran sin saber que existe el
 * dominio comercial.
 */
export const opportunities = pgTable(
  'opportunities',
  {
    entityId: uuid('entity_id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),

    /** Valor estimado en centavos. */
    estimatedValue: bigint('estimated_value', { mode: 'number' }),
    currency: text('currency').notNull().default('ARS'),
    /** Probabilidad de cierre, de 0 a 100. */
    probability: integer('probability'),
    expectedCloseDate: date('expected_close_date'),
    /** De dónde vino: 'referido', 'campaña', 'web', 'visita'. */
    source: text('source'),
    /**
     * Por qué se perdió. Es el campo más valioso del dominio: sin él, el
     * pipeline dice cuánto se perdió pero nunca por qué.
     */
    lostReason: text('lost_reason'),
  },
  (table) => [
    index('opportunities_close_date_idx').on(table.expectedCloseDate),
    check(
      'opportunities_probability_valid',
      sql`${table.probability} is null or ${table.probability} between 0 and 100`,
    ),
  ],
);

export const customersRelations = relations(customers, ({ one }) => ({
  entity: one(entities, { fields: [customers.entityId], references: [entities.id] }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  entity: one(entities, { fields: [contacts.entityId], references: [entities.id] }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  entity: one(entities, { fields: [opportunities.entityId], references: [entities.id] }),
}));
