/**
 * El Workspace.
 *
 * "Cuando inicia sesión no entra al módulo Ventas. Entra a su escritorio."
 *
 * Todo lo que aparece acá sale de `loadWorkspace`, que arma el escritorio de
 * esta persona a partir de sus roles y sus permisos. Antes, cuando no había
 * widgets que mostrar —o cuando no había sesión— la pantalla dibujaba un
 * tablero de ejemplo: Industrias Pampa, $ 65.676,38, tres hechos con fecha.
 * Datos verosímiles y falsos, en el lugar exacto donde alguien decide a quién
 * llamar. El Principio 20 dice que la plataforma no inventa; un tablero de
 * demostración indistinguible del real es la peor forma de romperlo.
 */

import { Notice } from '@/components/notice';
import { Widget } from '@/components/widget';
import { getScope } from '@/lib/session';
import { loadWorkspace } from '@/lib/workspace';

export default async function WorkspacePage(): Promise<React.ReactElement> {
  const scope = await getScope();

  if (!scope) {
    return (
      <main className="afuera__centro">
        <Notice
          title="Todavía no hay una sesión activa"
          reason="La plataforma adapta lo que muestra a la persona que la usa, así que necesita saber quién sos antes de mostrar nada."
          actions={[{ label: 'Ingresar', href: '/ingresar' }]}
        />
      </main>
    );
  }

  const { widgets, pending } = await loadWorkspace(scope);
  const firstName = scope.actor.fullName.split(' ')[0] ?? scope.actor.fullName;

  return (
    <>
      <header className="page__header">
        <h1 className="page__greeting">
          {saludo()}, <em>{firstName}</em>.
        </h1>
        <p className="page__lede">
          Esto es lo que tenés abierto hoy. Para cualquier otra cosa, <kbd>Ctrl</kbd> +{' '}
          <kbd>K</kbd> busca en toda la plataforma y ejecuta acciones sin salir de esta pantalla.
        </p>
      </header>

      {widgets.length > 0 ? (
        <div className="board">
          {widgets.map((widget) => (
            <Widget key={widget.id} widget={widget} />
          ))}
        </div>
      ) : (
        /* Un escritorio vacío se explica. No se rellena. */
        <Notice
          title="Tu escritorio todavía no tiene nada que mostrar"
          reason={
            pending.length > 0
              ? 'Los widgets que propone tu rol dependen de dominios que todavía no están construidos.'
              : 'Tu rol no propone ningún widget, o los que propone no encontraron datos que puedas consultar.'
          }
          actions={[{ label: 'Buscar en la plataforma', href: '/buscar' }]}
        />
      )}

      {pending.length > 0 && (
        <section className="section">
          <h2 className="section__title">Se activarán con su dominio</h2>
          <p className="page__lede">
            Tu rol propone {pending.length}{' '}
            {pending.length === 1 ? 'widget más' : 'widgets más'} que dependen de dominios todavía
            no construidos: {pending.join(', ')}. Aparecerán en tu escritorio en cuanto existan.
          </p>
        </section>
      )}
    </>
  );
}

function saludo(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
