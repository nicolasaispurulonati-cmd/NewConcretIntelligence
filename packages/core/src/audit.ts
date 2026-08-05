/**
 * Auditoría y línea de tiempo.
 *
 * Son dos cosas distintas y por eso viven separadas:
 *
 *   `audit_log`  — lo que la empresa debe poder demostrar. Incluye los intentos
 *                  denegados. Nunca se modifica ni se elimina; la base lo
 *                  impide con un trigger, no sólo la aplicación.
 *   `activity`   — lo que una persona lee en el Timeline de una entidad y en el
 *                  Activity Feed. Está redactado para ser entendido.
 */

import { activity, auditLog } from '@nci/db';
import type { EntityTypeId, Provenance } from '@nci/domain';

import type { Scope } from './authorization/resolve.js';

export interface AuditEntry {
  readonly action: string;
  readonly entityId?: string;
  readonly entityType?: EntityTypeId;
  readonly capabilityUsed?: string;
  readonly outcome?: 'granted' | 'denied';
  readonly before?: unknown;
  readonly after?: unknown;
}

export async function recordAudit(scope: Scope, entry: AuditEntry): Promise<void> {
  await scope.db.insert(auditLog).values({
    actorId: scope.actor.id,
    actorName: scope.actor.fullName,
    action: entry.action,
    entityId: entry.entityId ?? null,
    entityType: entry.entityType ?? null,
    capabilityUsed: entry.capabilityUsed ?? null,
    outcome: entry.outcome ?? 'granted',
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipAddress: scope.origin?.ipAddress ?? null,
  });
}

/**
 * Registra un intento denegado.
 *
 * Un permiso denegado es información de seguridad: si alguien intenta veinte
 * veces llegar a información financiera, eso tiene que quedar registrado
 * aunque no haya llegado a nada.
 */
export async function recordDenial(
  scope: Scope,
  params: { action: string; capability: string; entityId?: string; entityType?: EntityTypeId },
): Promise<void> {
  await recordAudit(scope, {
    action: params.action,
    capabilityUsed: params.capability,
    outcome: 'denied',
    ...(params.entityId ? { entityId: params.entityId } : {}),
    ...(params.entityType ? { entityType: params.entityType } : {}),
  });
}

export interface ActivityEntry {
  readonly entityId: string;
  /** En pasado y en el lenguaje del negocio: 'publicó', 'recibió', 'actualizó'. */
  readonly verb: string;
  /** La frase completa, ya redactada: "Se recibieron 40 unidades." */
  readonly summary: string;
  readonly relatedEntityId?: string;
  readonly payload?: Record<string, unknown>;
  /**
   * De dónde salió. Por defecto lo hizo una persona.
   *
   * El tipo obliga a que un evento de origen externo diga de qué sistema vino
   * y cuándo se leyó: no se puede construir `integration` sin esos dos datos.
   * La base lo verifica igual, porque un script de importación puede no pasar
   * por acá.
   */
  readonly provenance?: Provenance;
}

export async function recordActivity(scope: Scope, entry: ActivityEntry): Promise<void> {
  const procedencia = entry.provenance ?? { source: 'user' as const };

  await scope.db.insert(activity).values({
    entityId: entry.entityId,
    verb: entry.verb,
    summary: entry.summary,
    actorId: scope.actor.id,
    actorName: scope.actor.fullName,
    source: procedencia.source,
    sourceSystem: procedencia.sourceSystem ?? null,
    sourceReadAt: procedencia.sourceReadAt ?? null,
    relatedEntityId: entry.relatedEntityId ?? null,
    payload: entry.payload ?? {},
  });
}
