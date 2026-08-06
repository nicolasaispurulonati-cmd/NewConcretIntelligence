/**
 * Administración.
 *
 * "No importa el cargo. Importa qué puede hacer."
 *
 * Esta pantalla lee: no cambia permisos ni da de alta a nadie. Mostrar quién
 * tiene qué es lo que hace auditable al sistema de autorización, y es lo que
 * el backend ya sabe responder. Conceder y revocar es otra cosa —es escritura
 * sobre la pieza de la que depende toda la seguridad— y no se agrega de
 * paso mientras se resuelve la estética.
 *
 * El acceso se verifica acá y no sólo en el menú: una entrada oculta no es un
 * permiso. Quien escriba la URL a mano recibe la misma respuesta.
 */

import { asc, eq } from 'drizzle-orm';

import { formatRelativeTime } from '@nci/design';
import { roles, userRoles, users } from '@nci/db';
import { ROLES, isRoleId } from '@nci/domain';

import { Notice } from '@/components/notice';
import { requireScope } from '@/lib/session';

export default async function AdministracionPage(): Promise<React.ReactElement> {
  const scope = await requireScope();

  if (!scope.actor.can('identity.user.admin')) {
    return (
      <Notice
        title="No tenés acceso a la administración de la plataforma"
        reason="Administrar usuarios y roles requiere la capacidad de administración de identidad, que no está entre las tuyas. Se concede de forma explícita y queda registrada en la auditoría."
        actions={[{ label: 'Volver al escritorio', href: '/' }]}
      />
    );
  }

  const [personas, definidos] = await Promise.all([
    scope.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        jobTitle: users.jobTitle,
        status: users.status,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .orderBy(asc(users.fullName)),
    scope.db
      .select({ userId: userRoles.userId, roleId: userRoles.roleId, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId)),
  ]);

  const rolesDe = new Map<string, string[]>();
  for (const fila of definidos) {
    rolesDe.set(fila.userId, [...(rolesDe.get(fila.userId) ?? []), fila.name]);
  }

  return (
    <>
      <header className="page__header">
        <h1 className="page__greeting">Administración</h1>
        <p className="page__lede">
          Quién puede ingresar y qué puede hacer. Un rol es un atajo, no una jaula: agrupa
          capacidades que suelen ir juntas, y encima de eso cada persona puede tener concesiones o
          revocaciones propias.
        </p>
      </header>

      <section className="section">
        <h2 className="section__title">Personas</h2>

        {personas.length === 0 ? (
          <p className="page__lede">
            Todavía no hay ninguna persona cargada. Se crean con la siembra inicial de la base.
          </p>
        ) : (
          <ul className="widget__lines">
            {personas.map((persona) => (
              <li key={persona.id}>
                <div className="widget__line">
                  <span className="widget__line-primary">{persona.fullName}</span>
                  <span className="widget__line-secondary">
                    {persona.email}
                    {persona.jobTitle && ` · ${persona.jobTitle}`}
                  </span>
                  <span className="widget__line-secondary">
                    {/* Nunca sólo la palabra del estado: qué significa. */}
                    {describirEstado(persona.status)} ·{' '}
                    {rolesDe.get(persona.id)?.join(' · ') ?? 'Sin rol asignado'} ·{' '}
                    {persona.lastSeenAt
                      ? `visto ${formatRelativeTime(persona.lastSeenAt).toLowerCase()}`
                      : 'todavía no ingresó'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="section__title">Roles del sistema</h2>
        <p className="page__lede">
          Se versionan con el código y no se editan desde acá. Cada uno declara qué persigue y qué
          explícitamente no toca; esa segunda lista la verifica el build, así que no puede quedar
          desactualizada sin que algo se rompa.
        </p>

        <div className="cards">
          {[...new Set(definidos.map((fila) => fila.roleId))]
            .filter(isRoleId)
            .map((roleId) => (
              <article key={roleId} className="card">
                <h3 className="card__title">{ROLES[roleId].name}</h3>
                <p className="card__text">{ROLES[roleId].objective}</p>
                <span className="tag">
                  {ROLES[roleId].capabilities.length} capacidades
                  {ROLES[roleId].neverModifies.length > 0 &&
                    ` · nunca modifica ${ROLES[roleId].neverModifies.length}`}
                </span>
              </article>
            ))}
        </div>
      </section>
    </>
  );
}

/** El estado de una cuenta, dicho entero. Principio 8. */
function describirEstado(status: string): string {
  switch (status) {
    case 'active':
      return 'Activa, puede ingresar';
    case 'invited':
      return 'Invitada, todavía sin contraseña';
    case 'suspended':
      return 'Suspendida, no puede ingresar';
    default:
      return status;
  }
}
