/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DATOS FICTICIOS. NINGÚN PRODUCTO, PRECIO NI STOCK DE ESTE ARCHIVO   │
 * │  ES REAL. Se reemplazan enteros al integrar con Tango, que es la     │
 * │  fuente de verdad de productos, precios, listas y stock (D-001).     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Existe para que el camino de escritura —cotizar— no quede bloqueado
 * esperando una integración cuya topología todavía no se conoce.
 *
 * Los artículos son representativos de las cinco líneas del negocio:
 * máquinas, diamantes, resinas, químicos y consumibles. Los precios son
 * plausibles en su orden de magnitud y nada más que eso; no salieron de
 * ninguna lista de NewConcret.
 *
 * Hay dos listas de precios a propósito. Probar el mecanismo con una sola no
 * prueba nada: la lista alternativa es lo único que distingue "trae el precio"
 * de "trae el precio que le corresponde a este cliente".
 *
 * Registrado como deuda en `docs/12-deuda-conocida.md`.
 */

import {
  LISTA_GENERAL,
  type CatalogAvailability,
  type CatalogItem,
  type CatalogPrice,
  type CatalogPort,
} from './port.js';

/** La lista alternativa. Existe para que haya más de una. */
export const LISTA_DISTRIBUIDOR = 'distribuidor';

interface ArticuloDeSemilla extends CatalogItem {
  /** Precio en la lista general, en centavos. */
  readonly general: number;
  /** Precio de distribuidor. Ausente donde el negocio no lo diferencia. */
  readonly distribuidor?: number;
  readonly onHand: number;
}

/**
 * El catálogo ficticio.
 *
 * Los importes están en centavos, como todo importe del sistema.
 */
const ARTICULOS: readonly ArticuloDeSemilla[] = [
  // ── Máquinas ────────────────────────────────────────────────────────
  {
    sku: 'MAQ-PUL-450',
    name: 'Pulidora de pisos 450 mm',
    category: 'máquinas',
    unit: 'unidad',
    description: 'Pulidora monodisco de 450 mm para hormigón y microcemento.',
    general: 4_850_000_00,
    distribuidor: 4_365_000_00,
    onHand: 3,
  },
  {
    sku: 'MAQ-PUL-700',
    name: 'Pulidora de pisos 700 mm doble disco',
    category: 'máquinas',
    unit: 'unidad',
    description: 'Doble disco contrarrotante para superficies de más de 500 m2.',
    general: 9_200_000_00,
    distribuidor: 8_280_000_00,
    onHand: 1,
  },
  {
    sku: 'MAQ-ASP-70',
    name: 'Aspiradora industrial 70 L',
    category: 'máquinas',
    unit: 'unidad',
    description: 'Aspiración de polvo en seco, filtro HEPA, para trabajo continuo.',
    general: 1_780_000_00,
    distribuidor: 1_602_000_00,
    onHand: 6,
  },

  // ── Diamantes ───────────────────────────────────────────────────────
  {
    sku: 'DIA-MET-30',
    name: 'Diamante metálico grano 30',
    category: 'diamantes',
    unit: 'unidad',
    description: 'Desbaste inicial sobre hormigón. Segmento metálico, alta remoción.',
    general: 42_500_00,
    distribuidor: 36_125_00,
    onHand: 120,
  },
  {
    sku: 'DIA-MET-120',
    name: 'Diamante metálico grano 120',
    category: 'diamantes',
    unit: 'unidad',
    description: 'Refinado intermedio previo a la resina.',
    general: 42_500_00,
    distribuidor: 36_125_00,
    onHand: 96,
  },
  {
    sku: 'DIA-RES-400',
    name: 'Diamante resinoide grano 400',
    category: 'diamantes',
    unit: 'unidad',
    description: 'Pulido fino. Se consume más rápido sobre superficies abrasivas.',
    general: 38_900_00,
    distribuidor: 33_065_00,
    onHand: 210,
  },
  {
    sku: 'DIA-RES-3000',
    name: 'Diamante resinoide grano 3000',
    category: 'diamantes',
    unit: 'unidad',
    description: 'Terminación espejo.',
    general: 51_200_00,
    distribuidor: 43_520_00,
    onHand: 74,
  },

  // ── Resinas ─────────────────────────────────────────────────────────
  {
    sku: 'RES-EPO-20',
    name: 'Resina epoxi bicomponente',
    category: 'resinas',
    unit: 'kg',
    description: 'Sellado de pisos industriales. Rendimiento aproximado 4 m2 por kg.',
    general: 18_400_00,
    distribuidor: 15_640_00,
    onHand: 340,
  },
  {
    sku: 'RES-POL-10',
    name: 'Revestimiento poliuretánico',
    category: 'resinas',
    unit: 'kg',
    description: 'Terminación flexible resistente a rayos UV, para exteriores.',
    general: 24_900_00,
    distribuidor: 21_165_00,
    onHand: 155,
  },

  // ── Químicos ────────────────────────────────────────────────────────
  {
    sku: 'QUI-END-20',
    name: 'Endurecedor de superficie litio',
    category: 'químicos',
    unit: 'litro',
    description: 'Densificador de silicato de litio. Rinde 8 m2 por litro.',
    general: 9_750_00,
    distribuidor: 8_287_00,
    onHand: 480,
  },
  {
    sku: 'QUI-SEL-20',
    name: 'Sellador acrílico base agua',
    category: 'químicos',
    unit: 'litro',
    description: 'Protección de terminación. Rinde 10 m2 por litro.',
    general: 7_300_00,
    // Sin precio de distribuidor: no todo el catálogo se diferencia por lista.
    onHand: 260,
  },
  {
    sku: 'QUI-DES-05',
    name: 'Desengrasante industrial concentrado',
    category: 'químicos',
    unit: 'litro',
    description: 'Preparación de superficie antes del desbaste. Se diluye 1:10.',
    general: 5_900_00,
    distribuidor: 5_015_00,
    onHand: 190,
  },

  // ── Consumibles ─────────────────────────────────────────────────────
  {
    sku: 'CON-PAD-17',
    name: 'Pad de pulido 17 pulgadas',
    category: 'consumibles',
    unit: 'unidad',
    description: 'Pad de fibra para terminación. Consumo alto sobre superficie rugosa.',
    general: 12_600_00,
    distribuidor: 10_710_00,
    onHand: 320,
  },
  {
    sku: 'CON-FIL-HEP',
    name: 'Filtro HEPA de repuesto',
    category: 'consumibles',
    unit: 'unidad',
    description: 'Repuesto para aspiradora industrial. Recambio cada 200 horas.',
    general: 21_800_00,
    distribuidor: 18_530_00,
    onHand: 45,
  },
  {
    sku: 'SER-CAP-8',
    name: 'Capacitación en obra, jornada de 8 horas',
    category: 'servicios',
    unit: 'hora',
    description: 'Formación del operador sobre el equipo entregado.',
    general: 95_000_00,
    onHand: 0,
  },
];

/** Cuándo se leyó el stock. En la semilla, siempre ahora. */
function ahora(): Date {
  return new Date();
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function comoItem(articulo: ArticuloDeSemilla): CatalogItem {
  return {
    sku: articulo.sku,
    name: articulo.name,
    category: articulo.category,
    unit: articulo.unit,
    description: articulo.description,
  };
}

/**
 * El adaptador de semilla.
 *
 * Cumple el puerto y nada más: quien lo recibe no tiene forma de saber que los
 * datos son inventados, que es exactamente el punto. El día que exista el
 * puente con Tango, se cambia la fábrica y ninguna capa superior se entera.
 */
export function createSeedCatalog(): CatalogPort {
  return {
    async search(term, options) {
      const buscado = normalizar(term.trim());
      if (buscado.length === 0) return [];

      const limite = options?.limit ?? 20;

      return ARTICULOS.filter(
        (articulo) =>
          normalizar(articulo.name).includes(buscado) ||
          normalizar(articulo.sku).includes(buscado) ||
          normalizar(articulo.category).includes(buscado),
      )
        .slice(0, limite)
        .map(comoItem);
    },

    async bySku(sku) {
      const articulo = ARTICULOS.find((a) => a.sku === sku);
      return articulo ? comoItem(articulo) : null;
    },

    async priceFor(sku, options): Promise<CatalogPrice | null> {
      const articulo = ARTICULOS.find((a) => a.sku === sku);
      if (!articulo) return null;

      const lista = options?.priceList ?? LISTA_GENERAL;

      // Un artículo sin precio en la lista pedida no cae a la general en
      // silencio: devolver otro precio del que se pidió es peor que no
      // devolver ninguno, porque nadie lo nota.
      if (lista === LISTA_DISTRIBUIDOR) {
        return articulo.distribuidor === undefined
          ? null
          : {
              sku,
              priceList: LISTA_DISTRIBUIDOR,
              unitPrice: articulo.distribuidor,
              currency: 'ARS',
            };
      }

      if (lista !== LISTA_GENERAL) return null;

      return { sku, priceList: LISTA_GENERAL, unitPrice: articulo.general, currency: 'ARS' };
    },

    async availabilityOf(sku): Promise<CatalogAvailability | null> {
      const articulo = ARTICULOS.find((a) => a.sku === sku);
      if (!articulo) return null;

      return { sku, onHand: articulo.onHand, unit: articulo.unit, asOf: ahora() };
    },
  };
}
