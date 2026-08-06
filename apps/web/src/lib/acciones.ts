'use server';

/**
 * Las escrituras de la aplicación.
 *
 * Todas pasan por un `Scope`, como cualquier otra cosa que toque datos: no hay
 * una vía de escritura que se saltee la autorización, igual que no hay una de
 * lectura.
 *
 * Devuelven un resultado en lugar de lanzar. Un error de validación no es una
 * excepción del sistema: es información para quien está cargando, y tiene que
 * llegar a la pantalla con su motivo y su acción, no como una pantalla rota.
 */

import { revalidatePath } from 'next/cache';

import { getCatalog, LISTA_GENERAL } from '@nci/catalog';
import { isNciError } from '@nci/core';
import { createCustomer, setPaymentTerms } from '@nci/crm';
import type { CustomerDraft } from '@nci/domain';
import { addQuoteItem, createQuote, issueQuote, loadQuote, removeQuoteItem } from '@nci/sales';

import { comoVista, type PresupuestoVista } from '@/lib/presupuesto';
import { requireScope } from '@/lib/session';

/** Lo que le vuelve al formulario: o salió bien, o hay algo que explicar. */
export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | {
      readonly ok: false;
      readonly message: string;
      readonly reason: string;
      readonly field?: string;
    };

function comoFalla(error: unknown): Resultado<never> {
  if (isNciError(error)) {
    const detalle = error.toJSON() as { reason?: string; field?: string };
    return {
      ok: false,
      message: error.message,
      reason: detalle.reason ?? '',
      ...(detalle.field ? { field: detalle.field } : {}),
    };
  }

  // Un error inesperado no se disfraza de validación: se registra y se dice
  // que fue inesperado, para que nadie busque el problema en lo que escribió.
  console.error('[acciones] error inesperado:', error);
  return {
    ok: false,
    message: 'No se pudo completar la operación.',
    reason: 'Ocurrió un problema inesperado. Quedó registrado para revisarlo.',
  };
}

export interface ClienteCreado {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export async function crearCliente(draft: CustomerDraft): Promise<Resultado<ClienteCreado>> {
  try {
    const scope = await requireScope();
    const cliente = await createCustomer(scope, draft);

    revalidatePath('/');

    return {
      ok: true,
      valor: {
        id: cliente.entity.id,
        slug: cliente.entity.slug,
        displayName: cliente.entity.displayName,
      },
    };
  } catch (error) {
    return comoFalla(error);
  }
}

export async function definirCondicionDePago(
  customerId: string,
  dias: number,
): Promise<Resultado<{ readonly paymentTermsDays: number }>> {
  try {
    const scope = await requireScope();
    const cliente = await setPaymentTerms(scope, customerId, dias);

    return { ok: true, valor: { paymentTermsDays: cliente.paymentTermsDays ?? dias } };
  } catch (error) {
    return comoFalla(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Presupuesto
// ─────────────────────────────────────────────────────────────────────────

/**
 * Crea el borrador apenas se elige el cliente.
 *
 * El presupuesto existe en la base desde el primer dato: si el navegador se
 * cierra, lo cargado no se perdió. Un formulario que sólo guarda al final es
 * el que hace que se prefiera el cuaderno, donde lo escrito queda escrito.
 */
export async function iniciarPresupuesto(
  customerId: string,
): Promise<Resultado<PresupuestoVista>> {
  try {
    const scope = await requireScope();
    const quote = await createQuote(scope, { customerId });

    revalidatePath('/');

    return { ok: true, valor: comoVista(quote) };
  } catch (error) {
    return comoFalla(error);
  }
}

export interface RenglonNuevo {
  readonly description: string;
  readonly quantity: number;
  readonly unit?: string;
  readonly unitPrice: number;
  readonly discountPercent?: number;
  /** La moneda del precio de origen, para que no entre una que no corresponde. */
  readonly priceCurrency?: string;
}

export async function agregarRenglon(
  quoteId: string,
  renglon: RenglonNuevo,
): Promise<Resultado<PresupuestoVista>> {
  try {
    const scope = await requireScope();
    const quote = await addQuoteItem(
      scope,
      quoteId,
      {
        description: renglon.description,
        quantity: renglon.quantity,
        ...(renglon.unit ? { unit: renglon.unit } : {}),
        unitPrice: renglon.unitPrice,
        ...(renglon.discountPercent ? { discountPercent: renglon.discountPercent } : {}),
      },
      renglon.priceCurrency ? { priceCurrency: renglon.priceCurrency } : {},
    );

    revalidatePath('/');

    return { ok: true, valor: comoVista(quote) };
  } catch (error) {
    return comoFalla(error);
  }
}

export async function quitarRenglon(
  quoteId: string,
  itemId: string,
): Promise<Resultado<PresupuestoVista>> {
  try {
    const scope = await requireScope();
    const quote = await removeQuoteItem(scope, quoteId, itemId);

    revalidatePath('/');

    return { ok: true, valor: comoVista(quote) };
  } catch (error) {
    return comoFalla(error);
  }
}

/** Emite el presupuesto. Es acá donde se cobra la condición de pago (D-013). */
export async function emitirPresupuesto(quoteId: string): Promise<Resultado<PresupuestoVista>> {
  try {
    const scope = await requireScope();
    const quote = await issueQuote(scope, quoteId);

    revalidatePath('/');

    return { ok: true, valor: comoVista(quote) };
  } catch (error) {
    return comoFalla(error);
  }
}

/** Vuelve a leer el presupuesto, para refrescar la pantalla después de emitir. */
export async function releerPresupuesto(quoteId: string): Promise<Resultado<PresupuestoVista>> {
  try {
    const scope = await requireScope();
    return { ok: true, valor: comoVista(await loadQuote(scope, quoteId)) };
  } catch (error) {
    return comoFalla(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────

export interface ArticuloVista {
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly unit: string;
  /** Nulo si el artículo no tiene precio en la lista consultada. */
  readonly unitPrice: number | null;
  readonly currency: string | null;
}

/**
 * Busca artículos y les adjunta el precio de la lista general.
 *
 * Pasa por el puerto de catálogo (D-012), así que esta pantalla no sabe ni
 * puede saber si los datos salen de la semilla o de Tango.
 *
 * El precio puede volver nulo. No se rellena con el de otra lista: un precio
 * que parece de esta lista y es de otra es peor que no tener precio, porque
 * nadie lo revisa.
 */
export async function buscarArticulos(termino: string): Promise<Resultado<ArticuloVista[]>> {
  try {
    const scope = await requireScope();
    scope.actor.assertCanActOn('quote', 'create');

    const catalogo = getCatalog();
    const encontrados = await catalogo.search(termino, { limit: 8 });

    const conPrecio = await Promise.all(
      encontrados.map(async (articulo) => {
        const precio = await catalogo.priceFor(articulo.sku, { priceList: LISTA_GENERAL });
        return {
          sku: articulo.sku,
          name: articulo.name,
          category: articulo.category,
          unit: articulo.unit,
          unitPrice: precio?.unitPrice ?? null,
          currency: precio?.currency ?? null,
        };
      }),
    );

    return { ok: true, valor: conPrecio };
  } catch (error) {
    return comoFalla(error);
  }
}
