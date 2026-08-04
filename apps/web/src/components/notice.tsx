/**
 * Un mensaje del sistema que enseña.
 *
 * Principio 18 del PDL: nunca "Error 500". Qué pasó, por qué, y qué se puede
 * hacer. La forma del componente obliga a las tres cosas.
 */

import Link from 'next/link';

export interface NoticeAction {
  readonly label: string;
  readonly href?: string;
}

export function Notice(props: {
  title: string;
  reason: React.ReactNode;
  actions?: readonly NoticeAction[];
}): React.ReactElement {
  return (
    <div className="notice" role="status">
      <h2 className="notice__title">{props.title}</h2>
      <div className="notice__reason">{props.reason}</div>
      {props.actions && props.actions.length > 0 && (
        <div className="notice__actions">
          {props.actions.map((action) =>
            action.href ? (
              <Link key={action.label} className="button" href={action.href}>
                {action.label}
              </Link>
            ) : (
              <span key={action.label} className="button" aria-disabled="true">
                {action.label}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
