/**
 * El Workspace y lo que lo rodea.
 *
 * "No quiero un Dashboard. Quiero un Workspace. Dashboard muestra información;
 *  Workspace te ayuda a trabajar."
 *
 * Estas tablas guardan lo que hace que el escritorio de cada persona sea suyo:
 * qué widgets eligió, qué dejó a medias, qué le hace falta saber.
 */

import { relations } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity.js';
import { entities } from './graph.js';

/** Qué widgets tiene cada persona en su escritorio y en qué orden. */
export const workspaceWidgets = pgTable(
  'workspace_widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Identificador del widget: 'inventory.critical', 'ai.purchase_suggestions'. */
    widgetId: text('widget_id').notNull(),
    position: integer('position').notNull().default(0),
    /** Configuración propia del widget: filtros, rango de fechas. */
    settings: jsonb('settings').notNull().default({}),
    /** Se oculta sin perder la configuración: quitar no es destruir. */
    visible: boolean('visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_widgets_unique').on(table.userId, table.widgetId),
    index('workspace_widgets_user_idx').on(table.userId, table.position),
  ],
);

/**
 * Continuidad del trabajo.
 *
 * Principio 16 del PDL: al iniciar sesión la plataforma recuerda qué estaba
 * haciendo, qué dejó pendiente y qué cambió desde la última vez.
 */
export const userTrail = pgTable(
  'user_trail',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    /** 'viewed' | 'edited' | 'left_unfinished'. */
    interaction: text('interaction').notNull().default('viewed'),
    /** Dónde quedó: pestaña abierta, sección, borrador sin guardar. */
    context: jsonb('context').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('user_trail_user_idx').on(table.userId, table.occurredAt),
    index('user_trail_entity_idx').on(table.entityId),
  ],
);

/**
 * Notificaciones.
 *
 * "No quiero notificaciones molestas. Solo importantes." Por eso una
 * notificación siempre trae la razón por la que existe y una acción concreta:
 * si no se puede hacer nada al respecto, no debería notificarse.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'stock_critical' | 'warranty_expiring' | 'document_pending' | … */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    /** Por qué esto le importa a esta persona, en una frase. */
    reason: text('reason').notNull(),
    /** Qué puede hacer al respecto. Sin acción posible no hay notificación. */
    actionLabel: text('action_label'),
    actionHref: text('action_href'),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'cascade' }),
    /** 'informative' | 'attention' | 'urgent'. Nunca sólo un color. */
    severity: text('severity').notNull().default('informative'),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId, table.createdAt),
    index('notifications_unread_idx').on(table.userId, table.readAt),
  ],
);

/**
 * Indicadores del propio sistema.
 *
 * Principio 14: todo debe ser medible — no sólo el negocio, también la
 * plataforma. Tiempo de respuesta, consultas resueltas por IA, automatizaciones
 * ejecutadas, ahorro estimado de tiempo, documentos más consultados.
 */
export const systemMetrics = pgTable(
  'system_metrics',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    metric: text('metric').notNull(),
    value: text('value').notNull(),
    dimensions: jsonb('dimensions').notNull().default({}),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('system_metrics_idx').on(table.metric, table.recordedAt)],
);

export const workspaceWidgetsRelations = relations(workspaceWidgets, ({ one }) => ({
  user: one(users, { fields: [workspaceWidgets.userId], references: [users.id] }),
}));

export const userTrailRelations = relations(userTrail, ({ one }) => ({
  user: one(users, { fields: [userTrail.userId], references: [users.id] }),
  entity: one(entities, { fields: [userTrail.entityId], references: [entities.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  entity: one(entities, { fields: [notifications.entityId], references: [entities.id] }),
}));
