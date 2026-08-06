/**
 * Widget de métrica.
 *
 * Recibe una `Metric`, que por construcción ya trae contexto. Es la traducción
 * literal del Principio 2 del PDL a un componente: no hay forma de mostrar un
 * número solo.
 */

import React from 'react';
import { formatRelativeTime, type Metric } from '@nci/design';

export interface WidgetLine {
  readonly primary: string;
  readonly secondary: string;
}

/** Lo mínimo que este módulo necesita saber de un widget para dibujarlo. */
export interface WidgetShape {
  readonly id: string;
  readonly title: string;
  readonly metric?: Metric;
  readonly lines?: readonly WidgetLine[];
  readonly truncatedCount?: number;
  readonly emptyMessage?: string;
}

export function Widget({ widget }: { widget: WidgetShape }): React.ReactElement {
  if (widget.metric) {
    return (
      <MetricWidget
        metric={widget.metric}
        {...(widget.lines !== undefined ? { lines: widget.lines } : {})}
        title={widget.title}
        {...(widget.truncatedCount !== undefined ? { truncatedCount: widget.truncatedCount } : {})}
      />
    );
  }

  if (widget.id === 'crm.follow_ups') {
    return <FollowUpsWidget widget={widget} />;
  }

  if (widget.id.startsWith('activity.')) {
    return <ActivityWidget widget={widget} />;
  }

  return <GenericWidget widget={widget} />;
}

export function MetricWidget({
  metric,
  lines,
  title = 'Comprometido',
  truncatedCount,
}: {
  metric: Metric;
  lines?: readonly WidgetLine[];
  title?: string;
  truncatedCount?: number;
}): React.ReactElement {
  return (
    <div className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors duration-700"></div>

      <div className="flex items-center justify-between mb-stack-lg relative z-10">
        <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-stack-sm">
          <span className="material-symbols-outlined text-primary text-[20px]">
            account_balance_wallet
          </span>
          {title}
        </h2>
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest border border-surface-container-highest px-2 py-1 rounded bg-surface">
          Open Budgets
        </span>
      </div>

      <div className="relative z-10">
        <div className="widget__label hidden">{metric.label}</div>
        <div className="font-display-lg text-display-lg text-on-surface mb-stack-sm widget__value">
          {metric.value}
        </div>

        {metric.context.length > 0 && (
          <div className="flex items-center gap-stack-md border-b border-surface-container-highest pb-stack-md">
            {metric.context.map((ctx, idx) => (
              <div key={ctx.label} className="flex items-center gap-stack-md">
                {idx > 0 && <div className="w-px h-8 bg-surface-container-highest"></div>}
                <div className="flex flex-col">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    {ctx.label}
                  </span>
                  <span className="font-headline-md text-headline-md text-on-surface">
                    {ctx.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lines && lines.length > 0 && (
        <div className="mt-stack-md space-y-stack-sm relative z-10">
          {lines.map((line, idx) => (
            <div
              key={`${line.primary}-${idx}`}
              className="flex justify-between items-center bg-surface p-stack-sm rounded-lg border border-surface-container-highest hover:border-primary-container/30 transition-colors cursor-pointer"
            >
              <div>
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  {line.primary}
                </div>
                <div className="font-label-caps text-label-caps text-on-surface-variant">
                  {line.secondary}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Truncamiento cuantos={truncatedCount} />

      <div className="mt-stack-sm font-label-caps text-[10px] text-on-surface-variant">
        Calculado {formatRelativeTime(metric.asOf).toLowerCase()}
      </div>
    </div>
  );
}

function FollowUpsWidget({ widget }: { widget: WidgetShape }): React.ReactElement {
  const hasLines = widget.lines && widget.lines.length > 0;

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex items-center justify-between border-b border-surface-container-highest pb-stack-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-stack-sm">
          <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
          {widget.title}
        </h2>
        <span className="w-6 h-6 rounded bg-surface-container border border-surface-container-highest flex items-center justify-center font-data-mono text-label-caps text-on-surface">
          {widget.lines ? widget.lines.length : 0}
        </span>
      </div>

      {hasLines ? (
        widget.lines!.map((line, idx) => (
          <div
            key={`${line.primary}-${idx}`}
            className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl hover:border-primary/50 transition-colors group cursor-pointer relative"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none"></div>
            <div className="flex justify-between items-start mb-stack-md">
              <div>
                <div className="font-body-md text-body-md text-on-surface font-semibold">
                  {line.primary}
                </div>
              </div>
              <div className="bg-surface border border-surface-container-highest px-2 py-1 rounded text-primary font-label-caps text-label-caps">
                URGENT
              </div>
            </div>
            <div className="space-y-2 border-l-2 border-surface-container-highest pl-stack-sm ml-stack-xs group-hover:border-primary/30 transition-colors">
              <div>
                <div className="font-label-caps text-label-caps text-on-surface-variant">Detalles</div>
                <div className="font-body-md text-body-md text-on-surface">{line.secondary}</div>
              </div>
            </div>
            <div className="mt-stack-md pt-stack-sm border-t border-surface-container-highest flex justify-end">
              <button
                type="button"
                className="bg-primary hover:bg-primary-container text-on-primary font-label-caps text-label-caps px-4 py-2 rounded transition-colors flex items-center gap-2"
              >
                Ver Detalles{' '}
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl">
          <p className="font-body-md text-on-surface-variant widget__asof">{widget.emptyMessage}</p>
        </div>
      )}

      <Truncamiento cuantos={widget.truncatedCount} />
    </div>
  );
}

function ActivityWidget({ widget }: { widget: WidgetShape }): React.ReactElement {
  const hasLines = widget.lines && widget.lines.length > 0;

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex items-center justify-between border-b border-surface-container-highest pb-stack-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-stack-sm">
          <span className="material-symbols-outlined text-primary text-[20px]">history</span>
          {widget.title}
        </h2>
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          Recent
        </span>
      </div>

      <div className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl">
        {hasLines ? (
          <div className="relative pl-6 space-y-stack-md">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-surface-container-highest"></div>
            {widget.lines!.map((line, idx) => (
              <div key={`${line.primary}-${idx}`} className="relative">
                <div
                  className={`absolute -left-6 w-3 h-3 rounded-full ${
                    idx === 0
                      ? 'bg-primary ring-4 ring-surface-container z-10'
                      : 'bg-surface-container-highest ring-4 ring-surface-container z-10 border border-surface-variant'
                  }`}
                ></div>
                <div className="font-label-caps text-label-caps text-on-surface-variant mb-1">
                  {line.secondary}
                </div>
                <div
                  className={`bg-surface border border-surface-container-highest p-stack-sm rounded-lg ${
                    idx > 0 ? 'opacity-80' : ''
                  }`}
                >
                  <div className="font-body-md text-body-md text-on-surface font-semibold">
                    {line.primary}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="font-body-md text-on-surface-variant widget__asof">{widget.emptyMessage}</p>
        )}
      </div>

      <Truncamiento cuantos={widget.truncatedCount} />
    </div>
  );
}

function GenericWidget({ widget }: { widget: WidgetShape }): React.ReactElement {
  const hasLines = widget.lines && widget.lines.length > 0;

  return (
    <article className="bg-surface-container border border-surface-container-highest p-stack-md rounded-xl">
      <h2 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
        {widget.title}
      </h2>
      {hasLines ? (
        <ul className="space-y-stack-xs mt-stack-sm">
          {widget.lines!.map((line, idx) => (
            <li
              key={`${line.primary}-${idx}`}
              className="bg-surface p-stack-sm rounded-lg border border-surface-container-highest"
            >
              <div className="font-body-md text-on-surface font-semibold">{line.primary}</div>
              <div className="font-label-caps text-on-surface-variant">{line.secondary}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-body-md text-on-surface-variant widget__asof">{widget.emptyMessage}</p>
      )}
      <Truncamiento cuantos={widget.truncatedCount} />
    </article>
  );
}

function Truncamiento({ cuantos }: { cuantos: number | undefined }): React.ReactElement | null {
  if (cuantos === undefined || cuantos <= 0) return null;

  return (
    <p className="font-label-caps text-label-caps text-on-surface-variant mt-stack-sm widget__asof">
      {cuantos === 1
        ? 'Hay 1 más que no entra en esta lista.'
        : `Hay ${cuantos} más que no entran en esta lista.`}
    </p>
  );
}
