/**
 * El Scope de la petición actual.
 *
 * Todo lo que la aplicación web lee o escribe pasa por acá. No hay ninguna
 * página, ninguna acción y ninguna ruta que toque la base sin un Actor.
 */

import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { NotAuthenticatedError, resolveSession, type Scope } from '@nci/core';
import { getDatabase } from '@nci/db';

export const SESSION_COOKIE = 'nci_session';

/** El Scope, o null si no hay sesión activa. */
export async function getScope(): Promise<Scope | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const db = getDatabase();
    const actor = await resolveSession(db, token);
    const headerList = await headers();

    return {
      db,
      actor,
      origin: {
        ...(headerList.get('x-forwarded-for')
          ? { ipAddress: headerList.get('x-forwarded-for')! }
          : {}),
        ...(headerList.get('user-agent') ? { userAgent: headerList.get('user-agent')! } : {}),
      },
    };
  } catch (error) {
    if (error instanceof NotAuthenticatedError) return null;
    throw error;
  }
}

/** El Scope o una redirección al ingreso. Para páginas que exigen sesión. */
export async function requireScope(): Promise<Scope> {
  const scope = await getScope();
  if (!scope) redirect('/ingresar');
  return scope;
}
