/**
 * El presupuesto en papel.
 *
 * Es el primer artefacto de NCI que ve un cliente, así que es también la
 * primera vez que el sistema se muestra afuera. Se dibuja a mano con pdfkit y
 * no con una plantilla de biblioteca: la jerarquía, la alineación de los
 * números y el espacio en blanco son el trabajo, no un accesorio.
 *
 * ── La regla que estructura todo este archivo ──────────────────────────
 *
 * El documento se dibuja **exclusivamente** con lo que recibe en
 * `QuoteDocumentData`, y eso es una copia de lo que el presupuesto congeló al
 * emitirse. No hay forma de que consulte un precio actual, porque este paquete
 * no depende del catálogo, ni de ventas, ni de la base — no puede alcanzarlos
 * aunque alguien quisiera. Un presupuesto es una promesa fechada: si mañana
 * cambia una lista de precios, el PDF de ayer sigue diciendo lo de ayer.
 *
 * Y `issuedAt` no es opcional. Un borrador no tiene fecha de emisión, así que
 * **un borrador no se puede convertir en documento**: no es una comprobación
 * que alguien pueda olvidarse de escribir, es que el dato no existe.
 */

import PDFDocument from 'pdfkit';

import { formatMoney, type Cents } from '@nci/domain';

import type { CompanyIdentity } from './company.js';

export interface QuoteDocumentLine {
  readonly description: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPrice: Cents;
  readonly discountPercent: number;
  /** Neto del renglón, con descuento y sin IVA. Tal como se guardó. */
  readonly lineTotal: Cents;
}

export interface QuoteDocumentData {
  readonly number: string;
  readonly version: number;
  /** Obligatoria. Es lo que hace imposible documentar un borrador. */
  readonly issuedAt: Date;
  /** `AAAA-MM-DD`. Nula sólo en presupuestos emitidos antes de D-017. */
  readonly validUntil: string | null;
  readonly currency: string;

  readonly customerName: string;
  readonly customerTaxId: string | null;
  readonly paymentTermsDays: number | null;

  readonly lines: readonly QuoteDocumentLine[];
  readonly subtotal: Cents;
  readonly discountTotal: Cents;
  readonly taxTotal: Cents;
  readonly total: Cents;

  /** Observaciones del vendedor. */
  readonly notes: string | null;
}

// ── Geometría ────────────────────────────────────────────────────────────
// A4 en puntos. Los márgenes son anchos a propósito: el documento se lee
// tanto impreso como en la pantalla de un teléfono, y en el teléfono el aire
// alrededor del texto es lo que hace que se distinga la estructura sin hacer
// zoom.

const PAGINA = { ancho: 595.28, alto: 841.89 };
const MARGEN = 48;
const ANCHO_UTIL = PAGINA.ancho - MARGEN * 2;

/** Dónde empieza cada columna de la tabla, y cuánto mide. */
const COLUMNAS = {
  detalle: { x: MARGEN, ancho: 214 },
  cantidad: { x: MARGEN + 222, ancho: 62 },
  precio: { x: MARGEN + 288, ancho: 82 },
  descuento: { x: MARGEN + 374, ancho: 48 },
  neto: { x: MARGEN + 426, ancho: 73 },
} as const;

const TINTA = {
  fuerte: '#131313',
  media: '#555250',
  suave: '#8a8583',
  linea: '#d8d3d1',
  marca: '#e31e24',
} as const;

/** Formatea `AAAA-MM-DD` como `05/09/2026`, que es como se lee acá. */
function comoFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function fechaDe(valor: Date): string {
  const dia = String(valor.getDate()).padStart(2, '0');
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${valor.getFullYear()}`;
}

/**
 * El nombre del archivo.
 *
 * Pensado para un vendedor con doscientos PDF en la carpeta de descargas: el
 * número adelante para que ordenen solos, la versión pegada al número porque
 * es lo que distingue dos archivos del mismo presupuesto, y el cliente al
 * final para poder encontrarlo cuando uno se acuerda del nombre y no del
 * número.
 */
export function quoteFileName(data: QuoteDocumentData): string {
  const cliente = data.customerName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return `${data.number}-v${data.version}-${cliente}.pdf`;
}

/**
 * Dibuja el presupuesto y devuelve el PDF.
 *
 * Devuelve el documento entero en memoria en lugar de un flujo. Un presupuesto
 * pesa decenas de kilobytes y quien lo pide lo va a descargar completo: el
 * flujo agregaría una máquina de estados para no ganar nada.
 */
export async function renderQuoteDocument(
  data: QuoteDocumentData,
  empresa: CompanyIdentity,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGINA.ancho, PAGINA.alto],
    margin: MARGEN,
    // Hace falta para poder volver sobre las páginas ya dibujadas y escribir
    // el pie con el total de páginas, que no se conoce hasta el final.
    bufferPages: true,
    info: {
      Title: `${data.number} v${data.version} · ${data.customerName}`,
      Author: empresa.legalName,
      Subject: `Presupuesto para ${data.customerName}`,
    },
  });

  const trozos: Buffer[] = [];
  doc.on('data', (trozo: Buffer) => trozos.push(trozo));
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });

  encabezado(doc, data, empresa);
  const yTabla = bloqueCliente(doc, data);
  const yTotales = tabla(doc, data, yTabla);
  const yObservaciones = totales(doc, data, yTotales);
  observaciones(doc, data, yObservaciones);
  pieDePagina(doc, empresa);

  doc.end();
  return terminado;
}

// ── Las partes ───────────────────────────────────────────────────────────

function encabezado(
  doc: PDFKit.PDFDocument,
  data: QuoteDocumentData,
  empresa: CompanyIdentity,
): void {
  doc.font('Helvetica-Bold').fontSize(17).fillColor(TINTA.fuerte);
  doc.text(empresa.legalName, MARGEN, MARGEN, { width: 300 });

  doc.font('Helvetica').fontSize(8).fillColor(TINTA.media);
  const identidad = [
    `CUIT ${empresa.taxId}`,
    empresa.address,
    `${empresa.phone} · ${empresa.email}`,
    ...(empresa.website ? [empresa.website] : []),
  ];
  doc.text(identidad.join('\n'), MARGEN, MARGEN + 24, { width: 300, lineGap: 1.5 });

  // El bloque de la derecha: qué documento es éste. La versión va pegada al
  // número y del mismo tamaño porque es lo que distingue dos PDF del mismo
  // presupuesto, y si el cliente tiene dos tiene que poder saber cuál manda.
  const derecha = MARGEN + ANCHO_UTIL - 200;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(TINTA.marca);
  doc.text('PRESUPUESTO', derecha, MARGEN, { width: 200, align: 'right', characterSpacing: 1.2 });

  doc.font('Helvetica-Bold').fontSize(15).fillColor(TINTA.fuerte);
  doc.text(`${data.number} · v${data.version}`, derecha, MARGEN + 14, {
    width: 200,
    align: 'right',
  });

  doc.font('Helvetica').fontSize(8).fillColor(TINTA.media);
  const fechas = [
    `Emitido el ${fechaDe(data.issuedAt)}`,
    data.validUntil ? `Válido hasta el ${comoFecha(data.validUntil)}` : 'Sin fecha de validez',
  ];
  doc.text(fechas.join('\n'), derecha, MARGEN + 34, {
    width: 200,
    align: 'right',
    lineGap: 1.5,
  });

  doc
    .moveTo(MARGEN, MARGEN + 74)
    .lineTo(MARGEN + ANCHO_UTIL, MARGEN + 74)
    .lineWidth(1)
    .strokeColor(TINTA.marca)
    .stroke();
}

function bloqueCliente(doc: PDFKit.PDFDocument, data: QuoteDocumentData): number {
  const y = MARGEN + 92;

  doc.font('Helvetica').fontSize(7).fillColor(TINTA.suave);
  doc.text('PRESUPUESTADO A', MARGEN, y, { characterSpacing: 0.8 });

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA.fuerte);
  doc.text(data.customerName, MARGEN, y + 11, { width: 300 });

  if (data.customerTaxId) {
    doc.font('Helvetica').fontSize(8).fillColor(TINTA.media);
    doc.text(`CUIT ${data.customerTaxId}`, MARGEN, y + 27, { width: 300 });
  }

  // La condición de pago va acá y no al pie: es parte de lo que se está
  // ofreciendo, no una nota al margen. Sin ella el presupuesto no se emite.
  const derecha = MARGEN + ANCHO_UTIL - 200;
  doc.font('Helvetica').fontSize(7).fillColor(TINTA.suave);
  doc.text('CONDICIÓN DE PAGO', derecha, y, { width: 200, align: 'right', characterSpacing: 0.8 });

  doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA.fuerte);
  doc.text(
    data.paymentTermsDays === null ? 'A convenir' : `${data.paymentTermsDays} días`,
    derecha,
    y + 11,
    { width: 200, align: 'right' },
  );

  return y + 54;
}

function cabeceraDeTabla(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Helvetica').fontSize(7).fillColor(TINTA.suave);
  doc.text('DETALLE', COLUMNAS.detalle.x, y, { width: COLUMNAS.detalle.ancho });
  doc.text('CANTIDAD', COLUMNAS.cantidad.x, y, {
    width: COLUMNAS.cantidad.ancho,
    align: 'right',
  });
  doc.text('P. UNITARIO', COLUMNAS.precio.x, y, { width: COLUMNAS.precio.ancho, align: 'right' });
  doc.text('DESC.', COLUMNAS.descuento.x, y, {
    width: COLUMNAS.descuento.ancho,
    align: 'right',
  });
  doc.text('NETO', COLUMNAS.neto.x, y, { width: COLUMNAS.neto.ancho, align: 'right' });

  doc
    .moveTo(MARGEN, y + 13)
    .lineTo(MARGEN + ANCHO_UTIL, y + 13)
    .lineWidth(0.5)
    .strokeColor(TINTA.linea)
    .stroke();

  return y + 21;
}

function tabla(doc: PDFKit.PDFDocument, data: QuoteDocumentData, desde: number): number {
  let y = cabeceraDeTabla(doc, desde);

  for (const linea of data.lines) {
    doc.font('Helvetica').fontSize(9).fillColor(TINTA.fuerte);
    const altoDescripcion = doc.heightOfString(linea.description, {
      width: COLUMNAS.detalle.ancho,
    });
    const alto = Math.max(altoDescripcion, 12) + 10;

    // Si el renglón no entra, empieza una página nueva con la cabecera de la
    // tabla repetida. Sin eso, la segunda página de un presupuesto largo son
    // números sin título, que es donde se leen mal.
    if (y + alto > PAGINA.alto - MARGEN - 40) {
      doc.addPage();
      y = cabeceraDeTabla(doc, MARGEN);
    }

    doc.text(linea.description, COLUMNAS.detalle.x, y, { width: COLUMNAS.detalle.ancho });

    // Los números van todos alineados a la derecha para que las unidades
    // queden en columna y las magnitudes se comparen de un vistazo.
    doc.fillColor(TINTA.media);
    doc.text(`${linea.quantity} ${linea.unit}`, COLUMNAS.cantidad.x, y, {
      width: COLUMNAS.cantidad.ancho,
      align: 'right',
    });
    doc.text(formatMoney(linea.unitPrice, data.currency), COLUMNAS.precio.x, y, {
      width: COLUMNAS.precio.ancho,
      align: 'right',
    });

    // El descuento tiene columna propia y se muestra también cuando es cero.
    // Que aparezca sólo a veces hace que su ausencia se lea como que no existe
    // la posibilidad de pedirlo.
    doc.text(
      linea.discountPercent > 0 ? `${linea.discountPercent} %` : '—',
      COLUMNAS.descuento.x,
      y,
      { width: COLUMNAS.descuento.ancho, align: 'right' },
    );

    doc.fillColor(TINTA.fuerte);
    doc.text(formatMoney(linea.lineTotal, data.currency), COLUMNAS.neto.x, y, {
      width: COLUMNAS.neto.ancho,
      align: 'right',
    });

    y += alto;
    doc
      .moveTo(MARGEN, y - 5)
      .lineTo(MARGEN + ANCHO_UTIL, y - 5)
      .lineWidth(0.5)
      .strokeColor(TINTA.linea)
      .stroke();
  }

  return y + 12;
}

function totales(doc: PDFKit.PDFDocument, data: QuoteDocumentData, desde: number): number {
  const ancho = 220;
  const x = MARGEN + ANCHO_UTIL - ancho;
  let y = desde;

  if (y > PAGINA.alto - MARGEN - 130) {
    doc.addPage();
    y = MARGEN;
  }

  const fila = (rotulo: string, valor: string, fuerte = false): void => {
    doc
      .font(fuerte ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fuerte ? 12 : 9)
      .fillColor(fuerte ? TINTA.fuerte : TINTA.media);
    doc.text(rotulo, x, y, { width: ancho - 110, align: 'left' });
    doc.text(valor, x + ancho - 110, y, { width: 110, align: 'right' });
    y += fuerte ? 20 : 15;
  };

  fila('Subtotal', formatMoney(data.subtotal, data.currency));
  if (data.discountTotal > 0) {
    fila('Descuentos', `− ${formatMoney(data.discountTotal, data.currency)}`);
  }
  fila('IVA', formatMoney(data.taxTotal, data.currency));

  doc.moveTo(x, y + 2).lineTo(x + ancho, y + 2).lineWidth(0.5).strokeColor(TINTA.fuerte).stroke();
  y += 9;

  // La moneda está explícita en cada importe porque `formatMoney` la incluye,
  // y además acá, porque el total es el número que alguien va a copiar a una
  // orden de compra. Ver D-003: un presupuesto tiene una sola moneda.
  fila(`Total en ${data.currency}`, formatMoney(data.total, data.currency), true);

  return y + 18;
}

function observaciones(doc: PDFKit.PDFDocument, data: QuoteDocumentData, desde: number): void {
  let y = desde;

  if (y > PAGINA.alto - MARGEN - 90) {
    doc.addPage();
    y = MARGEN;
  }

  doc.font('Helvetica').fontSize(7).fillColor(TINTA.suave);
  doc.text('OBSERVACIONES', MARGEN, y, { characterSpacing: 0.8 });

  const texto = data.notes?.trim();
  if (texto) {
    doc.font('Helvetica').fontSize(9).fillColor(TINTA.fuerte);
    doc.text(texto, MARGEN, y + 12, { width: ANCHO_UTIL - 120, lineGap: 2 });
    return;
  }

  // Sin observaciones queda el espacio y una línea: el vendedor imprime y
  // escribe a mano, que es lo que hace hoy con el cuaderno.
  doc
    .moveTo(MARGEN, y + 30)
    .lineTo(MARGEN + ANCHO_UTIL - 120, y + 30)
    .lineWidth(0.5)
    .strokeColor(TINTA.linea)
    .stroke();
}

function pieDePagina(doc: PDFKit.PDFDocument, empresa: CompanyIdentity): void {
  const paginas = doc.bufferedPageRange();

  for (let i = paginas.start; i < paginas.start + paginas.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor(TINTA.suave);
    doc.text(empresa.legalName, MARGEN, PAGINA.alto - MARGEN + 8, {
      width: ANCHO_UTIL,
      align: 'left',
      lineBreak: false,
    });
    doc.text(
      paginas.count > 1 ? `Página ${i - paginas.start + 1} de ${paginas.count}` : '',
      MARGEN,
      PAGINA.alto - MARGEN + 8,
      { width: ANCHO_UTIL, align: 'right', lineBreak: false },
    );
  }
}
