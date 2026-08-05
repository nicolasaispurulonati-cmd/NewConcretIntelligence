/**
 * @nci/catalog — qué necesita NCI del catálogo de productos.
 *
 * El paquete tiene dos partes y una regla. El puerto (`port.ts`) dice qué se
 * necesita, en lenguaje de negocio. El adaptador dice de dónde sale. La regla
 * es que nadie fuera de acá elige adaptador: se pide `getCatalog()` y se
 * recibe el que esté activo.
 *
 * Hoy el activo es el de semilla, con datos ficticios. Cuando exista el puente
 * con Tango se cambia acá, en una función, y ninguna capa superior cambia una
 * línea. Si alguna necesitara cambiar, el puerto estaría mal definido.
 */

import { createSeedCatalog } from './seed.js';
import type { CatalogPort } from './port.js';

export type {
  CatalogAvailability,
  CatalogItem,
  CatalogPort,
  CatalogPrice,
} from './port.js';
export { LISTA_GENERAL } from './port.js';

/**
 * El catálogo activo.
 *
 * Se memoiza porque el adaptador no tiene estado por llamada y crear uno por
 * consulta sería desperdicio. Cuando el adaptador real tenga conexión, esta
 * misma memoización es la que evita abrirla de nuevo en cada pedido.
 */
let activo: CatalogPort | undefined;

export function getCatalog(): CatalogPort {
  activo ??= createSeedCatalog();
  return activo;
}
