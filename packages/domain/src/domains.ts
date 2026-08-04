/**
 * Los doce dominios de NewConcret Intelligence.
 *
 * Un dominio no existe porque exista un departamento. Existe porque existe un
 * conjunto de procesos y datos relacionados. "Ventas" no representa al equipo
 * comercial: representa el dominio comercial.
 *
 * Ver: 3. Functional Architecture.
 */

export const DOMAIN_IDS = [
  'identity',
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
  'ai',
] as const;

export type DomainId = (typeof DOMAIN_IDS)[number];

/**
 * Agrupación de alto nivel usada por la arquitectura funcional. No tiene efecto
 * sobre permisos ni datos: sólo ordena la lectura del sistema.
 */
export type DomainGroup = 'comercial' | 'operaciones' | 'knowledge' | 'inteligencia' | 'plataforma';

export interface DomainDefinition {
  readonly id: DomainId;
  readonly name: string;
  readonly group: DomainGroup;
  /** Una frase. Qué responsabilidad tiene este dominio y ninguna otra. */
  readonly responsibility: string;
  /**
   * Las preguntas que el dominio existe para responder.
   * Principio 9: pensar en decisiones, no en pantallas. Si un dominio no puede
   * enunciar sus preguntas, probablemente no debería existir.
   */
  readonly answers: readonly string[];
  /**
   * Dominios de los que depende para funcionar. Sirve para detectar ciclos y
   * para garantizar que un dominio nuevo no obligue a tocar los existentes.
   */
  readonly dependsOn: readonly DomainId[];
  /** false cuando el dominio no tiene superficie propia en la navegación. */
  readonly userFacing: boolean;
}

export const DOMAINS: { readonly [K in DomainId]: DomainDefinition } = {
  identity: {
    id: 'identity',
    name: 'Identity',
    group: 'plataforma',
    responsibility: 'Administrar quién puede ingresar al sistema y qué puede hacer.',
    answers: ['¿Quién es este usuario?', '¿Qué está autorizado a hacer?', '¿Qué hizo y cuándo?'],
    dependsOn: [],
    userFacing: true,
  },
  crm: {
    id: 'crm',
    name: 'CRM',
    group: 'comercial',
    responsibility: 'Gestionar las relaciones comerciales. No administra productos ni stock.',
    answers: [
      '¿Quién es este cliente?',
      '¿Qué historia tenemos con él?',
      '¿Qué oportunidades hay abiertas?',
    ],
    dependsOn: ['identity'],
    userFacing: true,
  },
  sales: {
    id: 'sales',
    name: 'Sales',
    group: 'comercial',
    responsibility: 'Conducir el proceso comercial desde la cotización hasta la conversión.',
    answers: [
      '¿En qué estado está el pipeline?',
      '¿Qué presupuestos esperan respuesta?',
      '¿Qué conviene ofrecer a este cliente?',
    ],
    dependsOn: ['identity', 'crm', 'products'],
    userFacing: true,
  },
  inventory: {
    id: 'inventory',
    name: 'Inventory',
    group: 'operaciones',
    responsibility:
      'Conocer la disponibilidad física y su trazabilidad. No conoce clientes ni ventas.',
    answers: [
      '¿Qué producto se agotará primero?',
      '¿Qué capital está inmovilizado?',
      '¿Qué artículos tienen baja rotación?',
    ],
    dependsOn: ['identity', 'products'],
    userFacing: true,
  },
  procurement: {
    id: 'procurement',
    name: 'Procurement',
    group: 'operaciones',
    responsibility: 'Garantizar la disponibilidad a través de la compra.',
    answers: ['¿Qué debo comprar?', '¿Cuánto?', '¿Cuándo?', '¿A quién?'],
    dependsOn: ['identity', 'products', 'inventory'],
    userFacing: true,
  },
  products: {
    id: 'products',
    name: 'Products',
    group: 'knowledge',
    responsibility:
      'Custodiar el conocimiento completo del producto. No es stock y no es ventas.',
    answers: ['¿Qué necesito saber sobre este producto?'],
    dependsOn: ['identity', 'knowledge'],
    userFacing: true,
  },
  knowledge: {
    id: 'knowledge',
    name: 'Knowledge',
    group: 'knowledge',
    responsibility:
      'Conservar el conocimiento de la empresa para que permanezca aunque las personas cambien.',
    answers: [
      '¿Cómo se hace esto?',
      '¿Ya nos pasó algo parecido?',
      '¿Cuál es la forma oficial de resolverlo?',
    ],
    dependsOn: ['identity'],
    userFacing: true,
  },
  support: {
    id: 'support',
    name: 'Support',
    group: 'operaciones',
    responsibility:
      'Resolver la asistencia técnica y devolver cada experiencia al dominio Knowledge.',
    answers: [
      '¿Qué le pasa a este cliente?',
      '¿Cómo lo resolvimos antes?',
      '¿Qué quedó sin responder?',
    ],
    dependsOn: ['identity', 'crm', 'products', 'knowledge'],
    userFacing: true,
  },
  academy: {
    id: 'academy',
    name: 'Academy',
    group: 'operaciones',
    responsibility: 'Formar y certificar a personas internas y externas.',
    answers: ['¿Quién está capacitado para esto?', '¿Qué formación falta?'],
    dependsOn: ['identity', 'knowledge'],
    userFacing: true,
  },
  marketing: {
    id: 'marketing',
    name: 'Marketing',
    group: 'comercial',
    responsibility: 'Generar demanda. No vende.',
    answers: [
      '¿Qué producto conviene promocionar?',
      '¿Qué temas preguntan más los clientes?',
      '¿Qué contenido falta?',
      '¿Qué campañas tuvieron mejor resultado?',
    ],
    dependsOn: ['identity', 'products', 'knowledge'],
    userFacing: true,
  },
  executive: {
    id: 'executive',
    name: 'Executive Intelligence',
    group: 'inteligencia',
    responsibility: 'No mostrar datos: responder preguntas sobre toda la empresa.',
    answers: [
      '¿Qué pasó este mes?',
      '¿Qué productos crecieron?',
      '¿Qué proveedores tienen más demoras?',
      '¿Qué riesgos tenemos?',
    ],
    dependsOn: [
      'identity',
      'crm',
      'sales',
      'inventory',
      'procurement',
      'products',
      'knowledge',
      'support',
      'academy',
      'marketing',
    ],
    userFacing: true,
  },
  ai: {
    id: 'ai',
    name: 'AI Engine',
    group: 'inteligencia',
    responsibility:
      'Asistir dentro de los demás dominios. Existe internamente; el usuario nunca lo ve como una sección.',
    answers: [],
    // La IA no depende de dominios concretos: recibe el contexto ya autorizado
    // por el core. Dejarlo vacío es deliberado — impide que el motor de IA
    // importe dominios de negocio y termine con acceso propio a los datos.
    dependsOn: ['identity'],
    userFacing: false,
  },
};

export const ALL_DOMAINS: readonly DomainDefinition[] = DOMAIN_IDS.map((id) => DOMAINS[id]);

export function isDomainId(value: string): value is DomainId {
  return (DOMAIN_IDS as readonly string[]).includes(value);
}
