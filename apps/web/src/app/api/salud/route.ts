/**
 * Estado de la plataforma.
 *
 * La consulta un monitoreo externo y el propio proveedor de despliegue, así que
 * es la única ruta que responde sin sesión. Eso obliga a que no diga nada que
 * no diría a un desconocido: ni el host de la base, ni la versión del servidor,
 * ni el texto del error. Un fallo de conexión mal contado es un mapa de la
 * infraestructura publicado en internet.
 *
 * Lo que sí dice: si la aplicación responde, y si llega a la base. La causa
 * queda en el log del servidor, que es donde puede leerla quien corresponde.
 */

import { NextResponse } from 'next/server';

import { getDatabase } from '@nci/db';

export const runtime = 'nodejs';

/** Nunca se cachea: una respuesta guardada afirmaría un estado que ya pasó. */
export const dynamic = 'force-dynamic';

/**
 * Un chequeo que tarda es un chequeo que falló.
 *
 * El driver espera diez segundos por una conexión nueva. Un monitoreo abandona
 * mucho antes, y lo registra como caída sin haber recibido respuesta. Tres
 * segundos alcanzan de sobra para un `select 1` y dejan margen para contestar.
 */
const ESPERA_MAXIMA_MS = 3000;

type EstadoDeLaBase = 'conectada' | 'inalcanzable';

interface Salud {
  readonly estado: 'operativa' | 'degradada';
  readonly base: EstadoDeLaBase;
  readonly latenciaMs: number;
  readonly momento: string;
}

async function consultarBase(): Promise<EstadoDeLaBase> {
  let vencimiento: NodeJS.Timeout | undefined;

  try {
    const consulta = getDatabase().execute('select 1');

    // Si vence la espera, esta promesa sigue viva y puede rechazar después, ya
    // fuera de todo `await`. Sin este manejador ese rechazo queda sin atender
    // y termina bajando el proceso entero por un chequeo de salud.
    consulta.catch(() => {});

    const limite = new Promise<never>((_, rechazar) => {
      vencimiento = setTimeout(
        () => rechazar(new Error(`La base no respondió en ${ESPERA_MAXIMA_MS} ms.`)),
        ESPERA_MAXIMA_MS,
      );
    });

    await Promise.race([consulta, limite]);
    return 'conectada';
  } catch (error) {
    // El detalle va al log del servidor y no a la respuesta.
    console.error('[salud] La base no respondió:', error);
    return 'inalcanzable';
  } finally {
    if (vencimiento) clearTimeout(vencimiento);
  }
}

export async function GET(): Promise<NextResponse<Salud>> {
  const comenzo = performance.now();
  const base = await consultarBase();

  const salud: Salud = {
    // La aplicación responde, pero sin base no puede hacer su trabajo: no es
    // una caída total y tampoco es un estado sano. Decir "operativa" acá haría
    // que el monitoreo no avise justo cuando hay que avisar.
    estado: base === 'conectada' ? 'operativa' : 'degradada',
    base,
    latenciaMs: Math.round(performance.now() - comenzo),
    momento: new Date().toISOString(),
  };

  return NextResponse.json(salud, {
    status: salud.estado === 'operativa' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
