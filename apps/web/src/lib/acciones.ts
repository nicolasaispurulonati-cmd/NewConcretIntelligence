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

import { isNciError } from '@nci/core';
import { createCustomer, setPaymentTerms } from '@nci/crm';
import type { CustomerDraft } from '@nci/domain';

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
