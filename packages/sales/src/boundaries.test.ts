/**
 * Los límites del dominio comercial.
 *
 * Un presupuesto tiene una sola moneda (D-003). Hasta ahora eso era cierto por
 * omisión: nadie había agregado la columna. Lo que es cierto por omisión se
 * pierde el día que alguien la agrega creyendo que suma flexibilidad, y el
 * costo no aparece ahí sino después, cuando un total suma dos monedas.
 *
 * Estas pruebas convierten la omisión en una regla que rompe el build. Es el
 * mismo mecanismo con el que @nci/ai garantiza que no puede alcanzar la base:
 * se lee el código fuente y se verifica lo que no puede estar.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const paqueteRaiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/** El esquema de la base vive en otro paquete, y hay que leerlo de ahí. */
const ESQUEMA_COMERCIAL = join(paqueteRaiz, '..', 'db', 'src', 'schema', 'sales.ts');

/**
 * Lee un archivo y falla con un mensaje útil si no está.
 *
 * Una guarda que deja de encontrar lo que vigila tiene que fallar, no pasar en
 * silencio: si mañana se mueve el esquema, esto avisa en lugar de dejar de
 * verificar sin que nadie se entere.
 */
function fuente(ruta: string): string {
  assert.ok(
    existsSync(ruta),
    `No se encontró ${ruta}. Esta prueba vigila ese archivo: si se movió, hay que actualizar la ruta, no borrar la prueba.`,
  );
  return readFileSync(ruta, 'utf8');
}

/**
 * El texto de un bloque, desde una línea de apertura hasta su cierre.
 *
 * Hace falta porque `quotes` y `quote_items` viven en el mismo archivo y la
 * moneda es legítima en el primero: buscar en todo el archivo daría un falso
 * positivo permanente.
 */
function bloque(texto: string, apertura: string, cierre: string): string {
  const desde = texto.indexOf(apertura);
  assert.notEqual(desde, -1, `No se encontró "${apertura}". La prueba dejó de vigilar lo que debía.`);

  const hasta = texto.indexOf(`\n${cierre}`, desde);
  assert.notEqual(hasta, -1, `No se encontró el cierre de "${apertura}".`);

  return texto.slice(desde, hasta);
}

/**
 * El nombre de la columna prohibida, armado por partes.
 *
 * Así este archivo puede nombrarla en sus mensajes sin detectarse a sí mismo,
 * igual que hace la prueba de límites del motor de IA.
 */
const MONEDA = 'curr' + 'ency';

const PORQUE = [
  'La moneda es del presupuesto, no del renglón (D-003).',
  '',
  'Renglones con monedas distintas obligan a convertir para totalizar, y eso',
  'exige un tipo de cambio con su fecha. NCI no es dueño de la conversión: los',
  'precios son de Tango (D-001). Si de verdad hace falta cotizar en dos monedas,',
  'son dos presupuestos, y la decisión se discute antes de agregar la columna.',
].join('\n');

describe('La moneda es del presupuesto y no del renglón', () => {
  it('quote_items no tiene columna de moneda', () => {
    const esquema = fuente(ESQUEMA_COMERCIAL);
    const definicion = bloque(esquema, 'export const quoteItems = pgTable(', ');');

    assert.ok(
      !definicion.includes(MONEDA),
      `La tabla quote_items declara "${MONEDA}".\n\n${PORQUE}`,
    );
  });

  it('la tabla quotes sí la tiene, que es donde corresponde', () => {
    // El contrapeso de la prueba anterior: verifica que la moneda existe en
    // algún lado. Sin esto, borrarla de las dos tablas dejaría las dos en verde.
    const esquema = fuente(ESQUEMA_COMERCIAL);
    const definicion = bloque(esquema, 'export const quotes = pgTable(', ');');

    assert.ok(
      definicion.includes(MONEDA),
      'La tabla quotes perdió su columna de moneda. Un importe sin moneda no significa nada.',
    );
  });

  it('LineInput no admite moneda por renglón', () => {
    // La aritmética de dinero se mudó a `@nci/domain` para que el navegador
    // pueda ejecutar las mismas reglas que el servidor (D-015). La guarda
    // sigue vigente y se vigila donde ahora vive: cuando el archivo se movió,
    // esta prueba se puso en rojo en lugar de dejar de verificar en silencio,
    // que es exactamente para lo que está escrita así.
    const definicion = bloque(
      fuente(join(paqueteRaiz, '..', 'domain', 'src', 'money.ts')),
      'export interface LineInput {',
      '}',
    );

    assert.ok(
      definicion.includes(`${MONEDA}?: never`),
      `LineInput perdió la guarda de tipo sobre "${MONEDA}".\n\n${PORQUE}`,
    );
  });

  it('QuoteItemInput no admite moneda por renglón', () => {
    const definicion = bloque(
      fuente(join(paqueteRaiz, 'src', 'quotes.ts')),
      'export interface QuoteItemInput {',
      '}',
    );

    assert.ok(
      definicion.includes(`${MONEDA}?: never`),
      `QuoteItemInput perdió la guarda de tipo sobre "${MONEDA}".\n\n${PORQUE}`,
    );
  });
});
