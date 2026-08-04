/**
 * Siembra lo que el sistema necesita para existir: los roles y sus capacidades,
 * y un primer administrador.
 *
 * Es idempotente — puede correrse en cada despliegue. Los roles del sistema se
 * versionan con el código, así que esta siembra es la que los mantiene
 * sincronizados con @nci/domain: si mañana se agrega una capacidad a Compras,
 * se propaga al correr esto y no hay que tocar la base a mano.
 *
 * No crea contraseñas. El primer administrador queda invitado y define la suya
 * al ingresar: una clave por defecto en un script de siembra es una clave
 * publicada.
 */

import { eq, inArray, and, notInArray } from 'drizzle-orm';

import { ALL_ROLES } from '@nci/domain';

import { createDatabase } from './client.js';
import { requireDatabaseUrl } from './env.js';
import { roles, roleCapabilities, userRoles, users } from './schema/identity.js';

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const db = createDatabase({ url, max: 1 });
  try {
    await seed(db);
  } finally {
    // Cerrar explícitamente y no confiar en que el proceso termine: una
    // conexión abandonada deja al servidor esperando a un cliente que ya no
    // está, y la siguiente ejecución se encuentra el puerto tomado.
    await db.$client.end();
  }
}

async function seed(db: ReturnType<typeof createDatabase>): Promise<void> {

  // ── Roles del sistema ──────────────────────────────────────────────────
  for (const role of ALL_ROLES) {
    await db
      .insert(roles)
      .values({
        id: role.id,
        name: role.name,
        objective: role.objective,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.id,
        set: { name: role.name, objective: role.objective, updatedAt: new Date() },
      });

    const wanted = [...role.capabilities];

    if (wanted.length > 0) {
      await db
        .insert(roleCapabilities)
        .values(wanted.map((capabilityId) => ({ roleId: role.id, capabilityId })))
        .onConflictDoNothing();
    }

    // Una capacidad que se quitó del código tiene que desaparecer de la base.
    // Sin esto, revocar un permiso en @nci/domain no revocaría nada en producción.
    await db
      .delete(roleCapabilities)
      .where(
        wanted.length > 0
          ? and(
              eq(roleCapabilities.roleId, role.id),
              notInArray(roleCapabilities.capabilityId, wanted),
            )
          : eq(roleCapabilities.roleId, role.id),
      );

    console.log(`Rol ${role.name}: ${wanted.length} capacidades.`);
  }

  // Roles del sistema que ya no existen en el código.
  const systemRoleIds = ALL_ROLES.map((r) => r.id);
  const orphans = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.isSystem, true), notInArray(roles.id, systemRoleIds)));

  if (orphans.length > 0) {
    console.warn(
      `Hay roles del sistema en la base que ya no existen en el código: ${orphans
        .map((role: { id: string }) => role.id)
        .join(', ')}. No se eliminan automáticamente porque puede haber usuarios asignados.`,
    );
  }

  // ── Primer administrador ───────────────────────────────────────────────
  const adminEmail = process.env['NCI_ADMIN_EMAIL'];
  if (!adminEmail) {
    console.log(
      '\nRoles listos. Para crear el primer administrador, volvé a correr con NCI_ADMIN_EMAIL definido.',
    );
    return;
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail));

  let adminId = existing[0]?.id;
  if (!adminId) {
    const [created] = await db
      .insert(users)
      .values({
        email: adminEmail,
        fullName: process.env['NCI_ADMIN_NAME'] ?? adminEmail,
        jobTitle: 'Administrador del sistema',
        status: 'invited',
      })
      .returning({ id: users.id });
    adminId = created!.id;
    console.log(`\nUsuario creado: ${adminEmail} (invitado).`);
  }

  await db
    .insert(userRoles)
    .values({ userId: adminId, roleId: 'system_admin' })
    .onConflictDoNothing();

  const assigned = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, adminId), inArray(userRoles.roleId, ['system_admin'])));

  console.log(
    assigned.length > 0
      ? `${adminEmail} tiene el rol Administrador del sistema. Define su contraseña al ingresar por primera vez.`
      : 'No se pudo asignar el rol de administrador.',
  );
}

await main();
