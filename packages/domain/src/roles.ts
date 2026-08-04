/**
 * Roles del sistema.
 *
 * Un rol es un atajo, no una jaula: agrupa capacidades que suelen ir juntas.
 * La autoridad real vive en las capacidades. Un usuario puede tener un rol y,
 * además, capacidades concedidas o revocadas individualmente — por eso
 * incorporar distribuidores, franquicias o auditores no exige tocar el sistema.
 *
 * Ver: 5. User Roles & Permissions.
 */

import type { CapabilityId } from './capabilities.js';
import { CAPABILITY_RESOURCES, capabilityId } from './capabilities.js';
import type { DomainId } from './domains.js';

export const ROLE_IDS = [
  'direccion',
  'comercial',
  'marketing',
  'compras',
  'stock',
  'tecnico',
  'administracion',
  'academia',
  'system_admin',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export interface RoleDefinition {
  readonly id: RoleId;
  readonly name: string;
  /** Qué persigue este rol. Una frase. */
  readonly objective: string;
  readonly capabilities: readonly CapabilityId[];
  /**
   * Lo que este rol explícitamente no toca. No es documentación decorativa:
   * el seed valida que estas capacidades no aparezcan en la lista de arriba,
   * de modo que un descuido futuro rompa el build y no la seguridad.
   */
  readonly neverModifies: readonly string[];
  /** Qué widgets propone su Workspace la primera vez que inicia sesión. */
  readonly defaultWorkspace: readonly string[];
}

/** Lectura sobre todos los recursos de un dominio. */
function readAll(...domains: DomainId[]): CapabilityId[] {
  return CAPABILITY_RESOURCES.filter((r) => domains.includes(r.domain)).map((r) =>
    capabilityId(r.id, 'read'),
  );
}

/** Todas las acciones disponibles sobre un recurso, hasta el nivel indicado. */
function upTo(resourceId: string, action: 'read' | 'create' | 'update' | 'approve' | 'admin'): CapabilityId[] {
  const levels = { read: 1, create: 2, update: 3, approve: 4, admin: 5 } as const;
  const resource = CAPABILITY_RESOURCES.find((r) => r.id === resourceId);
  if (!resource) throw new Error(`Recurso desconocido en la definición de roles: ${resourceId}`);
  return resource.actions
    .filter((a) => levels[a] <= levels[action])
    .map((a) => capabilityId(resourceId, a));
}

const unique = (ids: CapabilityId[]): CapabilityId[] => [...new Set(ids)];

export const ROLES: { readonly [K in RoleId]: RoleDefinition } = {
  direccion: {
    id: 'direccion',
    name: 'Dirección',
    objective: 'Tomar decisiones estratégicas. No opera: analiza.',
    capabilities: unique([
      // Ve toda la empresa. La escritura no viene con el rol: se concede aparte
      // si hace falta, porque Dirección analiza y no opera.
      ...readAll(
        'crm',
        'sales',
        'inventory',
        'procurement',
        'products',
        'knowledge',
        'support',
        'academy',
        'marketing',
        'executive',
      ),
      'executive.financials.read',
      'executive.analytics.read',
      'identity.audit.read',
      'ai.assistant.read',
      ...upTo('sales.quote', 'approve'),
      ...upTo('procurement.purchase_order', 'approve'),
    ]),
    neverModifies: [],
    defaultWorkspace: [
      'executive.summary',
      'sales.pipeline',
      'executive.profitability',
      'inventory.critical',
      'procurement.pending',
      'ai.executive_briefing',
      'notifications.important',
    ],
  },

  comercial: {
    id: 'comercial',
    name: 'Comercial',
    objective: 'Generar negocios.',
    capabilities: unique([
      ...upTo('crm.customer', 'update'),
      ...upTo('crm.contact', 'update'),
      ...upTo('crm.opportunity', 'update'),
      ...upTo('crm.project', 'update'),
      ...upTo('sales.quote', 'create'),
      'sales.quote.update',
      'sales.sale.read',
      ...readAll('products', 'knowledge'),
      'support.ticket.read',
      'support.ticket.create',
      ...upTo('ai.conversation', 'create'),
      'inventory.stock.read',
      'ai.assistant.read',
    ]),
    // "Nunca modifica: Stock. Compras. Configuración."
    neverModifies: ['inventory.stock', 'inventory.movement', 'procurement.purchase_order', 'identity.role'],
    defaultWorkspace: [
      'sales.my_quotes',
      'crm.follow_ups',
      'ai.suggested_opportunities',
      'crm.recent_conversations',
      'products.availability',
      'activity.mine',
    ],
  },

  marketing: {
    id: 'marketing',
    name: 'Marketing',
    objective: 'Generar demanda. No vende.',
    capabilities: unique([
      ...upTo('marketing.campaign', 'update'),
      ...upTo('marketing.content_asset', 'update'),
      ...readAll('products'),
      ...upTo('knowledge.faq', 'update'),
      ...upTo('knowledge.video', 'update'),
      'knowledge.technical_case.read',
      'knowledge.document.read',
      'academy.course.read',
      'crm.customer.read',
      'ai.assistant.read',
      ...upTo('ai.conversation', 'read'),
    ]),
    // El caso del documento: si pregunta por el margen bruto, la IA responde
    // que no posee permisos para consultar información financiera.
    neverModifies: ['inventory.stock', 'procurement.purchase_order', 'sales.sale'],
    defaultWorkspace: [
      'marketing.active_campaigns',
      'marketing.pending_content',
      'products.featured',
      'marketing.calendar',
      'ai.content_gaps',
      'knowledge.most_asked',
    ],
  },

  compras: {
    id: 'compras',
    name: 'Compras',
    objective: 'Garantizar disponibilidad.',
    capabilities: unique([
      ...upTo('procurement.supplier', 'update'),
      ...upTo('procurement.purchase_order', 'create'),
      'procurement.purchase_order.update',
      ...upTo('procurement.goods_receipt', 'update'),
      ...readAll('inventory'),
      'inventory.movement.create',
      ...readAll('products'),
      'executive.analytics.read',
      'ai.assistant.read',
      ...upTo('ai.conversation', 'create'),
    ]),
    // "Nunca modifica. Campañas. Academy. Procedimientos técnicos."
    neverModifies: ['marketing.campaign', 'academy.course', 'knowledge.procedure'],
    defaultWorkspace: [
      'inventory.critical',
      'procurement.pending_orders',
      'procurement.incoming_receipts',
      'ai.purchase_suggestions',
      'procurement.supplier_performance',
      'notifications.important',
    ],
  },

  stock: {
    id: 'stock',
    name: 'Stock',
    objective: 'Garantizar la trazabilidad.',
    capabilities: unique([
      ...upTo('inventory.stock', 'update'),
      ...upTo('inventory.movement', 'create'),
      ...upTo('inventory.warehouse', 'update'),
      ...readAll('products'),
      'procurement.goods_receipt.read',
      'procurement.goods_receipt.create',
      'procurement.purchase_order.read',
      'ai.assistant.read',
    ]),
    neverModifies: ['marketing.campaign', 'sales.quote', 'knowledge.procedure'],
    defaultWorkspace: [
      'inventory.critical',
      'inventory.pending_movements',
      'inventory.discrepancies',
      'ai.stock_anomalies',
      'procurement.incoming_receipts',
      'activity.mine',
    ],
  },

  tecnico: {
    id: 'tecnico',
    name: 'Técnico',
    objective: 'Resolver y convertir cada caso en conocimiento de la empresa.',
    capabilities: unique([
      ...upTo('support.ticket', 'update'),
      ...upTo('support.diagnosis', 'update'),
      ...upTo('support.warranty', 'update'),
      ...upTo('knowledge.technical_case', 'update'),
      ...upTo('knowledge.procedure', 'create'),
      'knowledge.procedure.update',
      ...upTo('knowledge.document', 'create'),
      ...upTo('knowledge.faq', 'create'),
      ...readAll('products'),
      'knowledge.video.read',
      'crm.customer.read',
      'crm.contact.read',
      'crm.project.read',
      'inventory.stock.read',
      'academy.course.read',
      'academy.certification.read',
      'ai.assistant.read',
      ...upTo('ai.conversation', 'create'),
    ]),
    neverModifies: ['procurement.purchase_order', 'marketing.campaign', 'sales.sale'],
    defaultWorkspace: [
      'support.my_tickets',
      'support.unanswered',
      'knowledge.recent_cases',
      'ai.similar_cases',
      'products.technical_sheets',
      'activity.mine',
    ],
  },

  administracion: {
    id: 'administracion',
    name: 'Administración',
    objective: 'Sostener la información administrativa: facturación, cobros y pagos.',
    capabilities: unique([
      ...upTo('crm.customer', 'update'),
      'crm.contact.read',
      ...upTo('procurement.supplier', 'update'),
      ...upTo('sales.sale', 'update'),
      'sales.quote.read',
      'procurement.purchase_order.read',
      'procurement.goods_receipt.read',
      'executive.financials.read',
      'ai.assistant.read',
    ]),
    // "No necesita acceder al conocimiento técnico completo."
    neverModifies: ['knowledge.procedure', 'knowledge.technical_case', 'marketing.campaign'],
    defaultWorkspace: [
      'sales.to_invoice',
      'procurement.to_pay',
      'crm.account_status',
      'activity.mine',
      'notifications.important',
    ],
  },

  academia: {
    id: 'academia',
    name: 'Academia',
    objective: 'Formar y certificar.',
    capabilities: unique([
      ...upTo('academy.course', 'approve'),
      ...upTo('academy.certification', 'approve'),
      ...readAll('knowledge', 'products'),
      'knowledge.video.create',
      'knowledge.video.update',
      'crm.customer.read',
      'crm.contact.read',
      'ai.assistant.read',
    ]),
    neverModifies: ['inventory.stock', 'procurement.purchase_order', 'sales.sale'],
    defaultWorkspace: [
      'academy.active_courses',
      'academy.pending_evaluations',
      'academy.certifications_expiring',
      'knowledge.material_gaps',
      'activity.mine',
    ],
  },

  system_admin: {
    id: 'system_admin',
    name: 'Administrador del sistema',
    objective:
      'Mantener la plataforma. No representa un área: representa al equipo que la sostiene.',
    capabilities: unique([
      ...upTo('identity.user', 'admin'),
      ...upTo('identity.role', 'admin'),
      'identity.audit.read',
      ...upTo('identity.integration', 'admin'),
      ...upTo('ai.automation', 'approve'),
    ]),
    // Administrar la plataforma no es leer sus datos de negocio. Un
    // administrador que necesite ver clientes o rentabilidad recibe esa
    // capacidad de forma explícita y queda registrada en la auditoría.
    neverModifies: ['sales.sale', 'procurement.purchase_order', 'inventory.stock'],
    defaultWorkspace: [
      'identity.recent_activity',
      'identity.pending_users',
      'system.integration_health',
      'system.metrics',
      'identity.audit_feed',
    ],
  },
};

export const ALL_ROLES: readonly RoleDefinition[] = ROLE_IDS.map((id) => ROLES[id]);

export function isRoleId(value: string): value is RoleId {
  return (ROLE_IDS as readonly string[]).includes(value);
}
