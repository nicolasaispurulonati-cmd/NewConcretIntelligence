/**
 * El presupuesto tal como lo necesita la pantalla.
 *
 * Es una proyección y no el objeto del dominio. Lo que cruza al navegador
 * tiene que ser serializable, y sobre todo tiene que ser sólo lo que la
 * pantalla usa: mandar la entidad entera expone campos que hoy nadie mira y
 * que mañana alguien empieza a mirar, y ahí la frontera ya se movió sin que
 * nadie lo decidiera.
 *
 * Vive fuera de `acciones.ts` porque un módulo marcado `'use server'` sólo
 * puede exportar funciones asíncronas, y esto es una conversión pura.
 */

import type { Quote } from '@nci/sales';

export interface RenglonVista {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPrice: number;
  readonly discountPercent: number;
  readonly taxRate: number;
  readonly lineTotal: number;
}

export interface PresupuestoVista {
  readonly id: string;
  readonly slug: string;
  readonly number: string;
  readonly version: number;
  readonly status: string;
  readonly currency: string;
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly paymentTermsDays: number | null;
  readonly items: readonly RenglonVista[];
}

export function comoVista(quote: Quote): PresupuestoVista {
  return {
    id: quote.entity.id,
    slug: quote.entity.slug,
    number: quote.number,
    version: quote.version,
    status: quote.status,
    currency: quote.currency,
    subtotal: quote.subtotal,
    discountTotal: quote.discountTotal,
    taxTotal: quote.taxTotal,
    total: quote.total,
    paymentTermsDays: quote.paymentTermsDays,
    items: quote.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxRate: item.taxRate,
      lineTotal: item.lineTotal,
    })),
  };
}

/** Si el presupuesto todavía se puede editar. Un solo lugar lo decide. */
export function esEditable(vista: PresupuestoVista): boolean {
  return vista.status === 'borrador';
}

/**
 * Un envío, tal como se lee en la pantalla.
 *
 * Sólo el tipo vive acá. La conversión está en `envios.ts`, que es de
 * servidor: armarla necesita `deliveryChannelName`, y ése viene de
 * `@nci/sales`, que a su vez arrastra `@nci/db` y el driver de PostgreSQL.
 * Este módulo lo importa un componente `'use client'`, así que una sola
 * importación de valor desde el dominio comercial metería el cliente de base
 * de datos entero en el paquete que baja el navegador.
 *
 * La fecha se convierte del lado del servidor por otra razón: `sentAt` es un
 * `Date`, y un `Date` que cruza al navegador se reinterpreta con la zona
 * horaria de quien mira. Lo que cruza es la frase ya escrita.
 */
export interface EnvioVista {
  readonly id: string;
  readonly cuando: string;
  readonly canal: string;
}
