/**
 * El contrato del puerto de catálogo.
 *
 * Se prueba contra `getCatalog()` y no contra el adaptador de semilla, a
 * propósito: lo que tiene que valer es el contrato, no la implementación que
 * hoy lo cumple. El día que el adaptador sea el puente con Tango, estas mismas
 * pruebas tienen que seguir teniendo sentido — cambiarán los datos, no lo que
 * se le exige al puerto.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LISTA_GENERAL, getCatalog } from './index.js';
import { LISTA_DISTRIBUIDOR } from './seed.js';

const catalogo = getCatalog();

describe('Buscar productos', () => {
  it('encuentra por nombre', async () => {
    const resultados = await catalogo.search('pulidora');
    assert.ok(resultados.length > 0);
    assert.ok(resultados.every((r) => /pulidora/i.test(r.name)));
  });

  it('encuentra por código', async () => {
    const resultados = await catalogo.search('DIA-MET');
    assert.ok(resultados.length >= 2, 'los diamantes metálicos');
  });

  it('encuentra por categoría, sin acentos', async () => {
    // El Command Palette responde mientras se tipea: exigir el acento sería
    // exigir que el usuario sepa cómo está escrito del otro lado.
    const conAcento = await catalogo.search('químicos');
    const sinAcento = await catalogo.search('quimicos');

    assert.ok(conAcento.length > 0);
    assert.deepEqual(
      sinAcento.map((r) => r.sku),
      conAcento.map((r) => r.sku),
    );
  });

  it('no encontrar es una respuesta, no un error', async () => {
    assert.deepEqual(await catalogo.search('locomotora a vapor'), []);
    assert.deepEqual(await catalogo.search('   '), []);
  });

  it('respeta el límite pedido', async () => {
    const resultados = await catalogo.search('a', { limit: 3 });
    assert.ok(resultados.length <= 3);
  });
});

describe('Precio según lista', () => {
  it('devuelve el de la lista general por defecto', async () => {
    const precio = await catalogo.priceFor('DIA-MET-30');

    assert.ok(precio);
    assert.equal(precio.priceList, LISTA_GENERAL);
    assert.ok(precio.unitPrice > 0);
    assert.equal(precio.currency, 'ARS');
  });

  it('la lista alternativa da otro precio', async () => {
    // Con una sola lista, el mecanismo no está probado: podría estar
    // devolviendo siempre el mismo número y nadie lo notaría.
    const general = await catalogo.priceFor('DIA-MET-30');
    const distribuidor = await catalogo.priceFor('DIA-MET-30', {
      priceList: LISTA_DISTRIBUIDOR,
    });

    assert.ok(general && distribuidor);
    assert.notEqual(general.unitPrice, distribuidor.unitPrice);
    assert.ok(distribuidor.unitPrice < general.unitPrice);
    assert.equal(distribuidor.priceList, LISTA_DISTRIBUIDOR);
  });

  it('el precio dice de qué lista salió', async () => {
    // Un precio sin su lista no se puede auditar, y el presupuesto tiene que
    // poder explicar por qué cotizó lo que cotizó.
    const precio = await catalogo.priceFor('RES-EPO-20', {
      priceList: LISTA_DISTRIBUIDOR,
    });

    assert.equal(precio?.priceList, LISTA_DISTRIBUIDOR);
  });

  it('sin precio en esa lista devuelve null, no el de otra', async () => {
    // Devolver un precio distinto del que se pidió es peor que no devolver
    // ninguno: nadie lo nota hasta que el cliente reclama.
    const sinDistribuidor = await catalogo.priceFor('QUI-SEL-20', {
      priceList: LISTA_DISTRIBUIDOR,
    });

    assert.equal(sinDistribuidor, null);
    assert.ok(await catalogo.priceFor('QUI-SEL-20'), 'pero en la general sí tiene');
  });

  it('un artículo que no existe no tiene precio', async () => {
    assert.equal(await catalogo.priceFor('NO-EXISTE'), null);
  });

  it('los precios son enteros en centavos', async () => {
    for (const sku of ['MAQ-PUL-450', 'DIA-RES-400', 'QUI-END-20']) {
      const precio = await catalogo.priceFor(sku);
      assert.ok(precio);
      assert.ok(Number.isInteger(precio.unitPrice), `${sku} tiene un precio con decimales`);
    }
  });
});

describe('Disponibilidad', () => {
  it('dice cuánto hay y de cuándo es el dato', async () => {
    const disponible = await catalogo.availabilityOf('DIA-MET-30');

    assert.ok(disponible);
    assert.ok(Number.isInteger(disponible.onHand));
    assert.ok(disponible.asOf instanceof Date, 'sin fecha, el número no se puede interpretar');
  });

  it('cero disponible no es lo mismo que no existir', async () => {
    const sinStock = await catalogo.availabilityOf('SER-CAP-8');
    const inexistente = await catalogo.availabilityOf('NO-EXISTE');

    assert.equal(sinStock?.onHand, 0);
    assert.equal(inexistente, null);
  });
});

describe('El puerto no deja ver de dónde salen los datos', () => {
  /**
   * El criterio de éxito del puerto, como prueba.
   *
   * Si alguna capa superior pudiera saber que el catálogo es de semilla,
   * escribiría una rama para ese caso — y esa rama sobreviviría a la
   * integración, silenciosa y equivocada. La única forma de que eso no pase es
   * que el dato no esté disponible.
   */
  it('ningún tipo del puerto expone la procedencia', async () => {
    const item = (await catalogo.search('pulidora'))[0];
    const precio = await catalogo.priceFor('DIA-MET-30');
    const disponible = await catalogo.availabilityOf('DIA-MET-30');

    const prohibidas = ['source', 'origen', 'seed', 'semilla', 'fake', 'ficticio', 'isSeed', 'mock'];

    for (const [nombre, objeto] of [
      ['artículo', item],
      ['precio', precio],
      ['disponibilidad', disponible],
    ] as const) {
      const claves = Object.keys(objeto ?? {});
      for (const prohibida of prohibidas) {
        assert.ok(
          !claves.includes(prohibida),
          `El ${nombre} expone "${prohibida}". Si una capa superior puede distinguir el adaptador de semilla de uno real, va a escribir una rama para eso y esa rama va a sobrevivir a la integración.`,
        );
      }
    }
  });

  it('la fábrica no admite elegir adaptador', () => {
    // `getCatalog()` no recibe parámetros: no hay forma de pedir "el de
    // prueba" desde afuera, ni de preguntarle cuál devolvió.
    assert.equal(getCatalog.length, 0);
    assert.equal(getCatalog(), getCatalog(), 'y siempre es el mismo');
  });
});
