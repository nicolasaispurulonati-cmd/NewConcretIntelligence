/**
 * Permisos por capacidad.
 *
 * "No importa el cargo. Importa qué puede hacer."
 *
 * Los permisos no se asignan por pantalla sino por responsabilidad. Una
 * capacidad se lee como una frase del negocio — "puede aprobar compras" — y no
 * como una ruta de la aplicación. Esto es lo que permite incorporar perfiles
 * futuros (distribuidores, franquicias, auditores) sin modificar el sistema.
 *
 * Ver: 5. User Roles & Permissions.
 */

import type { DomainId } from './domains.js';
import type { DataClassification, EntityTypeId } from './entity-types.js';

/** Los cinco niveles de acceso. El número es su orden, no su identidad. */
export const ACCESS_LEVELS = {
  read: 1,
  create: 2,
  update: 3,
  approve: 4,
  admin: 5,
} as const;

export type CapabilityAction = keyof typeof ACCESS_LEVELS;
export type AccessLevel = (typeof ACCESS_LEVELS)[CapabilityAction];

export const CAPABILITY_ACTIONS = Object.keys(ACCESS_LEVELS) as readonly CapabilityAction[];

/**
 * Un recurso sobre el que se conceden capacidades. Casi siempre es una entidad,
 * pero no siempre: la información financiera y la auditoría son recursos que
 * atraviesan varias entidades.
 */
export interface CapabilityResource {
  readonly id: string;
  readonly domain: DomainId;
  /** La entidad que representa, cuando representa una. */
  readonly entityType?: EntityTypeId;
  /** Cómo se nombra el recurso dentro de una frase: "puede consultar {noun}". */
  readonly noun: string;
  readonly actions: readonly CapabilityAction[];
  /**
   * Verbos propios del negocio para acciones concretas.
   * En Knowledge, aprobar se dice publicar. En Academy, certificar.
   * El PDL exige que el sistema hable como habla la empresa.
   */
  readonly verbs?: Partial<Record<CapabilityAction, string>>;
}

const CRUD: readonly CapabilityAction[] = ['read', 'create', 'update', 'admin'];
const CRUD_APPROVE: readonly CapabilityAction[] = ['read', 'create', 'update', 'approve', 'admin'];
const READ_ONLY: readonly CapabilityAction[] = ['read'];

export const CAPABILITY_RESOURCES: readonly CapabilityResource[] = [
  // ── Identity ───────────────────────────────────────────────────────────
  { id: 'identity.user', domain: 'identity', entityType: 'user', noun: 'usuarios', actions: CRUD },
  { id: 'identity.role', domain: 'identity', noun: 'roles y permisos', actions: CRUD },
  {
    id: 'identity.audit',
    domain: 'identity',
    noun: 'la auditoría del sistema',
    actions: READ_ONLY,
  },

  // ── CRM ────────────────────────────────────────────────────────────────
  { id: 'crm.customer', domain: 'crm', entityType: 'customer', noun: 'clientes', actions: CRUD },
  { id: 'crm.contact', domain: 'crm', entityType: 'contact', noun: 'contactos', actions: CRUD },
  {
    id: 'crm.opportunity',
    domain: 'crm',
    entityType: 'opportunity',
    noun: 'oportunidades',
    actions: CRUD,
  },
  { id: 'crm.project', domain: 'crm', entityType: 'project', noun: 'obras', actions: CRUD },

  // ── Sales ──────────────────────────────────────────────────────────────
  {
    id: 'sales.quote',
    domain: 'sales',
    entityType: 'quote',
    noun: 'presupuestos',
    actions: CRUD_APPROVE,
  },
  {
    id: 'sales.sale',
    domain: 'sales',
    entityType: 'sale',
    noun: 'ventas',
    actions: CRUD_APPROVE,
  },

  // ── Products ───────────────────────────────────────────────────────────
  {
    id: 'products.product',
    domain: 'products',
    entityType: 'product',
    noun: 'productos',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },
  {
    id: 'products.category',
    domain: 'products',
    entityType: 'category',
    noun: 'categorías',
    actions: CRUD,
  },
  {
    id: 'products.variant',
    domain: 'products',
    entityType: 'variant',
    noun: 'variantes',
    actions: CRUD,
  },

  // ── Inventory ──────────────────────────────────────────────────────────
  { id: 'inventory.stock', domain: 'inventory', entityType: 'stock', noun: 'stock', actions: CRUD },
  {
    id: 'inventory.movement',
    domain: 'inventory',
    entityType: 'movement',
    noun: 'movimientos de stock',
    // Un movimiento nunca se modifica ni se elimina. Se corrige con otro
    // movimiento. Por eso este recurso no admite `update`.
    actions: ['read', 'create', 'approve', 'admin'],
    verbs: { approve: 'aprobar ajustes de' },
  },
  {
    id: 'inventory.warehouse',
    domain: 'inventory',
    entityType: 'warehouse',
    noun: 'depósitos',
    actions: CRUD,
  },

  // ── Procurement ────────────────────────────────────────────────────────
  {
    id: 'procurement.supplier',
    domain: 'procurement',
    entityType: 'supplier',
    noun: 'proveedores',
    actions: CRUD,
  },
  {
    id: 'procurement.purchase_order',
    domain: 'procurement',
    entityType: 'purchase_order',
    noun: 'compras',
    actions: CRUD_APPROVE,
  },
  {
    id: 'procurement.goods_receipt',
    domain: 'procurement',
    entityType: 'goods_receipt',
    noun: 'recepciones',
    actions: CRUD,
  },

  // ── Knowledge ──────────────────────────────────────────────────────────
  {
    id: 'knowledge.document',
    domain: 'knowledge',
    entityType: 'document',
    noun: 'documentos',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },
  {
    id: 'knowledge.procedure',
    domain: 'knowledge',
    entityType: 'procedure',
    noun: 'procedimientos',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },
  {
    id: 'knowledge.technical_case',
    domain: 'knowledge',
    entityType: 'technical_case',
    noun: 'casos técnicos',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },
  {
    id: 'knowledge.video',
    domain: 'knowledge',
    entityType: 'video',
    noun: 'videos',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },
  {
    id: 'knowledge.faq',
    domain: 'knowledge',
    entityType: 'faq',
    noun: 'preguntas frecuentes',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },

  // ── Support ────────────────────────────────────────────────────────────
  { id: 'support.ticket', domain: 'support', entityType: 'ticket', noun: 'tickets', actions: CRUD },
  {
    id: 'support.diagnosis',
    domain: 'support',
    entityType: 'diagnosis',
    noun: 'diagnósticos',
    actions: CRUD_APPROVE,
  },
  {
    id: 'support.warranty',
    domain: 'support',
    entityType: 'warranty',
    noun: 'garantías',
    actions: CRUD_APPROVE,
  },

  // ── Academy ────────────────────────────────────────────────────────────
  {
    id: 'academy.course',
    domain: 'academy',
    entityType: 'course',
    noun: 'cursos',
    actions: CRUD_APPROVE,
    verbs: { approve: 'certificar' },
  },
  {
    id: 'academy.certification',
    domain: 'academy',
    entityType: 'certification',
    noun: 'certificaciones',
    actions: CRUD_APPROVE,
    verbs: { approve: 'emitir' },
  },

  // ── Marketing ──────────────────────────────────────────────────────────
  {
    id: 'marketing.campaign',
    domain: 'marketing',
    entityType: 'campaign',
    noun: 'campañas',
    actions: CRUD_APPROVE,
  },
  {
    id: 'marketing.content_asset',
    domain: 'marketing',
    entityType: 'content_asset',
    noun: 'contenido',
    actions: CRUD_APPROVE,
    verbs: { approve: 'publicar' },
  },

  // ── Executive ──────────────────────────────────────────────────────────
  {
    id: 'executive.financials',
    domain: 'executive',
    noun: 'información financiera',
    // Costos, márgenes y rentabilidad. Es la capacidad que separa a Dirección
    // del resto: sin ella la IA responde que no hay permisos, aunque el
    // usuario pueda ver la entidad.
    actions: READ_ONLY,
  },
  {
    id: 'executive.analytics',
    domain: 'executive',
    noun: 'indicadores de la empresa',
    actions: READ_ONLY,
  },

  // ── IA e integraciones ─────────────────────────────────────────────────
  {
    id: 'ai.assistant',
    domain: 'ai',
    noun: 'la asistencia de IA',
    actions: READ_ONLY,
  },
  {
    id: 'ai.conversation',
    domain: 'ai',
    entityType: 'conversation',
    noun: 'conversaciones',
    actions: CRUD,
  },
  {
    id: 'ai.automation',
    domain: 'ai',
    noun: 'automatizaciones',
    actions: CRUD_APPROVE,
  },
  {
    id: 'identity.integration',
    domain: 'identity',
    noun: 'integraciones',
    actions: CRUD,
  },
];

/** `dominio.recurso.acción` — por ejemplo `sales.quote.approve`. */
export type CapabilityId = string;

export interface Capability {
  readonly id: CapabilityId;
  readonly resourceId: string;
  readonly domain: DomainId;
  readonly action: CapabilityAction;
  readonly level: AccessLevel;
  /** "Puede aprobar compras." Se muestra tal cual en la administración. */
  readonly statement: string;
}

const ACTION_VERBS: Record<CapabilityAction, string> = {
  read: 'consultar',
  create: 'crear',
  update: 'modificar',
  approve: 'aprobar',
  admin: 'administrar',
};

function buildCatalog(): Map<CapabilityId, Capability> {
  const catalog = new Map<CapabilityId, Capability>();
  for (const resource of CAPABILITY_RESOURCES) {
    for (const action of resource.actions) {
      const verb = resource.verbs?.[action] ?? ACTION_VERBS[action];
      const id = `${resource.id}.${action}`;
      catalog.set(id, {
        id,
        resourceId: resource.id,
        domain: resource.domain,
        action,
        level: ACCESS_LEVELS[action],
        statement: `Puede ${verb} ${resource.noun}`,
      });
    }
  }
  return catalog;
}

export const CAPABILITY_CATALOG: ReadonlyMap<CapabilityId, Capability> = buildCatalog();

export const ALL_CAPABILITIES: readonly Capability[] = [...CAPABILITY_CATALOG.values()];

export function capabilityId(resourceId: string, action: CapabilityAction): CapabilityId {
  return `${resourceId}.${action}`;
}

export function isKnownCapability(id: string): boolean {
  return CAPABILITY_CATALOG.has(id);
}

export function resourceById(resourceId: string): CapabilityResource | undefined {
  return CAPABILITY_RESOURCES.find((r) => r.id === resourceId);
}

/** El recurso que gobierna una entidad, cuando existe uno. */
export function resourceForEntityType(entityType: EntityTypeId): CapabilityResource | undefined {
  return CAPABILITY_RESOURCES.find((r) => r.entityType === entityType);
}

/**
 * Un nivel concedido implica los inferiores sobre el mismo recurso: quien puede
 * administrar stock puede consultarlo. La concesión es explícita; la
 * implicación se resuelve al evaluar, nunca al guardar — así una revocación
 * futura no deja permisos huérfanos en la base.
 */
export function impliedCapabilities(granted: CapabilityId): readonly CapabilityId[] {
  const capability = CAPABILITY_CATALOG.get(granted);
  if (!capability) return [];
  const resource = resourceById(capability.resourceId);
  if (!resource) return [];
  return resource.actions
    .filter((action) => ACCESS_LEVELS[action] <= capability.level)
    .map((action) => capabilityId(resource.id, action));
}

/**
 * Capacidad adicional que exige leer un dato según su clasificación, por encima
 * del permiso de lectura del recurso. Es la regla que hace que un usuario de
 * Marketing con acceso a productos siga sin poder ver rentabilidad.
 */
export const CLASSIFICATION_GATE: Readonly<Record<DataClassification, CapabilityId | null>> = {
  public: null,
  internal: null,
  financial: 'executive.financials.read',
  restricted: null, // La restricción vive en el permiso del propio recurso.
};

export function gateForClassification(
  classification: DataClassification,
): CapabilityId | null {
  return CLASSIFICATION_GATE[classification];
}
