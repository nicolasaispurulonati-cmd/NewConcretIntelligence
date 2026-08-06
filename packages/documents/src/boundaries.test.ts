/**
 * Los límites del paquete.
 *
 * La regla que sostiene la Tarea 1 —el documento se dibuja con los datos
 * congelados del presupuesto y nunca recalculando contra el catálogo— no puede
 * depender de que quien escriba el próximo renglón se acuerde. Depende de que
 * este paquete **no tenga forma** de consultar un precio actual.
 *
 * Es el mismo mecanismo con el que `@nci/ai` garantiza que no alcanza la base.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const paqueteRaiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function archivosDeProduccion(): string[] {
  const dir = join(paqueteRaiz, 'src');
  return readdirSync(dir)
    .filter((nombre) => nombre.endsWith('.ts') && !nombre.endsWith('.test.ts'))
    .map((nombre) => join(dir, nombre));
}

const PORQUE = [
  'Un presupuesto es una promesa fechada.',
  '',
  'Si este paquete pudiera consultar el catálogo o la base, el PDF de un',
  'presupuesto emitido hace un mes podría imprimir el precio de hoy. El cliente',
  'tiene en la mano un papel que dice otra cosa, y la diferencia aparece recién',
  'cuando reclama. La única defensa que no se olvida es que el dato no se pueda',
  'buscar.',
].join('\n');

describe('El documento no puede consultar nada', () => {
  it('no declara la base, el catálogo ni el dominio comercial', () => {
    const paquete = JSON.parse(readFileSync(join(paqueteRaiz, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const todas = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });

    for (const prohibido of ['@nci' + '/db', '@nci' + '/catalog', '@nci' + '/sales', 'drizzle' + '-orm', 'postgres']) {
      assert.ok(!todas.includes(prohibido), `Declara ${prohibido}.\n\n${PORQUE}`);
    }
  });

  it('ningún archivo de producción los importa', () => {
    // Los nombres se arman por partes para que este archivo no se detecte a sí
    // mismo: nombrar lo que se prohíbe no es usarlo.
    const prohibidos = ['@nci' + '/db', '@nci' + '/catalog', '@nci' + '/sales', 'drizzle' + '-orm'];

    for (const archivo of archivosDeProduccion()) {
      const fuente = readFileSync(archivo, 'utf8');
      for (const prohibido of prohibidos) {
        assert.ok(!fuente.includes(prohibido), `${archivo} referencia ${prohibido}.\n\n${PORQUE}`);
      }
    }
  });

  it('los datos que recibe no permiten volver a buscar el artículo', () => {
    // El contrapeso de las dos pruebas anteriores. Aunque el paquete no pueda
    // importar el catálogo, si el renglón trajera el SKU alguien podría pasarlo
    // hacia afuera y resolver el precio ahí. El renglón lleva la descripción y
    // el importe que se guardaron, y nada con que identificar el artículo.
    const fuente = readFileSync(join(paqueteRaiz, 'src', 'quote-document.ts'), 'utf8');
    const desde = fuente.indexOf('export interface QuoteDocumentLine {');
    assert.notEqual(desde, -1, 'No se encontró QuoteDocumentLine. La prueba dejó de vigilar.');

    const bloque = fuente.slice(desde, fuente.indexOf('\n}', desde));

    for (const campo of ['sku', 'variantId', 'productId', 'priceList']) {
      assert.ok(!bloque.includes(campo), `QuoteDocumentLine declara "${campo}".\n\n${PORQUE}`);
    }
  });

  it('la fecha de emisión es obligatoria, así que un borrador no se puede documentar', () => {
    // No es una comprobación en tiempo de ejecución que alguien pueda olvidarse
    // de escribir: un borrador no tiene fecha de emisión, así que no hay forma
    // de construir la entrada.
    const fuente = readFileSync(join(paqueteRaiz, 'src', 'quote-document.ts'), 'utf8');
    const desde = fuente.indexOf('export interface QuoteDocumentData {');
    assert.notEqual(desde, -1, 'No se encontró QuoteDocumentData. La prueba dejó de vigilar.');

    const bloque = fuente.slice(desde, fuente.indexOf('\n}', desde));

    assert.ok(bloque.includes('readonly issuedAt: Date;'), 'issuedAt tiene que ser obligatoria');
    assert.ok(
      !bloque.includes('issuedAt?') && !bloque.includes('issuedAt: Date | null'),
      'Si issuedAt admitiera nulo, un borrador podría convertirse en documento.',
    );
  });
});
