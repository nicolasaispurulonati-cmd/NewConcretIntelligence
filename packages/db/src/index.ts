export * from './client.js';
export { loadEnv, requireDatabaseUrl } from './env.js';
export * as schema from './schema/index.js';
export {
  users,
  roles,
  roleCapabilities,
  userRoles,
  userCapabilities,
  sessions,
  auditLog,
} from './schema/identity.js';
export {
  entities,
  entityRelations,
  activity,
  EMBEDDING_DIMENSIONS,
} from './schema/graph.js';
export {
  workspaceWidgets,
  userTrail,
  notifications,
  systemMetrics,
} from './schema/workspace.js';
export { customers, contacts, opportunities } from './schema/crm.js';
export { quotes, quoteItems, quoteDeliveries, QUOTE_STATUSES, DELIVERY_CHANNELS } from './schema/sales.js';
