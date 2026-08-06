/**
 * El Workspace.
 *
 * "Cuando inicia sesión no entra al módulo Ventas. Entra a su escritorio."
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
      <div className="p-grid-margin space-y-stack-lg">
        <Notice
          title="Todavía no hay una sesión activa"
          reason="La plataforma adapta lo que muestra a la persona que la usa, así que necesita saber quién sos antes de mostrar nada."
          actions={[{ label: 'Ingresar', href: '/ingresar' }]}
        />
        <DefaultDashboardView firstName="Vendedor" />
      </div>
    );
  }

  const { widgets, pending } = await loadWorkspace(scope);
  const firstName = scope.actor.fullName.split(' ')[0] ?? scope.actor.fullName;

  return (
    <div className="flex flex-col w-full h-full relative overflow-hidden bg-background">
      {/* Subheader bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-surface-container-highest bg-surface-container-lowest sticky top-0 z-10 backdrop-blur-md bg-opacity-80">
        <div>
          <h1 className="font-display-lg text-on-surface">
            {greeting()}, <span className="text-primary">{firstName}</span>.
          </h1>
          <p className="font-body-md text-on-surface-variant mt-0.5">
            System Intel / Active Profile / Level 4
          </p>
        </div>

        <div className="relative w-56 group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[16px]">
            search
          </span>
          <input
            aria-label="Search command"
            className="w-full bg-surface border border-surface-container-highest rounded-lg py-1.5 pl-9 pr-12 text-[12px] text-on-surface focus:outline-none focus:border-primary-container transition-all placeholder:text-on-tertiary-fixed-variant"
            placeholder="Command Search..."
            type="text"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface-container px-1.5 py-0.5 border border-surface-container-highest rounded pointer-events-none">
            <span className="font-data-mono text-[9px] text-on-surface-variant">Ctrl+K</span>
          </div>
        </div>
      </div>

      {/* Grid view */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-5 overflow-y-auto">
        {widgets.length > 0 ? (
          widgets.map((w) => (
            <div key={w.id} className="md:col-span-4 flex flex-col gap-stack-lg">
              <Widget widget={w} />
            </div>
          ))
        ) : (
          <DefaultDashboardContent />
        )}
      </div>

      {pending.length > 0 && (
        <div className="px-grid-margin pb-grid-margin">
          <section className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-stack-xs">
              Se activarán con su dominio
            </h2>
            <p className="font-body-md text-on-surface-variant">
              Tu rol propone {pending.length}{' '}
              {pending.length === 1 ? 'widget más' : 'widgets más'} que dependen de dominios todavía no
              construidos: {pending.join(', ')}. Aparecerán en tu escritorio en cuanto existan.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function DefaultDashboardView({ firstName }: { firstName: string }): React.ReactElement {
  return (
    <div className="flex flex-col w-full h-full relative overflow-hidden bg-background">
      <div className="px-grid-margin py-stack-lg flex items-center justify-between border-b border-surface-container-highest bg-surface-container-lowest sticky top-0 z-10 backdrop-blur-md bg-opacity-80">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">
            {greeting()}, <span className="text-primary">{firstName}</span>.
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-stack-xs">
            System Intel / Active Profile / Level 4
          </p>
        </div>

        <div className="relative w-72 group">
          <span className="material-symbols-outlined absolute left-stack-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
            search
          </span>
          <input
            aria-label="Search command"
            className="w-full bg-surface border border-surface-container-highest rounded-lg py-2 pl-10 pr-12 text-body-md text-on-surface focus:outline-none focus:border-primary-container transition-all placeholder:text-on-tertiary-fixed-variant"
            placeholder="Command Search..."
            type="text"
          />
          <div className="absolute right-stack-sm top-1/2 -translate-y-1/2 bg-surface-container px-2 py-1 border border-surface-container-highest rounded pointer-events-none">
            <span className="font-data-mono text-label-caps text-on-surface-variant">Ctrl+K</span>
          </div>
        </div>
      </div>

      <div className="p-grid-margin grid grid-cols-1 md:grid-cols-12 gap-grid-gutter overflow-y-auto">
        <DefaultDashboardContent />
      </div>
    </div>
  );
}

function DefaultDashboardContent(): React.ReactElement {
  return (
    <>
      {/* Col 1: Comprometido */}
      <div className="md:col-span-4 flex flex-col gap-stack-lg">
        <div className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors duration-700"></div>

          <div className="flex items-center justify-between mb-stack-lg relative z-10">
            <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-stack-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">
                account_balance_wallet
              </span>
              Comprometido
            </h2>
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest border border-surface-container-highest px-2 py-1 rounded bg-surface">
              Open Budgets
            </span>
          </div>

          <div className="relative z-10">
            <div className="font-display-lg text-display-lg text-on-surface mb-stack-sm">
              $ 65.676,38
            </div>
            <div className="flex items-center gap-stack-md border-b border-surface-container-highest pb-stack-md">
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Sin Enviar
                </span>
                <span className="font-headline-md text-headline-md text-on-surface">1</span>
              </div>
              <div className="w-px h-8 bg-surface-container-highest"></div>
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Esperando Resp.
                </span>
                <span className="font-headline-md text-headline-md text-on-surface">1</span>
              </div>
            </div>
          </div>

          <div className="mt-stack-md space-y-stack-sm relative z-10">
            <div className="flex justify-between items-center bg-surface p-stack-sm rounded-lg border border-surface-container-highest hover:border-primary-container/30 transition-colors cursor-pointer">
              <div>
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  Industrias Pampa
                </div>
                <div className="font-label-caps text-label-caps text-on-surface-variant">
                  P-2026-0004
                </div>
              </div>
              <div className="font-data-mono text-data-mono text-on-surface text-right">
                $ 32.100,50
              </div>
            </div>

            <div className="flex justify-between items-center bg-surface p-stack-sm rounded-lg border border-surface-container-highest hover:border-primary-container/30 transition-colors cursor-pointer">
              <div>
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  Constructora Litoral
                </div>
                <div className="font-label-caps text-label-caps text-on-surface-variant">
                  P-2026-0005
                </div>
              </div>
              <div className="font-data-mono text-data-mono text-on-surface text-right">
                $ 33.575,88
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Col 2: Esperan Respuesta */}
      <div className="md:col-span-4 flex flex-col gap-stack-lg">
        <div className="flex items-center justify-between border-b border-surface-container-highest pb-stack-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-stack-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
            Esperan Respuesta
          </h2>
          <span className="w-6 h-6 rounded bg-surface-container border border-surface-container-highest flex items-center justify-center font-data-mono text-label-caps text-on-surface">
            1
          </span>
        </div>

        <div className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl hover:border-primary/50 transition-colors group cursor-pointer relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none"></div>

          <div className="flex justify-between items-start mb-stack-md">
            <div>
              <div className="font-body-md text-body-md text-on-surface font-semibold">
                Constructora del Litoral
              </div>
              <div className="font-label-caps text-label-caps text-on-surface-variant mt-1">
                P-2026-0005
              </div>
            </div>
            <div className="bg-surface border border-surface-container-highest px-2 py-1 rounded text-primary font-label-caps text-label-caps">
              URGENT
            </div>
          </div>

          <div className="space-y-2 border-l-2 border-surface-container-highest pl-stack-sm ml-stack-xs group-hover:border-primary/30 transition-colors">
            <div>
              <div className="font-label-caps text-label-caps text-on-surface-variant">Monto</div>
              <div className="font-data-mono text-body-md text-on-surface">$ 33.575,88</div>
            </div>
            <div>
              <div className="font-label-caps text-label-caps text-on-surface-variant">
                Último Contacto
              </div>
              <div className="font-body-md text-body-md text-on-surface">Hace 3 días</div>
            </div>
          </div>

          <div className="mt-stack-md pt-stack-sm border-t border-surface-container-highest flex justify-end">
            <Link
              className="bg-primary hover:bg-primary-container text-on-primary font-label-caps text-label-caps px-4 py-2 rounded transition-colors flex items-center gap-2"
              href="/e/quote/P-2026-0005"
            >
              Ver Detalles{' '}
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Col 3: Tu Actividad */}
      <div className="md:col-span-4 flex flex-col gap-stack-lg">
        <div className="flex items-center justify-between border-b border-surface-container-highest pb-stack-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-stack-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">history</span>
            Tu Actividad
          </h2>
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            Recent
          </span>
        </div>

        <div className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl">
          <div className="relative pl-6 space-y-stack-md">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-surface-container-highest"></div>

            <div className="relative">
              <div className="absolute -left-6 w-3 h-3 rounded-full bg-primary ring-4 ring-surface-container z-10"></div>
              <div className="font-label-caps text-label-caps text-on-surface-variant mb-1">
                Hace 2 horas
              </div>
              <div className="bg-surface border border-surface-container-highest p-stack-sm rounded-lg">
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  Estado Actualizado
                </div>
                <div className="font-body-md text-body-md text-on-surface-variant mt-1">
                  P-2026-0003: Movido a "En Progreso"
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-6 w-3 h-3 rounded-full bg-surface-container-highest ring-4 ring-surface-container z-10 border border-surface-variant"></div>
              <div className="font-label-caps text-label-caps text-on-surface-variant mb-1">
                Ayer, 14:30
              </div>
              <div className="bg-surface border border-surface-container-highest p-stack-sm rounded-lg opacity-80">
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  Nuevo Presupuesto Creado
                </div>
                <div className="font-body-md text-body-md text-on-surface-variant mt-1">
                  P-2026-0005: Constructora del Litoral
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-6 w-3 h-3 rounded-full bg-surface-container-highest ring-4 ring-surface-container z-10 border border-surface-variant"></div>
              <div className="font-label-caps text-label-caps text-on-surface-variant mb-1">
                Ayer, 09:15
              </div>
              <div className="bg-surface border border-surface-container-highest p-stack-sm rounded-lg opacity-80">
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  Mensaje Enviado
                </div>
                <div className="font-body-md text-body-md text-on-surface-variant mt-1">
                  P-2026-0004: Solicitud de confirmación.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
