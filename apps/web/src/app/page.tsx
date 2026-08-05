/**
 * El Workspace.
 *
 * "Cuando inicia sesión no entra al módulo Ventas. Entra a su escritorio."
 *
 * No hay un dashboard genérico: cada persona ve lo que su trabajo requiere,
 * antes de entrar a ninguna sección.
 */

import Link from 'next/link';

import { Widget } from '@/components/widget';
import { Notice } from '@/components/notice';
import { getScope } from '@/lib/session';
import { loadWorkspace } from '@/lib/workspace';

export default async function WorkspacePage(): Promise<React.ReactElement> {
  const scope = await getScope();

  if (!scope) {
    return (
      <Notice
        title="Todavía no hay una sesión activa"
        reason="La plataforma adapta lo que muestra a la persona que la usa, así que necesita saber quién sos antes de mostrar nada."
        actions={[{ label: 'Ingresar', href: '/ingresar' }]}
      />
    );
  }

  const { widgets, pending } = await loadWorkspace(scope);
  const firstName = scope.actor.fullName.split(' ')[0] ?? scope.actor.fullName;

  return (
    <>
      <h1 className="page__greeting">
        {greeting()}, {firstName}.
      </h1>
      <p className="page__lede">
        Esto es lo que tenés hoy. Para cualquier otra cosa, <kbd>Ctrl</kbd> + <kbd>K</kbd>.
      </p>

      <section className="section">
        <div className="widgets">
          {widgets.map((widget) => (
            <Widget key={widget.id} widget={widget} />
          ))}
        </div>
      </section>

      {pending.length > 0 && (
        <section className="section">
          <h2 className="section__title">Se activarán con su dominio</h2>
          <p className="page__lede">
            Tu rol propone {pending.length}{' '}
            {pending.length === 1 ? 'widget más' : 'widgets más'} que dependen de dominios todavía no
            construidos: {pending.join(', ')}. Aparecerán en tu escritorio en cuanto existan, sin que
            tengas que configurar nada.
          </p>
        </section>
      )}

      <section className="section">
        <h2 className="section__title">Acciones rápidas</h2>
        <div className="notice__actions">
          <Link className="button button--primary" href="/buscar">
            Buscar en la plataforma
          </Link>
          <Link className="button" href="/actividad">
            Ver toda la actividad
          </Link>
        </div>
      </section>
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
