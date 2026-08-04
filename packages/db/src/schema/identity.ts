/**
 * Dominio Identity — quién puede ingresar y qué puede hacer.
 *
 * Todos los demás dominios dependen de estas tablas. La autoridad efectiva de
 * un usuario nunca se guarda calculada: se resuelve al evaluar, combinando sus
 * roles, sus concesiones individuales y sus revocaciones. Guardar el resultado
 * dejaría permisos huérfanos cuando cambie un rol.
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    jobTitle: text('job_title'),
    /** 'active' | 'suspended' | 'invited'. Nunca se borra un usuario: se suspende. */
    status: text('status').notNull().default('invited'),
    /** Hash de la contraseña. Nulo mientras la invitación esté pendiente. */
    passwordHash: text('password_hash'),
    locale: text('locale').notNull().default('es-AR'),
    timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    index('users_status_idx').on(table.status),
  ],
);

export const roles = pgTable(
  'roles',
  {
    /** Coincide con RoleId de @nci/domain para los roles del sistema. */
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    objective: text('objective').notNull(),
    /**
     * Los roles del sistema no se editan desde la interfaz: se versionan con el
     * código. Los roles creados por el administrador sí (distribuidores,
     * franquicias, auditores) — que es lo que permite sumar perfiles futuros
     * sin modificar el sistema.
     */
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const roleCapabilities = pgTable(
  'role_capabilities',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    /** CapabilityId de @nci/domain: `dominio.recurso.acción`. */
    capabilityId: text('capability_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.capabilityId] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    grantedBy: uuid('granted_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

/**
 * Ajustes individuales sobre lo que dan los roles.
 *
 * "No importa el cargo. Importa qué puede hacer." Una persona puede tener el
 * rol Comercial y además aprobar compras, o tener el rol Compras y no poder
 * aprobar nada. La revocación pesa más que cualquier concesión.
 */
export const userCapabilities = pgTable(
  'user_capabilities',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    capabilityId: text('capability_id').notNull(),
    /** 'grant' suma sobre los roles; 'revoke' resta y siempre gana. */
    effect: text('effect').notNull(),
    /** Por qué. Queda visible en la administración y en la auditoría. */
    reason: text('reason'),
    grantedBy: uuid('granted_by').references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    /** Permisos temporales: un auditor externo, una suplencia. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.capabilityId] }),
    index('user_capabilities_expires_idx').on(table.expiresAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

/**
 * Auditoría. Nunca se elimina y nunca se modifica.
 *
 * "Toda acción importante queda registrada. Quién. Qué. Cuándo. Desde dónde."
 * Se separa de `activity` a propósito: activity es lo que el usuario ve en la
 * línea de tiempo; audit_log es lo que la empresa debe poder demostrar.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nulo cuando actuó el sistema o una automatización. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** Se conserva el nombre aunque el usuario se elimine después. */
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    /** Entidad afectada, cuando la acción recae sobre una. */
    entityId: uuid('entity_id'),
    entityType: text('entity_type'),
    /** Capacidad que autorizó la acción. Permite auditar el permiso, no sólo el hecho. */
    capabilityUsed: text('capability_used'),
    /** 'granted' | 'denied'. Los intentos denegados también se registran. */
    outcome: text('outcome').notNull().default('granted'),
    before: jsonb('before'),
    after: jsonb('after'),
    ipAddress: text('ip_address'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_actor_idx').on(table.actorId, table.occurredAt),
    index('audit_log_entity_idx').on(table.entityId, table.occurredAt),
    index('audit_log_outcome_idx').on(table.outcome, table.occurredAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
  capabilities: many(userCapabilities),
  sessions: many(sessions),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  capabilities: many(roleCapabilities),
  users: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const roleCapabilitiesRelations = relations(roleCapabilities, ({ one }) => ({
  role: one(roles, { fields: [roleCapabilities.roleId], references: [roles.id] }),
}));

export const userCapabilitiesRelations = relations(userCapabilities, ({ one }) => ({
  user: one(users, { fields: [userCapabilities.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
