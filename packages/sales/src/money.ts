/**
 * Aritmética de dinero.
 *
 * Todo importe es un entero en la unidad menor de su moneda — centavos para
 * pesos y para dólares. Nunca un decimal: 0.1 + 0.2 no da 0.3 en punto
 * flotante, y en un presupuesto eso termina siendo una diferencia de centavos
 * que nadie sabe explicar y que el cliente sí ve.
 *
 * Las funciones son puras y sin dependencias, para poder probarlas contra los
 * casos que importan: el redondeo, el descuento y el IVA.
 */

/** Un importe en centavos. El alias existe para que el tipo se lea. */
export type Cents = number;

/**
 * Redondeo comercial: a la unidad más cercana, y los medios hacia afuera.
 *
 * `Math.round` desempata siempre hacia arriba, lo que sesga los importes
 * negativos (una nota de crédito redondearía distinto que la factura que
 * corrige). Redondear hacia afuera mantiene la simetría.
 */
export function roundCents(value: number): Cents {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export interface LineInput {
  /** Puede tener decimales: 2,5 litros. */
  readonly quantity: number;
  readonly unitPrice: Cents;
  /** 0 a 100. */
  readonly discountPercent: number;
  /** 0 a 100. En Argentina normalmente 21, a veces 10,5. */
  readonly taxRate: number;
}

export interface LineAmounts {
  /** Cantidad por precio, antes de descuento. */
  readonly gross: Cents;
  readonly discount: Cents;
  /** Neto del renglón, con descuento y sin IVA. Es lo que se guarda. */
  readonly net: Cents;
  readonly tax: Cents;
  readonly total: Cents;
}

/**
 * Calcula un renglón.
 *
 * El redondeo se aplica una sola vez por concepto y siempre sobre el bruto,
 * no en cascada: redondear el descuento sobre un bruto ya redondeado
 * arrastra el error hacia el total.
 */
export function calculateLine(line: LineInput): LineAmounts {
  const gross = roundCents(line.quantity * line.unitPrice);
  const discount = roundCents(gross * (line.discountPercent / 100));
  const net = gross - discount;
  const tax = roundCents(net * (line.taxRate / 100));

  return { gross, discount, net, tax, total: net + tax };
}

export interface QuoteAmounts {
  readonly subtotal: Cents;
  readonly discountTotal: Cents;
  readonly taxTotal: Cents;
  readonly total: Cents;
}

/**
 * Suma los renglones.
 *
 * Se suman los importes ya redondeados de cada renglón, no los valores
 * teóricos. Así el total coincide exactamente con la suma de lo que el cliente
 * ve impreso, que es la única definición de "correcto" que le importa.
 */
export function calculateQuote(lines: readonly LineInput[]): QuoteAmounts {
  return lines.reduce<QuoteAmounts>(
    (acc, line) => {
      const amounts = calculateLine(line);
      return {
        subtotal: acc.subtotal + amounts.gross,
        discountTotal: acc.discountTotal + amounts.discount,
        taxTotal: acc.taxTotal + amounts.tax,
        total: acc.total + amounts.total,
      };
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 },
  );
}

/**
 * Formatea para mostrar. `125000` → `$ 1.250,00`.
 *
 * El PDL pide que un número nunca aparezca sin contexto; la moneda es la
 * parte del contexto que no puede faltar nunca.
 */
export function formatMoney(cents: Cents, currency = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Convierte lo que escribe una persona — "1.250,50" — a centavos.
 *
 * Devuelve null ante cualquier cosa que no sea un importe. Es importante que
 * no devuelva cero: `Number('')` da 0, y un precio mal tipeado se convertiría
 * en un renglón gratuito sin que nadie lo note.
 */
export function parseMoney(input: string): Cents | null {
  const cleaned = input.replace(/[^\d.,-]/g, '');
  if (cleaned.length === 0) return null;

  // Punto como separador de miles y coma como decimal, que es como se escribe
  // en Argentina. El punto se descarta; la coma pasa a ser el decimal.
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');

  // Rechaza restos como "-", "." o "1-2" que Number interpretaría a su manera.
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? roundCents(value * 100) : null;
}
