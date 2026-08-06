'use client';

/**
 * Enviar el presupuesto al cliente.
 *
 * Acá está la decisión de diseño de la sección. Si el sistema pidiera "marcá
 * que lo enviaste", nadie lo marcaría después de la segunda semana y la fecha
 * de envío sería un campo decorativo. Así que no hay un botón para registrar:
 * hay uno para enviar, y registrar es lo que ese botón hace de paso.
 *
 * Un solo gesto hace tres cosas: genera el documento, se lo entrega al vendedor
 * —compartiéndolo por el sistema operativo si el dispositivo puede, bajándolo
 * si no— y anota que salió, por qué canal y cuándo.
 *
 * La vista previa es otra cosa y se ve que es otra cosa: un enlace al costado,
 * que abre el PDF y no registra nada. Mirar cómo quedó no puede ser lo mismo
 * que afirmar que lo mandaste.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { EnvioVista } from '@/lib/presupuesto';

const CANALES = [
  // WhatsApp primero y por defecto porque es el caso normal. Un clic de más
  // por presupuesto son varios cientos al año.
  { valor: 'whatsapp', etiqueta: 'WhatsApp' },
  { valor: 'correo', etiqueta: 'Correo' },
  { valor: 'mano', etiqueta: 'En mano' },
] as const;

export function EnviarAlCliente({
  slug,
  numero,
  envios,
}: {
  slug: string;
  numero: string;
  envios: readonly EnvioVista[];
}): React.ReactElement {
  const router = useRouter();
  const [via, setVia] = useState<string>('whatsapp');
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  const yaSalio = envios.length > 0;

  async function enviar(): Promise<void> {
    setEnviando(true);
    setFalla(null);

    try {
      const respuesta = await fetch(`/presupuesto/${slug}/documento`, {
        method: 'POST',
        body: new URLSearchParams({ via }),
      });

      if (!respuesta.ok) {
        const detalle = (await respuesta.json()) as { message: string; reason: string };
        setFalla(`${detalle.message} ${detalle.reason}`.trim());
        return;
      }

      const nombre = respuesta.headers.get('X-Nombre-Archivo') ?? `${numero}.pdf`;
      const archivo = new File([await respuesta.blob()], nombre, { type: 'application/pdf' });

      // En el teléfono, que es donde el vendedor trabaja, esto abre el menú de
      // compartir del sistema y WhatsApp aparece ahí. En la computadora no
      // existe, y entonces se baja.
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: numero });
      } else {
        descargar(archivo, nombre);
      }
    } catch (error) {
      // Cancelar el menú de compartir llega acá como una excepción, y no es un
      // error: el envío ya quedó registrado y el archivo ya se generó.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFalla('No se pudo entregar el archivo. El envío quedó registrado igual.');
      }
    } finally {
      setEnviando(false);
      // El escritorio tiene que reflejarlo: el presupuesto deja de estar "sin
      // enviar" y pasa a esperar respuesta.
      router.refresh();
    }
  }

  return (
    <section className="enviar">
      <div className="enviar__accion">
        <label className="alta__campo enviar__canal">
          <span className="font-label-caps">Por dónde</span>
          <select
            value={via}
            onChange={(evento) => setVia(evento.target.value)}
          >
            {CANALES.map((canal) => (
              <option key={canal.valor} value={canal.valor}>
                {canal.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <button
          className="button button--primary"
          type="button"
          disabled={enviando}
          onClick={() => void enviar()}
        >
          {enviando ? 'Preparando…' : yaSalio ? 'Enviar de nuevo' : 'Enviar al cliente'}
        </button>
      </div>

      <p className="alta__ayuda">
        Se genera el documento, se te entrega para mandarlo y queda registrado que salió. Lo mandás
        vos desde tu teléfono, como hasta ahora.{' '}
        <a href={`/presupuesto/${slug}/documento`} target="_blank" rel="noreferrer">
          Ver cómo quedó
        </a>{' '}
        sin registrar nada.
      </p>

      {falla && <p className="alta__problema">{falla}</p>}

      <HistorialDeEnvios envios={envios} />
    </section>
  );
}

function HistorialDeEnvios({ envios }: { envios: readonly EnvioVista[] }): React.ReactElement {
  if (envios.length === 0) {
    return <p className="alta__ayuda">Todavía no salió.</p>;
  }

  return (
    <div className="enviar__historial">
      <p className="font-label-caps">
        {envios.length === 1 ? 'Salió una vez' : `Salió ${envios.length} veces`}
      </p>
      <ul>
        {envios.map((envio) => (
          <li key={envio.id}>
            {envio.cuando} · {envio.canal}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Baja el archivo cuando el dispositivo no sabe compartir. */
function descargar(archivo: File, nombre: string): void {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
