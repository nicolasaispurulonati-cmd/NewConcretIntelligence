/**
 * El puerto de catálogo.
 *
 * Qué necesita NCI del catálogo de productos, dicho en lenguaje de negocio y
 * sin ninguna referencia a de dónde sale. Tres preguntas: qué productos hay,
 * a qué precio según la lista que le corresponda a este cliente, y cuánto hay
 * disponible.
 *
 * Tango es la fuente de verdad de productos, precios, listas y stock (D-001).
 * Todavía no se sabe dónde corre ni cómo se integra, y eso no puede bloquear
 * el camino de escritura. Por eso el puerto se define ahora y el adaptador que
 * lo cumple hoy trae datos de semilla.
 *
 * **El resto del sistema no puede distinguir un adaptador del otro.** No hay
 * en esta interfaz ningún campo que diga de dónde vino el dato, ninguna
 * bandera de "esto es de mentira", ningún método que sólo tenga sentido con
 * uno de los dos. Si alguna capa superior necesitara saberlo, el puerto
 * estaría mal definido: la marca de que los datos son ficticios vive en el
 * adaptador y en `docs/12-deuda-conocida.md`, no acá.
 */

import type { Cents } from '@nci/domain';

/**
 * Un artículo del catálogo, tal como lo necesita quien cotiza.
 *
 * `sku` es el identificador del artículo en el catálogo, sea quien sea que lo
 * administre. No es el identificador de una entidad de NCI: un artículo puede
 * existir en el catálogo sin que NCI tenga un nodo suyo.
 */
export interface CatalogItem {
  readonly sku: string;
  readonly name: string;
  /** Cómo se agrupa: máquinas, diamantes, resinas, químicos, consumibles. */
  readonly category: string;
  /** En qué se mide: 'unidad', 'litro', 'kg', 'm2', 'hora'. */
  readonly unit: string;
  readonly description: string;
}

/**
 * El precio de un artículo en una lista.
 *
 * Lleva la lista adentro a propósito. Un precio sin la lista de la que salió
 * no se puede auditar después, y el presupuesto tiene que poder explicar por
 * qué cotizó lo que cotizó.
 */
export interface CatalogPrice {
  readonly sku: string;
  readonly priceList: string;
  readonly unitPrice: Cents;
  readonly currency: string;
}

/**
 * Cuánto hay, y de cuándo es ese número.
 *
 * `asOf` no es decorativo: NCI no es dueño del stock y sólo puede mostrar lo
 * último que supo, con su fecha, dejando visible que envejece. Es el Principio
 * 10 aplicado a un dato que vive en otro sistema.
 */
export interface CatalogAvailability {
  readonly sku: string;
  readonly onHand: number;
  readonly unit: string;
  readonly asOf: Date;
}

/** La lista que se usa cuando el cliente no tiene una asignada. */
export const LISTA_GENERAL = 'general';

export interface CatalogPort {
  /**
   * Busca artículos por nombre, código o categoría.
   *
   * Devuelve vacío cuando no hay coincidencias. Nunca lanza por no encontrar:
   * no encontrar es una respuesta.
   */
  search(term: string, options?: { readonly limit?: number }): Promise<CatalogItem[]>;

  /** Un artículo por su código, o null si el catálogo no lo tiene. */
  bySku(sku: string): Promise<CatalogItem | null>;

  /**
   * El precio en la lista indicada, o en la general si no se indica.
   *
   * Devuelve null cuando el artículo no tiene precio en esa lista, que es
   * distinto de valer cero: un artículo sin precio no se puede cotizar, y
   * quien llame tiene que poder notar la diferencia.
   */
  priceFor(
    sku: string,
    options?: { readonly priceList?: string },
  ): Promise<CatalogPrice | null>;

  /** Qué hay disponible, con la fecha del dato. */
  availabilityOf(sku: string): Promise<CatalogAvailability | null>;
}
