/**
 * Las entidades de NewConcret Intelligence.
 *
 * Cada entidad tiene un único significado dentro de toda la plataforma. No
 * pueden existir dos conceptos distintos con el mismo nombre, ni un mismo
 * concepto con significados diferentes.
 *
 * Ver: 4. Domain Model.
 */

import type { DomainId } from './domains.js';

export const ENTITY_TYPE_IDS = [
  // Personas
  'user',
  'customer',
  'contact',
  'supplier',
  // Comercial
  'opportunity',
  'quote',
  'sale',
  'project',
  // Productos
  'product',
  'category',
  'variant',
  // Inventario
  'warehouse',
  'stock',
  'movement',
  // Compras
  'purchase_order',
  'goods_receipt',
  // Knowledge
  'document',
  'procedure',
  'technical_case',
  'video',
  'faq',
  // Soporte
  'ticket',
  'diagnosis',
  'warranty',
  // Academy
  'course',
  'certification',
  // Marketing
  'campaign',
  'content_asset',
  // IA
  'conversation',
  'recommendation',
] as const;

export type EntityTypeId = (typeof ENTITY_TYPE_IDS)[number];

/**
 * Clasificación del dato. Determina qué capacidad adicional hace falta para
 * leerlo, por encima del permiso de lectura del dominio.
 *
 * El caso de referencia está en el documento de roles: Marketing pregunta por
 * el margen bruto y el sistema responde que no posee permisos para consultar
 * información financiera. Esa respuesta nace de acá.
 */
export type DataClassification =
  /** Puede salir de la empresa: fichas técnicas, videos públicos. */
  | 'public'
  /** Interno de la empresa. El permiso del dominio alcanza. */
  | 'internal'
  /** Costos, márgenes, rentabilidad. Requiere `executive.financials.read`. */
  | 'financial'
  /** Datos de personas y auditoría. Requiere capacidad explícita. */
  | 'restricted';

/**
 * Cómo se presenta cualquier entidad. Principio 12 del PDL: una entidad tiene
 * una identidad — el usuario aprende la estructura una vez y después reconoce
 * cualquier entidad.
 */
export interface EntityIdentityShape {
  /** Campo que actúa como título. Siempre visible. */
  readonly titleField: string;
  /** Campo que da contexto inmediato bajo el título. */
  readonly subtitleField?: string;
  /**
   * Campo de estado. El PDL prohíbe comunicar estado sólo con color:
   * el estado siempre se acompaña de su etiqueta y de una explicación.
   */
  readonly statusField?: string;
}

export interface EntityTypeDefinition {
  readonly id: EntityTypeId;
  readonly domain: DomainId;
  readonly singular: string;
  readonly plural: string;
  /** Qué representa, en una frase, en el lenguaje del negocio. */
  readonly meaning: string;
  readonly classification: DataClassification;
  readonly identity: EntityIdentityShape;
  /** Aparece en la búsqueda universal. */
  readonly searchable: boolean;
  /**
   * Nunca se borra ni se modifica: sólo se agrega. Los movimientos de stock y
   * la auditoría son inmutables por diseño.
   */
  readonly immutable: boolean;
  /**
   * Genera embedding para búsqueda semántica y recuperación de la IA.
   * Se activa donde el valor está en el texto, no en los números.
   */
  readonly semantic: boolean;
}

export const ENTITY_TYPES: { readonly [K in EntityTypeId]: EntityTypeDefinition } = {
  user: {
    id: 'user',
    domain: 'identity',
    singular: 'Usuario',
    plural: 'Usuarios',
    meaning: 'Una persona que utiliza la plataforma. Nunca es un cliente.',
    classification: 'restricted',
    identity: { titleField: 'fullName', subtitleField: 'jobTitle', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  customer: {
    id: 'customer',
    domain: 'crm',
    singular: 'Cliente',
    plural: 'Clientes',
    meaning: 'Empresa o persona que compra productos o servicios.',
    classification: 'internal',
    identity: { titleField: 'legalName', subtitleField: 'segment', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  contact: {
    id: 'contact',
    domain: 'crm',
    singular: 'Contacto',
    plural: 'Contactos',
    meaning: 'Persona relacionada con un cliente.',
    classification: 'restricted',
    identity: { titleField: 'fullName', subtitleField: 'role', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  supplier: {
    id: 'supplier',
    domain: 'procurement',
    singular: 'Proveedor',
    plural: 'Proveedores',
    meaning: 'Empresa que abastece productos o servicios.',
    classification: 'internal',
    identity: { titleField: 'legalName', subtitleField: 'category', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  opportunity: {
    id: 'opportunity',
    domain: 'crm',
    singular: 'Oportunidad',
    plural: 'Oportunidades',
    meaning: 'Una posibilidad comercial concreta en seguimiento.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'customerName', statusField: 'stage' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  quote: {
    id: 'quote',
    domain: 'sales',
    singular: 'Presupuesto',
    plural: 'Presupuestos',
    meaning:
      'Una entidad, no un PDF. Tiene versión, estado, seguimiento y puede generar PDF, correo o WhatsApp.',
    classification: 'internal',
    identity: { titleField: 'number', subtitleField: 'customerName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  sale: {
    id: 'sale',
    domain: 'sales',
    singular: 'Venta',
    plural: 'Ventas',
    meaning: 'Una operación comercial concretada.',
    classification: 'financial',
    identity: { titleField: 'number', subtitleField: 'customerName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  project: {
    id: 'project',
    domain: 'crm',
    singular: 'Obra',
    plural: 'Obras',
    meaning: 'Un emplazamiento o proyecto del cliente donde se aplican los productos.',
    classification: 'internal',
    identity: { titleField: 'name', subtitleField: 'location', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  product: {
    id: 'product',
    domain: 'products',
    singular: 'Producto',
    plural: 'Productos',
    meaning:
      'El conocimiento completo sobre un producto. No representa un artículo de stock.',
    classification: 'internal',
    identity: { titleField: 'name', subtitleField: 'categoryName', statusField: 'lifecycle' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  category: {
    id: 'category',
    domain: 'products',
    singular: 'Categoría',
    plural: 'Categorías',
    meaning: 'Agrupación jerárquica de productos.',
    classification: 'public',
    identity: { titleField: 'name' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  variant: {
    id: 'variant',
    domain: 'products',
    singular: 'Variante',
    plural: 'Variantes',
    meaning: 'Una presentación concreta de un producto: medida, color, envase.',
    classification: 'internal',
    identity: { titleField: 'name', subtitleField: 'sku', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  warehouse: {
    id: 'warehouse',
    domain: 'inventory',
    singular: 'Depósito',
    plural: 'Depósitos',
    meaning: 'Un lugar físico donde existe stock.',
    classification: 'internal',
    identity: { titleField: 'name', subtitleField: 'location', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  stock: {
    id: 'stock',
    domain: 'inventory',
    singular: 'Stock',
    plural: 'Stock',
    meaning:
      'La disponibilidad física de una variante en un depósito. No conoce clientes ni ventas.',
    classification: 'internal',
    identity: { titleField: 'variantName', subtitleField: 'warehouseName', statusField: 'level' },
    searchable: false,
    immutable: false,
    semantic: false,
  },
  movement: {
    id: 'movement',
    domain: 'inventory',
    singular: 'Movimiento',
    plural: 'Movimientos',
    meaning: 'Cada modificación del stock: entrada, salida, transferencia, ajuste o inventario.',
    classification: 'internal',
    identity: { titleField: 'kind', subtitleField: 'variantName' },
    searchable: false,
    immutable: true,
    semantic: false,
  },
  purchase_order: {
    id: 'purchase_order',
    domain: 'procurement',
    singular: 'Orden de compra',
    plural: 'Órdenes de compra',
    meaning: 'Una compra a un proveedor, con su ciclo de vida.',
    classification: 'financial',
    identity: { titleField: 'number', subtitleField: 'supplierName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  goods_receipt: {
    id: 'goods_receipt',
    domain: 'procurement',
    singular: 'Recepción',
    plural: 'Recepciones',
    meaning: 'La llegada física de mercadería contra una orden de compra.',
    classification: 'internal',
    identity: { titleField: 'number', subtitleField: 'supplierName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  document: {
    id: 'document',
    domain: 'knowledge',
    singular: 'Documento',
    plural: 'Documentos',
    meaning:
      'Todo archivo relevante para la empresa. Siempre tiene propietario, versión, fecha, estado y etiquetas.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'kind', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  procedure: {
    id: 'procedure',
    domain: 'knowledge',
    singular: 'Procedimiento',
    plural: 'Procedimientos',
    meaning: 'La forma oficial de realizar una tarea.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'scope', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  technical_case: {
    id: 'technical_case',
    domain: 'knowledge',
    singular: 'Caso técnico',
    plural: 'Casos técnicos',
    meaning:
      'Una experiencia real: problema, diagnóstico, productos utilizados, resultado y conclusiones.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'productName', statusField: 'outcome' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  video: {
    id: 'video',
    domain: 'knowledge',
    singular: 'Video',
    plural: 'Videos',
    meaning: 'Material audiovisual con transcripción indexada.',
    classification: 'public',
    identity: { titleField: 'title', subtitleField: 'duration', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  faq: {
    id: 'faq',
    domain: 'knowledge',
    singular: 'Pregunta frecuente',
    plural: 'Preguntas frecuentes',
    meaning: 'Una pregunta real y su respuesta oficial.',
    classification: 'public',
    identity: { titleField: 'question', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  ticket: {
    id: 'ticket',
    domain: 'support',
    singular: 'Ticket',
    plural: 'Tickets',
    meaning: 'Una consulta técnica, garantía o incidente con toda su conversación asociada.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'customerName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  diagnosis: {
    id: 'diagnosis',
    domain: 'support',
    singular: 'Diagnóstico',
    plural: 'Diagnósticos',
    meaning: 'La conclusión técnica sobre un problema concreto.',
    classification: 'internal',
    identity: { titleField: 'summary', subtitleField: 'ticketNumber', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  warranty: {
    id: 'warranty',
    domain: 'support',
    singular: 'Garantía',
    plural: 'Garantías',
    meaning: 'La cobertura vigente sobre un producto entregado.',
    classification: 'internal',
    identity: { titleField: 'number', subtitleField: 'customerName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  course: {
    id: 'course',
    domain: 'academy',
    singular: 'Curso',
    plural: 'Cursos',
    meaning: 'Una formación estructurada con evaluación.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'level', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  certification: {
    id: 'certification',
    domain: 'academy',
    singular: 'Certificación',
    plural: 'Certificaciones',
    meaning: 'La acreditación de que una persona está capacitada para algo.',
    classification: 'internal',
    identity: { titleField: 'title', subtitleField: 'holderName', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: false,
  },
  campaign: {
    id: 'campaign',
    domain: 'marketing',
    singular: 'Campaña',
    plural: 'Campañas',
    meaning: 'Una acción de generación de demanda con objetivo y métricas.',
    classification: 'internal',
    identity: { titleField: 'name', subtitleField: 'channel', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  content_asset: {
    id: 'content_asset',
    domain: 'marketing',
    singular: 'Activo de contenido',
    plural: 'Activos de contenido',
    meaning: 'Una pieza gráfica, texto o video producido para comunicar.',
    classification: 'public',
    identity: { titleField: 'title', subtitleField: 'format', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  conversation: {
    id: 'conversation',
    domain: 'ai',
    singular: 'Conversación',
    plural: 'Conversaciones',
    meaning:
      'Todo intercambio, venga de WhatsApp, correo, formulario o chat interno. El canal de origen deja de importar.',
    classification: 'restricted',
    identity: { titleField: 'subject', subtitleField: 'channel', statusField: 'status' },
    searchable: true,
    immutable: false,
    semantic: true,
  },
  recommendation: {
    id: 'recommendation',
    domain: 'ai',
    singular: 'Recomendación',
    plural: 'Recomendaciones',
    meaning:
      'Conocimiento generado, no texto. Siempre puede explicar por qué fue generada.',
    classification: 'internal',
    identity: { titleField: 'headline', subtitleField: 'subjectName', statusField: 'status' },
    searchable: true,
    immutable: true,
    semantic: false,
  },
};

export const ALL_ENTITY_TYPES: readonly EntityTypeDefinition[] = ENTITY_TYPE_IDS.map(
  (id) => ENTITY_TYPES[id],
);

export function isEntityTypeId(value: string): value is EntityTypeId {
  return (ENTITY_TYPE_IDS as readonly string[]).includes(value);
}

export function entityTypesOfDomain(domain: DomainId): readonly EntityTypeDefinition[] {
  return ALL_ENTITY_TYPES.filter((t) => t.domain === domain);
}

export const SEARCHABLE_ENTITY_TYPES: readonly EntityTypeId[] = ALL_ENTITY_TYPES.filter(
  (t) => t.searchable,
).map((t) => t.id);

export const SEMANTIC_ENTITY_TYPES: readonly EntityTypeId[] = ALL_ENTITY_TYPES.filter(
  (t) => t.semantic,
).map((t) => t.id);
