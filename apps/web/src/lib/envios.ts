import 'server-only';

/**
 * Los envíos de un presupuesto, tal como los lee la pantalla.
 *
 * Está separado de `presupuesto.ts` a propósito. Aquél lo importa un
 * componente `'use client'`, y esta conversión necesita `deliveryChannelName`
 * de `@nci/sales` — que arrastra `@nci/db` y el driver de PostgreSQL. Con
 * ambas cosas en el mismo archivo, el navegador terminaba descargando el
 * cliente de base de datos, y el build lo dice sin ambigüedad: no puede
 * resolver `net`.
 *
 * La marca `server-only` es la que impide que vuelva a pasar: si algún día
 * alguien lo importa desde el cliente, no compila.
 */

import { formatRelativeTime } from '@nci/design';
import { deliveryChannelName, type QuoteDelivery } from '@nci/sales';

import type { EnvioVista } from './presupuesto';

export function comoEnvios(envios: readonly QuoteDelivery[]): readonly EnvioVista[] {
  return envios.map((envio) => ({
    id: envio.id,
    cuando: formatRelativeTime(envio.sentAt),
    canal: deliveryChannelName(envio.via),
  }));
}
