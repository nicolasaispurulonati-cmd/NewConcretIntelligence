/**
 * Widget de métrica.
 *
 * Recibe una `Metric`, que por construcción ya trae contexto. Es la traducción
 * literal del Principio 2 del PDL a un componente: no hay forma de mostrar un
 * número solo.
 */

import { formatRelativeTime, type Metric } from '@nci/design';

export function MetricWidget({ metric }: { metric: Metric }): React.ReactElement {
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

      {/* El tiempo es visible: un indicador sin fecha no se puede confiar. */}
      <p className="widget__asof">Calculado {formatRelativeTime(metric.asOf).toLowerCase()}</p>
    </article>
  );
}
