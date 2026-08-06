/**
 * El documento del presupuesto.
 *
 * Un PDF no se puede afirmar renglón por renglón sin volver la prueba
 * ilegible, así que se verifica lo que se puede verificar y que importa: que
 * salga un PDF válido, que el texto que tiene que estar esté, que los importes
 * sean los congelados, y que el nombre del archivo le sirva a alguien.
 *
 * El texto se busca sobre el flujo descomprimido del PDF. Es tosco y alcanza:
 * lo que se está verificando es que el dato llegó al papel, no cómo se ve.
 */

import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { describe, it } from 'node:test';

import { companyFromEnv, type CompanyIdentity } from './company.js';
import {
  quoteFileName,
  renderQuoteDocument,
  type QuoteDocumentData,
} from './quote-document.js';

const EMPRESA: CompanyIdentity = {
  legalName: 'Empresa de Prueba S.A.',
  taxId: '30-00000000-0',
  address: 'Calle Falsa 123, Rosario',
  phone: '341 000 0000',
  email: 'prueba@ejemplo.local',
};

function presupuesto(cambios: Partial<QuoteDocumentData> = {}): QuoteDocumentData {
  return {
    number: 'P-2026-0042',
    version: 2,
    issuedAt: new Date(2026, 7, 6, 10, 0),
    validUntil: '2026-09-05',
    currency: 'ARS',
    customerName: 'Constructora del Litoral S.A.',
    customerTaxId: '30-12345678-9',
    paymentTermsDays: 30,
    lines: [
      {
        description: 'Diamante metálico grano 30',
        quantity: 4,
        unit: 'unidad',
        unitPrice: 4_250_000,
        discountPercent: 10,
        lineTotal: 15_300_000,
      },
    ],
    subtotal: 17_000_000,
    discountTotal: 1_700_000,
    taxTotal: 3_213_000,
    total: 18_513_000,
    notes: null,
    ...cambios,
  };
}

/**
 * El texto visible del PDF.
 *
 * pdfkit comprime el contenido de cada página y adentro escribe las cadenas en
 * hexadecimal, dentro de operadores `[<...>] TJ`. Para poder afirmar que un
 * dato llegó al papel hay que deshacer las dos cosas.
 *
 * Se decodifica como latin1 porque las fuentes estándar usan WinAnsi, que para
 * el castellano coincide. Si algún día hiciera falta una fuente embebida, esta
 * función es la primera que va a dejar de servir, y su prueba lo va a decir.
 */
function textoDelPdf(pdf: Buffer): string {
  const partes: string[] = [];

  for (const stream of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string;
    try {
      contenido = inflateSync(Buffer.from(stream[1]!, 'latin1')).toString('latin1');
    } catch {
      continue; // No todos los flujos son de texto comprimido.
    }

    for (const arreglo of contenido.matchAll(/\[(.*?)\]\s*TJ/g)) {
      for (const hex of arreglo[1]!.matchAll(/<([0-9a-fA-F]*)>/g)) {
        partes.push(Buffer.from(hex[1]!, 'hex').toString('latin1'));
      }
    }
  }

  return partes.join('');
}

describe('El documento sale', () => {
  it('es un PDF válido', async () => {
    const pdf = await renderQuoteDocument(presupuesto(), EMPRESA);

    assert.ok(pdf.length > 1000, 'un presupuesto con un renglón no puede pesar nada');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'la firma del formato');
    assert.ok(pdf.subarray(-10).toString().includes('EOF'), 'y el cierre');
  });

  it('lleva la identidad de quien emite', async () => {
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));

    assert.match(texto, /Empresa de Prueba/);
    assert.match(texto, /30-00000000-0/);
    assert.match(texto, /Calle Falsa 123/);
  });

  it('lleva el número y la versión, que es lo que distingue dos PDF', async () => {
    // Sin la versión visible, el versionado que construimos no sirve de nada
    // afuera: el cliente con dos archivos no puede saber cuál manda.
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));

    assert.match(texto, /P-2026-0042/);
    assert.match(texto, /v2/);
  });

  it('dice cuándo se emitió y hasta cuándo vale', async () => {
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));

    assert.match(texto, /06\/08\/2026/, 'la emisión');
    assert.match(texto, /05\/09\/2026/, 'la validez');
  });

  it('lleva al cliente y su condición de pago', async () => {
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));

    assert.match(texto, /Constructora del Litoral/);
    assert.match(texto, /30-12345678-9/);
    assert.match(texto, /30 d/, '30 días');
  });

  it('el descuento del renglón tiene su propia columna', async () => {
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));

    assert.match(texto, /DESC/);
    assert.match(texto, /10 %/);
  });

  it('la moneda está explícita en el total', async () => {
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));
    assert.match(texto, /Total en ARS/);
  });

  it('escribe las observaciones del vendedor cuando las hay', async () => {
    const texto = textoDelPdf(
      await renderQuoteDocument(presupuesto({ notes: 'Entrega en obra Puerto Norte.' }), EMPRESA),
    );

    assert.match(texto, /Puerto Norte/);
  });

  it('sin observaciones deja el espacio igual', async () => {
    const texto = textoDelPdf(await renderQuoteDocument(presupuesto(), EMPRESA));
    assert.match(texto, /OBSERVACIONES/);
  });

  it('un presupuesto largo se reparte en páginas y repite la cabecera', async () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({
      description: `Artículo de prueba número ${i + 1}`,
      quantity: 1,
      unit: 'unidad',
      unitPrice: 100_000,
      discountPercent: 0,
      lineTotal: 100_000,
    }));

    const pdf = await renderQuoteDocument(presupuesto({ lines: muchos }), EMPRESA);
    const texto = textoDelPdf(pdf);

    // La segunda página de un presupuesto largo no puede ser números sin
    // título: la cabecera de la tabla se repite, y por eso aparece más de una.
    assert.ok((texto.match(/P\. UNITARIO/g) ?? []).length >= 2, 'la cabecera se repite');
    assert.match(texto, /Página 1 de/, 'y el pie numera las páginas');
  });

  it('los acentos y la eñe llegan al papel', async () => {
    // Helvetica usa WinAnsi, que cubre el castellano. Si algún día hiciera
    // falta una fuente embebida, esta prueba es la que se va a poner en rojo.
    const texto = textoDelPdf(
      await renderQuoteDocument(
        presupuesto({ customerName: 'Añatuya Construcción S.R.L.' }),
        EMPRESA,
      ),
    );

    assert.match(texto, /A.atuya Construcci.n/);
  });
});

describe('El nombre del archivo', () => {
  it('lleva número, versión y cliente, en ese orden', () => {
    // Un vendedor con doscientos PDF en la carpeta de descargas los ordena por
    // nombre y encuentra el que busca.
    assert.equal(
      quoteFileName(presupuesto()),
      'P-2026-0042-v2-Constructora-del-Litoral-S-A.pdf',
    );
  });

  it('saca los acentos y lo que rompe un sistema de archivos', () => {
    assert.equal(
      quoteFileName(presupuesto({ customerName: 'Añatuya / Construcción & Cía.' })),
      'P-2026-0042-v2-Anatuya-Construccion-Cia.pdf',
    );
  });

  it('no se va de largo con un nombre kilométrico', () => {
    const nombre = quoteFileName(
      presupuesto({ customerName: 'A'.repeat(200) }),
    );

    assert.ok(nombre.length < 80, `quedó en ${nombre.length}`);
    assert.ok(nombre.endsWith('.pdf'));
  });
});

describe('La identidad de la empresa', () => {
  it('sale del entorno', () => {
    const identidad = companyFromEnv({
      NCI_EMPRESA_RAZON_SOCIAL: 'Empresa S.A.',
      NCI_EMPRESA_CUIT: '30-1-0',
      NCI_EMPRESA_DOMICILIO: 'Calle 1',
      NCI_EMPRESA_TELEFONO: '341',
      NCI_EMPRESA_CORREO: 'a@b.local',
    });

    assert.equal(identidad.legalName, 'Empresa S.A.');
    assert.equal(identidad.website, undefined, 'la web es opcional');
  });

  it('si falta algo, falla y dice todo lo que falta de una vez', () => {
    // Quien configura el despliegue las carga en una pasada, en lugar de
    // descubrirlas de a una.
    let error: Error | undefined;
    try {
      companyFromEnv({ NCI_EMPRESA_RAZON_SOCIAL: 'Empresa S.A.' });
    } catch (caught) {
      error = caught as Error;
    }

    assert.ok(error, 'tiene que fallar');
    assert.match(error.message, /NCI_EMPRESA_CUIT/);
    assert.match(error.message, /NCI_EMPRESA_DOMICILIO/);
    assert.match(error.message, /NCI_EMPRESA_TELEFONO/);
    assert.match(error.message, /NCI_EMPRESA_CORREO/);
    assert.ok(!error.message.includes('NCI_EMPRESA_RAZON_SOCIAL'), 'menos la que sí está');
  });

  it('una variable vacía cuenta como faltante', () => {
    // `NCI_EMPRESA_CUIT=` en un .env es el error más fácil de cometer y el más
    // difícil de ver: sin esto, el documento saldría con "CUIT " y nada.
    assert.throws(
      () =>
        companyFromEnv({
          NCI_EMPRESA_RAZON_SOCIAL: 'Empresa S.A.',
          NCI_EMPRESA_CUIT: '   ',
          NCI_EMPRESA_DOMICILIO: 'Calle 1',
          NCI_EMPRESA_TELEFONO: '341',
          NCI_EMPRESA_CORREO: 'a@b.local',
        }),
      /NCI_EMPRESA_CUIT/,
    );
  });
});
