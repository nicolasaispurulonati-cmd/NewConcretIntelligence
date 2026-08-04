/**
 * Estado, siempre con su palabra.
 *
 * El componente no acepta un color: acepta un StatusDescriptor, y ése no se
 * puede construir sin etiqueta ni explicación. Un punto verde solo no se puede
 * renderizar aunque alguien quiera.
 */

import { STATUS_TONE_VARIABLE, type StatusDescriptor } from '@nci/design';

export function Status({ status }: { status: StatusDescriptor }): React.ReactElement {
  return (
    <span className="status">
      <span
        className="status__dot"
        style={{ ['--status-tone' as string]: STATUS_TONE_VARIABLE[status.tone] }}
        aria-hidden="true"
      />
      <span className="status__label">{status.label}</span>
      <span className="status__detail">{status.detail}</span>
    </span>
  );
}
