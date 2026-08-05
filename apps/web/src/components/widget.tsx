/**
 * Widget de métrica.
 *
 * Recibe una `Metric`, que por construcción ya trae contexto. Es la traducción
 * literal del Principio 2 del PDL a un componente: no hay forma de mostrar un
 * número solo.
 *
 * Puede además mostrar de qué está compuesto. Un indicador que no se puede
 * abrir no ayuda a decidir nada: "comprometido en presupuestos abiertos" dice
 * cuánto, y la lista dice con quién y desde cuándo, que es lo que se necesita
 * para hacer algo al respecto.
 */

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

/**
 * Elige cómo se dibuja un widget.
 *
 * La decisión vive acá y no en la página por lo que costó tenerla allá: la
 * página elegía métrica **o** lista, y los widgets que traían las dos cosas
 * perdían la lista sin que nada lo notara. Con la decisión en un solo lugar,
 * una prueba puede sostenerla.
 */
export function Widget({ widget }: { widget: WidgetShape }): React.ReactElement {
  if (widget.metric) {
    return (
      <MetricWidget
        metric={widget.metric}
        {...(widget.lines ? { lines: widget.lines } : {})}
        {...(widget.truncatedCount !== undefined
          ? { truncatedCount: widget.truncatedCount }
          : {})}
      />
    );
  }

  return (
    <article className="widget">
      <p className="widget__label">{widget.title}</p>
      {widget.lines && widget.lines.length > 0 ? (
        <WidgetLines lines={widget.lines} clave={widget.id} />
      ) : (
        <p className="widget__asof">{widget.emptyMessage}</p>
      )}
      <Truncamiento cuantos={widget.truncatedCount} />
    </article>
  );
}

/** La lista que compone un widget. Una sola forma para los dos casos. */
function WidgetLines({
  lines,
  clave,
}: {
  lines: readonly WidgetLine[];
  clave: string;
}): React.ReactElement {
  return (
    <ul className="widget__context" style={{ borderTop: 'none', paddingTop: 0 }}>
      {lines.map((line, index) => (
        <li key={`${clave}-${index}`} style={{ flexDirection: 'column', gap: 0 }}>
          <span style={{ color: 'var(--nci-text)' }}>{line.primary}</span>
          <span style={{ fontSize: 'var(--nci-text-xs)' }}>{line.secondary}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * El aviso de lista truncada. El mismo mecanismo para los dos tipos de widget,
 * no uno paralelo por cada uno.
 */
function Truncamiento({ cuantos }: { cuantos: number | undefined }): React.ReactElement | null {
  if (cuantos === undefined || cuantos <= 0) return null;

  return (
    <p className="widget__asof">
      {cuantos === 1
        ? 'Hay 1 más que no entra en esta lista.'
        : `Hay ${cuantos} más que no entran en esta lista.`}
    </p>
  );
}

export function MetricWidget({
  metric,
  lines,
  truncatedCount,
}: {
  metric: Metric;
  lines?: readonly WidgetLine[];
  truncatedCount?: number;
}): React.ReactElement {
  return (
    <article className="widget">
      <p className="widget__label">{metric.label}</p>
      <p className="widget__value">{metric.value}</p>

      <ul className="widget__context">
        {metric.context.map((line) => (
          <li key={line.label}>
            <span>{line.label}</span>
            <strong>{line.value}</strong>
          </li>
        ))}
        {metric.trend && (
          <li>
            <span>Variación</span>
            <strong>{metric.trend.label}</strong>
          </li>
        )}
      </ul>

      {lines && lines.length > 0 && <WidgetLines lines={lines} clave={metric.label} />}

      {/* El mismo mecanismo que usa la lista de seguimientos, no uno paralelo. */}
      <Truncamiento cuantos={truncatedCount} />

      {/* El tiempo es visible: un indicador sin fecha no se puede confiar. */}
      <p className="widget__asof">Calculado {formatRelativeTime(metric.asOf).toLowerCase()}</p>
    </article>
  );
}
