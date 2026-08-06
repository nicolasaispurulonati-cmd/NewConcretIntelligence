/**
 * Cada vez que el presupuesto salió hacia el cliente.
 *
 * La decisión de diseño de esta sección está acá: **el registro es un
 * subproducto de mandar, no una tarea aparte.** Si el sistema pidiera "marcá
 * que lo enviaste", nadie lo marcaría después de la segunda semana y `sentAt`
 * sería un campo decorativo. Por eso la pantalla no tiene un botón para
 * registrar: tiene uno para enviar, y registrar es lo que ese botón hace de
 * paso, junto con generar el documento y entregárselo al vendedor.
 *
 * Lo que se afirma es que el documento se generó y salió hacia el cliente por
 * ese canal. El transporte es manual, así que no hay acuse de recibo y el
 * sistema no dice que el cliente lo haya abierto. Decir menos de lo que se
 * sabe es preferible a decir más.
 */

import { desc, eq } from 'drizzle-orm';

import { ValidationError, recordActivity, type Scope } from '@nci/core';
import { quoteDeliveries } from '@nci/db';

import { loadQuote, sendQuote, type Quote } from './quotes.js';

/** Por dónde salió. Los valores están restringidos también en la base. */
export type DeliveryChannel = 'whatsapp' | 'correo' | 'mano';

export interface QuoteDelivery {
  readonly id: string;
  readonly sentAt: Date;
  readonly via: DeliveryChannel;
  readonly sentBy: string | null;
}

/** Cómo se nombra cada canal cuando se lo cuenta. */
const NOMBRE: Record<DeliveryChannel, string> = {
  whatsapp: 'WhatsApp',
  correo: 'correo',
  mano: 'en mano',
};

/**
 * Registra que el presupuesto salió, y lo mueve de estado si es la primera vez.
 *
 * La transición `emitido → enviado` no se reescribe acá: se delega en
 * `sendQuote`, que es donde vive desde D-016. Esta función agrega el hecho —
 * qué día, por dónde, quién— y deja que el estado lo maneje quien ya lo
 * manejaba.
 *
 * Reenviar no cambia el estado ni pisa el primer envío. Un presupuesto que ya
 * está enviado sigue enviado; lo que cambia es que ahora hay dos hechos.
 */
export async function recordQuoteDelivery(
  scope: Scope,
  quoteId: string,
  via: DeliveryChannel,
): Promise<Quote> {
  scope.actor.assertCanActOn('quote', 'update');
  const quote = await loadQuote(scope, quoteId);

  if (quote.issuedAt === null) {
    throw new ValidationError({
      message: `${quote.number} todavía no se emitió, así que no hay nada que enviar.`,
      reason:
        'El documento es de lo emitido: mientras el presupuesto sea un borrador, lo que dice puede cambiar.',
      actions: [{ label: 'Emitir presupuesto', requires: 'sales.quote.update' }],
    });
  }

  // El primer envío es el que mueve el estado. `sendQuote` verifica la
  // transición y escribe `sent_at` y `sent_via`, que a partir de acá
  // significan "el primer envío" y no se vuelven a tocar.
  const primero = quote.status === 'emitido';
  if (primero) await sendQuote(scope, quoteId, via);

  await scope.db.insert(quoteDeliveries).values({
    quoteId,
    via,
    sentBy: scope.actor.id,
  });

  if (!primero) {
    // `sendQuote` ya registró la actividad del primero. Ésta es la del
    // reenvío, que es un hecho distinto y se cuenta distinto.
    const cuantos = (await quoteDeliveriesOf(scope, quoteId)).length;
    await recordActivity(scope, {
      entityId: quoteId,
      verb: 'reenvió',
      summary: `${scope.actor.fullName} reenvió ${quote.number} por ${NOMBRE[via]}. Van ${cuantos} envíos.`,
    });
  }

  return loadQuote(scope, quoteId);
}

/** Los envíos de un presupuesto, del más reciente al más viejo. */
export async function quoteDeliveriesOf(
  scope: Scope,
  quoteId: string,
): Promise<readonly QuoteDelivery[]> {
  scope.actor.assertCanActOn('quote', 'read');

  const filas = await scope.db
    .select()
    .from(quoteDeliveries)
    .where(eq(quoteDeliveries.quoteId, quoteId))
    .orderBy(desc(quoteDeliveries.sentAt));

  return filas.map((fila) => ({
    id: fila.id,
    sentAt: fila.sentAt,
    via: fila.via as DeliveryChannel,
    sentBy: fila.sentBy,
  }));
}

/** Cómo se nombra un canal en la interfaz. */
export function deliveryChannelName(via: DeliveryChannel): string {
  return NOMBRE[via];
}
