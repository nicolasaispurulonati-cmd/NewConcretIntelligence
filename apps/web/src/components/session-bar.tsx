/**
 * Quién está usando la plataforma, y cómo salir.
 *
 * Principio 11 del PDL: el usuario nunca se pierde — siempre sabe dónde está,
 * qué está viendo y qué puede hacer. En un producto donde dos personas nunca
 * ven lo mismo, saber con qué cuenta se entró es parte de esa orientación: si
 * el escritorio no muestra lo esperado, la primera pregunta es siempre "¿con
 * qué usuario estoy?".
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { Actor } from '@nci/core';
import { signOut } from '@nci/core';
import { getDatabase } from '@nci/db';
import { ROLES } from '@nci/domain';

import { SESSION_COOKIE } from '@/lib/session';

async function signOutAction(): Promise<void> {
  'use server';

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    // Se revoca en la base, no sólo se borra la cookie: si alguien copió el
    // token, borrarlo del navegador no lo dejaría fuera.
    await signOut(getDatabase(), token);
  }

  jar.delete(SESSION_COOKIE);
  redirect('/ingresar');
}

export function SessionBar({ actor }: { actor: Actor }): React.ReactElement {
  const roles = actor.roles.map((roleId) => ROLES[roleId]?.name ?? roleId);

  return (
    <div className="session">
      <p className="session__who">
        <span className="session__name">{actor.fullName}</span>
        {/* El rol, con el nombre que le da el sistema de permisos. No un
            "nivel de acceso" inventado: si dice Comercial es porque el Actor
            tiene ese rol, y es lo que explica qué se ve y qué no. */}
        <span className="session__role">
          {roles.length > 0 ? roles.join(' · ') : 'Sin rol asignado'}
        </span>
      </p>

      <span className="session__avatar" aria-hidden="true">
        {iniciales(actor.fullName)}
      </span>

      <form action={signOutAction}>
        <button className="session__exit" type="submit">
          Salir
        </button>
      </form>
    </div>
  );
}

/** Las iniciales del nombre. Decorativas: el nombre completo está al lado. */
function iniciales(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}
