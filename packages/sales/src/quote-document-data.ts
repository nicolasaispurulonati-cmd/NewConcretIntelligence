/**
 * De presupuesto emitido a datos del documento.
 *
 * Es el único puente entre el dominio comercial y el papel, y existe para que
 * sea corto y esté a la vista. Lee lo que el presupuesto congeló al emitirse y
 * arma una copia plana: nada de lo que sale de acá permite volver a buscar un
 * precio, porque los renglones llevan la descripción y el importe que se
 * guardaron y nada con que identificar el artículo.
 *
 * La regla que sostiene todo esto no está escrita acá sino en la forma del
 * tipo de destino: `QuoteDocumentData.issuedAt` no admite nulo. Un borrador no
 * tiene fecha de emisión, así que no hay manera de construir la entrada. La
 * comprobación explícita de abajo existe para dar un buen error, no para ser
 * la única defensa.
 */

import { eq } from 'drizzle-orm';

import { ValidationError, getEntity, type Scope } from '@nci/core';
import { customers } from '@nci/db';
import type { QuoteDocumentData } from '@nci/documents';

import { customerOfQuote, loadQuote, type Quote } from './quotes.js';

/** Los datos del cliente que aparecen en el documento. */
async function clienteDelPresupuesto(
  scope: Scope,
  quote: Quote,
): Promise<{ name: string; taxId: string | null }> {
  const customerId = await customerOfQuote(scope, quote.entity.id);

  if (!customerId) {
    // Un presupuesto sin cliente no debería poder emitirse. Si pasó, el
    // documento no puede salir con el renglón en blanco: dice qué falta.
    throw new ValidationError({
      message: `No fue posible armar el documento de ${quote.number}.`,
      reason: 'El presupuesto no tiene un cliente relacionado.',
    });
  }

  const entidad = await getEntity(scope, customerId);

  const [comercial] = await scope.db
    .select({ taxId: customers.taxId })
    .from(customers)
    .where(eq(customers.entityId, customerId))
    .limit(1);

  return { name: entidad.displayName, taxId: comercial?.taxId ?? null };
}

/**
 * Arma los datos del documento de un presupuesto emitido.
 *
 * Falla si el presupuesto todavía es un borrador. El PDF es de lo emitido: un
 * documento de algo que se está editando es una promesa que nadie hizo.
 */
export async function quoteDocumentData(
  scope: Scope,
  quoteId: string,
): Promise<QuoteDocumentData> {
  const quote = await loadQuote(scope, quoteId);
  scope.actor.assertCanActOn('quote', 'read');

  if (quote.issuedAt === null) {
    throw new ValidationError({
      message: `${quote.number} todavía no se emitió, así que no tiene documento.`,
      reason:
        'El documento es de lo emitido: mientras el presupuesto sea un borrador, lo que dice puede cambiar.',
      actions: [{ label: 'Emitir presupuesto', requires: 'sales.quote.update' }],
    });
  }

  const cliente = await clienteDelPresupuesto(scope, quote);

  return {
    number: quote.number,
    version: quote.version,
    issuedAt: quote.issuedAt,
    validUntil: quote.validUntil,
    currency: quote.currency,

    customerName: cliente.name,
    customerTaxId: cliente.taxId,
    paymentTermsDays: quote.paymentTermsDays,

    // Cada renglón se copia campo por campo y a propósito. Pasar el objeto
    // entero arrastraría `variantId` hasta el documento, y con él la
    // posibilidad de que alguien, alguna vez, lo use para buscar el precio de
    // hoy. Ver la prueba de límites de @nci/documents.
    lines: quote.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      lineTotal: item.lineTotal,
    })),

    subtotal: quote.subtotal,
    discountTotal: quote.discountTotal,
    taxTotal: quote.taxTotal,
    total: quote.total,
    notes: quote.notes,
  };
}
