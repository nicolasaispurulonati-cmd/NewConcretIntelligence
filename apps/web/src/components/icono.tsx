/**
 * Los iconos de la plataforma.
 *
 * Van en el HTML y no en una fuente externa. La versión anterior traía
 * Material Symbols desde Google: mientras la fuente no llega —o no llega
 * nunca, que es el caso de una planta sin salida a internet— el navegador
 * muestra el texto de la ligadura, y en la pantalla se leía literalmente
 * "account_balance_wallet" al lado del importe comprometido.
 *
 * Un icono nunca aparece solo. Siempre acompaña a una palabra, así que acá
 * son `aria-hidden`: quien usa un lector de pantalla ya tiene la etiqueta, y
 * escuchar el nombre del dibujo además del texto sólo estorba.
 */

export type IconoId =
  | 'inicio'
  | 'buscar'
  | 'actividad'
  | 'espacios'
  | 'administracion'
  | 'importe'
  | 'espera'
  | 'historial'
  | 'aviso'
  | 'flecha';

const TRAZOS: Record<IconoId, React.ReactElement> = {
  inicio: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  actividad: (
    <>
      <path d="M3 12h4l2.5-6 4 13L16 12h5" />
    </>
  ),
  espacios: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="m7 7.5 3 3M17 7.5l-3 3M7 16.5l3-3M17 16.5l-3-3" />
    </>
  ),
  administracion: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </>
  ),
  importe: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" />
      <path d="M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a1 1 0 0 0-1-1H4" />
      <circle cx="16.5" cy="13.5" r="1.2" />
    </>
  ),
  espera: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  historial: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.2l2.8 1.8" />
    </>
  ),
  aviso: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </>
  ),
  flecha: (
    <>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5-5.5 5.5" />
    </>
  ),
};

export function Icono({
  id,
  tamano = 18,
}: {
  id: IconoId;
  tamano?: number;
}): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {TRAZOS[id]}
    </svg>
  );
}
