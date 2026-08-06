/**
 * Aritmética de dinero.
 *
 * La implementación se mudó a `@nci/domain`. Acá queda la reexportación para
 * que nada de lo que ya la importaba desde ventas tenga que cambiar.
 *
 * El motivo de la mudanza: el navegador tiene que ejecutar las mismas reglas
 * que el servidor. La pantalla de armado de presupuesto lee lo que escribe una
 * persona con `parseMoney` y muestra los importes con `formatMoney`, y
 * `@nci/domain` es el único paquete que puede viajar al navegador sin arrastrar
 * la base. Dos implementaciones que se parecen difieren el día que menos
 * conviene. Ver D-015.
 */

export {
  calculateLine,
  calculateQuote,
  formatMoney,
  parseMoney,
  roundCents,
  type Cents,
  type LineAmounts,
  type LineInput,
  type QuoteAmounts,
} from '@nci/domain';
