/**
 * La prueba del cable entre lo calculado y lo que se dibuja.
 *
 * `page.tsx` elegía métrica **o** lista, y los widgets que traían las dos
 * cosas perdían la lista. El indicador de presupuestos calculaba seis líneas
 * con el estado de cada uno que nunca llegaban a la pantalla: el vendedor veía
 * cuánto tenía comprometido y no con quién.
 *
 * El cálculo estaba bien. Lo que estaba mal era que no llegaba — igual que en
 * el defecto original de este archivo, un nivel más arriba.
 *
 * Se extrae el texto de lo que el componente devuelve y se busca el dato. No
 * es una prueba de componentes: no hay eventos, ni estado, ni accesibilidad,
 * ni forma. Se verifica una sola cosa, que es la que se cortaba.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { metric } from '@nci/design';

import { Widget, type WidgetShape } from './widget.js';

/**
 * El texto que produce un árbol de React, sin renderizador.
 *
 * `react-dom/server` no existe bajo la condición `react-server`, que es la que
 * necesita este paquete para poder importar módulos marcados como de servidor.
 * Recorrer el árbol alcanza de sobra: lo que se verifica es qué datos llegan,
 * no cómo se ven.
 */
function textoDe(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(' ');

  const elemento = nodo as { type?: unknown; props?: { children?: unknown } };

  // Un componente todavía no se ejecutó: se lo llama para ver qué devuelve.
  if (typeof elemento.type === 'function') {
    const componente = elemento.type as (props: unknown) => unknown;
    return textoDe(componente(elemento.props));
  }

  return textoDe(elemento.props?.children);
}

/** Un widget con las dos cosas: el número y de qué está compuesto. */
function conMetricaYLineas(extra: Partial<WidgetShape> = {}): WidgetShape {
  return {
    id: 'sales.my_quotes',
    title: 'Tus presupuestos',
    metric: metric({
      label: 'Comprometido en presupuestos abiertos',
      value: '$ 1.210,00',
      context: [{ label: 'Sin enviar', value: '2' }],
    }),
    lines: [
      { primary: 'P-2026-0001 · Constructora del Litoral', secondary: '$ 605,00 · borrador' },
      { primary: 'P-2026-0002 · Industrias del Sur', secondary: '$ 605,00 · enviado' },
    ],
    ...extra,
  };
}

describe('Un widget con métrica muestra de qué está compuesta', () => {
  it('dibuja el número y también las líneas', () => {
    const texto = textoDe(Widget({ widget: conMetricaYLineas() }));

    assert.ok(texto.includes('$ 1.210,00'), 'el número');
    assert.ok(texto.includes('P-2026-0001'), 'y la lista que lo compone');
    assert.ok(texto.includes('Constructora del Litoral'));
    assert.ok(texto.includes('P-2026-0002'));
  });

  it('el aviso de truncamiento es el mismo para los dos tipos de widget', () => {
    const conMetrica = textoDe(
      Widget({ widget: conMetricaYLineas({ truncatedCount: 4 }) }),
    );
    const sinMetrica = textoDe(
      Widget({
        widget: {
          id: 'crm.follow_ups',
          title: 'Esperan respuesta',
          lines: [{ primary: 'Cliente · P-2026-0003', secondary: 'enviado hace 8 días' }],
          truncatedCount: 4,
        },
      }),
    );

    const aviso = 'Hay 4 más que no entran en esta lista.';
    assert.ok(conMetrica.includes(aviso), 'el widget con métrica lo dice');
    assert.ok(sinMetrica.includes(aviso), 'y el de lista lo dice igual');
  });

  it('sin truncamiento no aparece el aviso', () => {
    const texto = textoDe(Widget({ widget: conMetricaYLineas() }));
    assert.ok(!texto.includes('no entran en esta lista'));
  });

  it('un widget sin líneas muestra por qué está vacío', () => {
    const texto = textoDe(
      Widget({
        widget: {
          id: 'crm.follow_ups',
          title: 'Esperan respuesta',
          lines: [],
          emptyMessage: 'No hay presupuestos esperando respuesta.',
        },
      }),
    );

    assert.ok(texto.includes('No hay presupuestos esperando respuesta.'));
  });
});
