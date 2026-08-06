/**
 * Widget del escritorio.
 *
 * Recibe una `Metric`, que por construcción ya trae contexto. Es la traducción
 * literal del Principio 2 del PDL a un componente: no hay forma de mostrar un
 * número solo.
 *
 * Lo que se ve sale entero de lo que trae el widget. La versión anterior
 * escribía de su cuenta "Open Budgets" junto al importe, "URGENT" en cada
 * seguimiento y "Recent" sobre la actividad — tres etiquetas en inglés, y la
 * del medio afirmando una urgencia que nadie había calculado: se la ponía a
 * todas las filas por igual, incluida la enviada esta mañana.
 */

import { formatRelativeTime, type Metric } from '@nci/design';

import { Icono, type IconoId } from '@/components/icono';

export interface WidgetLine {
  readonly primary: string;
  readonly secondary: string;
  readonly href?: string;
  readonly meta?: string;
  readonly action?: { readonly label: string; readonly href: string };
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
 * El icono de cada widget.
 *
 * Acompaña al título, nunca lo reemplaza: el Principio 8 vale también acá.
 * Un widget que no esté en esta tabla se dibuja sin icono y se entiende
 * igual, que es la prueba de que el icono no estaba informando nada.
 */
const ICONOS: Record<string, IconoId> = {
  'sales.my_quotes': 'importe',
  'crm.follow_ups': 'espera',
  'activity.feed': 'historial',
  'activity.mine': 'historial',
  'notifications.important': 'aviso',
};

export function Widget({ widget }: { widget: WidgetShape }): React.ReactElement {
  const icono = ICONOS[widget.id];
  const lines = widget.lines ?? [];

  return (
    <article className="widget">
      <header className="widget__head">
        {icono && <Icono id={icono} tamano={18} />}
        <h2 className="widget__title">{widget.title}</h2>
        {lines.length > 0 && !widget.metric && (
          <span className="widget__count">{lines.length}</span>
        )}
      </header>

      {widget.metric && <Indicador metric={widget.metric} />}

      {lines.length > 0 ? (
        <ul className="widget__lines">
          {lines.map((line, idx) => (
            <li key={`${line.primary}-${idx}`}>
              <Fila line={line} />
            </li>
          ))}
        </ul>
      ) : (
        // Nunca una tarjeta vacía: dice por qué está vacía y qué haría que
        // dejara de estarlo.
        <p className="widget__empty">{widget.emptyMessage}</p>
      )}

      <Truncamiento cuantos={widget.truncatedCount} />

      {widget.metric && (
        <p className="widget__asof">
          Calculado {formatRelativeTime(widget.metric.asOf).toLowerCase()}
        </p>
      )}
    </article>
  );
}

/**
 * El número, con lo que hace falta para interpretarlo.
 *
 * El rótulo de la métrica se muestra: es el que aclara, cuando hay más de una
 * moneda, que los importes van uno al lado del otro porque no se suman.
 */
function Indicador({ metric }: { metric: Metric }): React.ReactElement {
  return (
    <div>
      <p className="widget__label">{metric.label}</p>
      <p className="widget__value">{metric.value}</p>

      <dl className="widget__context">
        {metric.context.map((ctx) => (
          <div key={ctx.label}>
            <dt>{ctx.label}</dt>
            <dd>{ctx.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Una fila.
 *
 * Los enlaces son `<a>` y no `next/link` a propósito. Este módulo se prueba
 * bajo la condición `react-server` —la necesita `workspace.ts`, que está
 * marcado `server-only`— y ahí `next/link` no se puede ni importar: arrastra
 * el contexto del router, que llama a `createContext`, que en esa build de
 * React no existe. Importarlo rompería la prueba entera en el import, antes
 * de ejecutar una sola aserción.
 *
 * Se pierde la transición sin recarga. A cambio, el widget se puede seguir
 * verificando, que es lo que garantiza que lo que se calcula llegue a la
 * pantalla — el defecto que esa prueba existe para impedir.
 */
function Fila({ line }: { line: WidgetLine }): React.ReactElement {
  const cuerpo = (
    <>
      <span className="widget__line-primary">{line.primary}</span>
      <span className="widget__line-secondary">
        {line.secondary}
        {line.meta && ` · ${line.meta}`}
      </span>
    </>
  );

  // Con acción propia la fila no es un enlace: dos destinos dentro del mismo
  // rectángulo es la forma segura de que se toque el que no era.
  if (line.action) {
    return (
      <div className="widget__line">
        {cuerpo}
        <a className="button" href={line.action.href}>
          {line.action.label}
          <Icono id="flecha" tamano={14} />
        </a>
      </div>
    );
  }

  if (line.href) {
    return (
      <a className="widget__line" href={line.href}>
        {cuerpo}
      </a>
    );
  }

  return <div className="widget__line">{cuerpo}</div>;
}

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
