/**
 * El Actor: quién está haciendo algo y qué está autorizado a hacer.
 *
 * Es la pieza de la que depende toda la seguridad del producto. Nada en el
 * sistema lee datos sin un Actor — ni la interfaz, ni las automatizaciones, ni
 * la IA. Eso es lo que hace verdadera la regla del documento de roles:
 *
 *   "La IA nunca podrá acceder a información que el usuario no pueda consultar
 *    manualmente."
 *
 * No es una promesa del prompt: es que el motor de IA no tiene otra forma de
 * llegar a los datos que a través de este objeto.
 */

import {
  CAPABILITY_CATALOG,
  ENTITY_TYPES,
  gateForClassification,
  impliedCapabilities,
  resourceForEntityType,
  type CapabilityAction,
  type CapabilityId,
  type DataClassification,
  type EntityTypeId,
  type RoleId,
} from '@nci/domain';

import { NotAuthorizedError } from '../errors.js';

export interface ActorInput {
  readonly id: string;
  readonly fullName: string;
  readonly roles: readonly RoleId[];
  /** Capacidades ya resueltas: roles expandidos, más concesiones, menos revocaciones. */
  readonly capabilities: ReadonlySet<CapabilityId>;
}

/**
 * Traduce una capacidad a la frase con la que el sistema explica su ausencia.
 * `executive.financials.read` → "consultar información financiera".
 */
function inHumanTerms(capability: CapabilityId): string {
  const known = CAPABILITY_CATALOG.get(capability);
  if (!known) return 'realizar esta acción';
  return known.statement.replace(/^Puede /, '');
}

export class Actor {
  readonly id: string;
  readonly fullName: string;
  readonly roles: readonly RoleId[];
  readonly capabilities: ReadonlySet<CapabilityId>;

  constructor(input: ActorInput) {
    this.id = input.id;
    this.fullName = input.fullName;
    this.roles = input.roles;
    this.capabilities = input.capabilities;
  }

  can(capability: CapabilityId): boolean {
    return this.capabilities.has(capability);
  }

  canAll(capabilities: readonly CapabilityId[]): boolean {
    return capabilities.every((capability) => this.can(capability));
  }

  canAny(capabilities: readonly CapabilityId[]): boolean {
    return capabilities.some((capability) => this.can(capability));
  }

  /** Lanza un error que explica qué falta y cómo obtenerlo. */
  assert(capability: CapabilityId): void {
    if (this.can(capability)) return;
    throw new NotAuthorizedError({
      missingCapability: capability,
      inHumanTerms: inHumanTerms(capability),
    });
  }

  /**
   * Si puede realizar una acción sobre un tipo de entidad.
   *
   * Además del permiso sobre el recurso, verifica la clasificación del dato:
   * un usuario con acceso a productos no ve por eso su rentabilidad. Es la
   * regla que separa a Marketing de Dirección sin duplicar permisos.
   */
  canActOn(entityType: EntityTypeId, action: CapabilityAction): boolean {
    const resource = resourceForEntityType(entityType);
    // Sin recurso asociado el tipo no es gobernable: se deniega. Un tipo nuevo
    // sin permisos declarados no debe quedar accesible por omisión.
    if (!resource) return false;
    if (!resource.actions.includes(action)) return false;
    if (!this.can(`${resource.id}.${action}`)) return false;
    return this.canSee(ENTITY_TYPES[entityType].classification);
  }

  assertCanActOn(entityType: EntityTypeId, action: CapabilityAction): void {
    if (this.canActOn(entityType, action)) return;

    const resource = resourceForEntityType(entityType);
    const definition = ENTITY_TYPES[entityType];
    const gate = gateForClassification(definition.classification);

    // Cuando lo que falta es el permiso sobre la clasificación y no sobre el
    // recurso, el mensaje tiene que nombrar eso: la persona ve el producto,
    // lo que no puede ver es su información financiera.
    if (gate && !this.can(gate)) {
      throw new NotAuthorizedError({ missingCapability: gate, inHumanTerms: inHumanTerms(gate) });
    }

    const capability = resource ? `${resource.id}.${action}` : `${entityType}.${action}`;
    throw new NotAuthorizedError({
      missingCapability: capability,
      inHumanTerms: inHumanTerms(capability),
    });
  }

  /** Si la clasificación de un dato está a su alcance. */
  canSee(classification: DataClassification): boolean {
    const gate = gateForClassification(classification);
    return gate === null || this.can(gate);
  }

  /** Las clasificaciones que puede leer. Se usa para filtrar en SQL. */
  visibleClassifications(): readonly DataClassification[] {
    const all: DataClassification[] = ['public', 'internal', 'financial', 'restricted'];
    return all.filter((classification) => this.canSee(classification));
  }

  /** Los tipos de entidad que puede consultar. Acota búsqueda y contexto de IA. */
  readableEntityTypes(): readonly EntityTypeId[] {
    return (Object.keys(ENTITY_TYPES) as EntityTypeId[]).filter((type) =>
      this.canActOn(type, 'read'),
    );
  }
}

/**
 * Combina roles y ajustes individuales en el conjunto efectivo de capacidades.
 *
 * Tres reglas, en este orden:
 *   1. Cada capacidad concedida arrastra los niveles inferiores del mismo
 *      recurso: quien administra stock puede consultarlo.
 *   2. Las concesiones individuales suman a lo que dan los roles.
 *   3. Las revocaciones restan y siempre ganan — incluso sobre lo que implicó
 *      un nivel superior. Poder quitarle a alguien un permiso puntual sin
 *      sacarle el rol entero es lo que hace usable el modelo.
 */
export function resolveCapabilities(params: {
  readonly fromRoles: readonly CapabilityId[];
  readonly granted?: readonly CapabilityId[];
  readonly revoked?: readonly CapabilityId[];
}): ReadonlySet<CapabilityId> {
  const effective = new Set<CapabilityId>();

  for (const capability of [...params.fromRoles, ...(params.granted ?? [])]) {
    for (const implied of impliedCapabilities(capability)) {
      effective.add(implied);
    }
  }

  for (const capability of params.revoked ?? []) {
    effective.delete(capability);
  }

  return effective;
}
