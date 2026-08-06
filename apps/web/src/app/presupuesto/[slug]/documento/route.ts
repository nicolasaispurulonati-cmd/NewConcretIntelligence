/**
 * El documento del presupuesto.
 *
 * Dos verbos, dos significados, y la diferencia importa:
 *
 * - `GET` es la vista previa. Devuelve el PDF para mirarlo y **no registra
 *   nada**. Un vendedor tiene que poder ver cómo quedó sin afirmar que lo
 *   mandó.
 * - `POST` es el envío. Genera el documento, registra que salió y lo devuelve
 *   como descarga, en una sola petición. No son dos pasos porque no puede
 *   haber un paso que alguien se saltee: el registro es subproducto de mandar.
 *
 * Que el efecto esté en el POST y no en el GET no es formalidad. Un GET que
 * escribe se dispara solo — con una precarga del navegador, con un rastreador,
 * con alguien que abre la vista previa dos veces — y cada disparo sería un
 * envío que nunca ocurrió.
 */

import { NextResponse } from 'next/server';

import { isNciError, getEntityBySlug } from '@nci/core';
import { companyFromEnv, quoteFileName, renderQuoteDocument } from '@nci/documents';
import { quoteDocumentData, recordQuoteDelivery, type DeliveryChannel } from '@nci/sales';

import { requireScope } from '@/lib/session';

const CANALES: readonly DeliveryChannel[] = ['whatsapp', 'correo', 'mano'];

function esCanal(valor: string | null): valor is DeliveryChannel {
  return valor !== null && (CANALES as readonly string[]).includes(valor);
}

/** El error, en un cuerpo que la pantalla pueda leer y mostrar. */
function comoRespuesta(error: unknown): NextResponse {
  if (isNciError(error)) {
    const detalle = error.toJSON() as { reason?: string };
    return NextResponse.json(
      { message: error.message, reason: detalle.reason ?? '' },
      { status: 400 },
    );
  }

  // La identidad de la empresa faltante llega acá: es un problema de
  // configuración del despliegue, no de lo que el vendedor cargó, y el mensaje
  // tiene que decirlo con esas palabras para que nadie busque el error en el
  // presupuesto. Ver D-018.
  console.error('[documento] no se pudo generar:', error);
  return NextResponse.json(
    {
      message: 'No se pudo generar el documento.',
      reason:
        error instanceof Error && error.message.includes('NCI_EMPRESA')
          ? error.message
          : 'Ocurrió un problema inesperado. Quedó registrado para revisarlo.',
    },
    { status: 500 },
  );
}

async function documento(slug: string) {
  const scope = await requireScope();
  const entity = await getEntityBySlug(scope, 'quote', slug);
  const data = await quoteDocumentData(scope, entity.id);

  return { scope, entityId: entity.id, data };
}

/** Vista previa. No registra nada. */
export async function GET(
  _peticion: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;
    const { data } = await documento(slug);
    const pdf = await renderQuoteDocument(data, companyFromEnv());

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // `inline` y no `attachment`: la vista previa se mira, no se baja.
        'Content-Disposition': `inline; filename="${quoteFileName(data)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return comoRespuesta(error);
  }
}

/** Enviar: genera, registra y entrega, en un solo gesto. */
export async function POST(
  peticion: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;
    const formulario = await peticion.formData();
    const via = formulario.get('via');

    if (typeof via !== 'string' || !esCanal(via)) {
      return NextResponse.json(
        {
          message: 'No se pudo enviar el presupuesto.',
          reason: `El canal indicado no es uno de los que el sistema conoce: ${CANALES.join(', ')}.`,
        },
        { status: 400 },
      );
    }

    const { scope, entityId, data } = await documento(slug);

    // El documento se arma antes de registrar el envío: si la generación
    // falla, no queda anotado un envío que no ocurrió.
    const pdf = await renderQuoteDocument(data, companyFromEnv());
    await recordQuoteDelivery(scope, entityId, via);

    const nombre = quoteFileName(data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        // Para que el navegador pueda nombrar el archivo al compartirlo por el
        // sistema operativo, que es como termina llegando a WhatsApp.
        'X-Nombre-Archivo': nombre,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return comoRespuesta(error);
  }
}
