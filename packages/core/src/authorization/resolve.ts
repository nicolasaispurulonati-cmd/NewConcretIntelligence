/**
 * Resuelve un Actor desde la base de datos.
 *
 * Se calcula al momento de usarlo y nunca se guarda materializado: si un rol
 * cambia, el cambio rige en la petición siguiente y no queda ningún permiso
 * viejo esperando en una tabla.
 */

import { and, eq, gt, isNull, or } from 'drizzle-orm';

import type { CapabilityId, RoleId } from '@nci/domain';
import type { Database } from '@nci/db';
import { roleCapabilities, userCapabilities, userRoles, users } from '@nci/db';

import { NotAuthenticatedError } from '../errors.js';
import { Actor, resolveCapabilities } from './actor.js';

export async function resolveActor(db: Database, userId: string): Promise<Actor> {
  const [user] = await db
    .select({ id: users.id, fullName: users.fullName, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.status !== 'active') {
    throw new NotAuthenticatedError();
  }

  const assignedRoles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  const roleIds = assignedRoles.map((row) => row.roleId as RoleId);

  const fromRoles =
    roleIds.length === 0
      ? []
      : (
          await db
            .selectDistinct({ capabilityId: roleCapabilities.capabilityId })
            .from(roleCapabilities)
            .innerJoin(userRoles, eq(userRoles.roleId, roleCapabilities.roleId))
            .where(eq(userRoles.userId, userId))
        ).map((row) => row.capabilityId as CapabilityId);

  // Las concesiones vencidas no se borran: se dejan de contar. Conservarlas
  // permite auditar qué acceso tuvo alguien y hasta cuándo.
  const individual = await db
    .select({
      capabilityId: userCapabilities.capabilityId,
      effect: userCapabilities.effect,
    })
    .from(userCapabilities)
    .where(
      and(
        eq(userCapabilities.userId, userId),
        or(isNull(userCapabilities.expiresAt), gt(userCapabilities.expiresAt, new Date())),
      ),
    );

  const granted = individual
    .filter((row) => row.effect === 'grant')
    .map((row) => row.capabilityId as CapabilityId);
  const revoked = individual
    .filter((row) => row.effect === 'revoke')
    .map((row) => row.capabilityId as CapabilityId);

  return new Actor({
    id: user.id,
    fullName: user.fullName,
    roles: roleIds,
    capabilities: resolveCapabilities({ fromRoles, granted, revoked }),
  });
}

/**
 * El único objeto con el que se opera sobre los datos.
 *
 * Todo lo que lee o escribe recibe un Scope, nunca una conexión suelta. La
 * consecuencia buscada es estructural: el paquete de IA no puede consultar la
 * base sin un Actor, así que no existe el camino por el cual la IA vea algo que
 * la persona no vería.
 */
export interface Scope {
  readonly db: Database;
  readonly actor: Actor;
  /** De dónde vino la acción. Va a la auditoría. */
  readonly origin?: { readonly ipAddress?: string; readonly userAgent?: string };
}

export function createScope(params: Scope): Scope {
  return params;
}
