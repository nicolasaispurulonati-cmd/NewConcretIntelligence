'use client';

/**
 * El acceso a la búsqueda universal desde la cabecera.
 *
 * Es un botón y no un campo de texto. La cabecera tenía un input que no
 * buscaba nada: se podía escribir dentro y no pasaba nada, que es la forma
 * más rápida de enseñarle a alguien a desconfiar de la pantalla. Acá el
 * gesto es honesto — abre la paleta, que es donde se busca de verdad.
 */

import { ABRIR_PALETA } from '@/components/command-palette';
import { Icono } from '@/components/icono';

export function AbrirPaleta(): React.ReactElement {
  return (
    <button
      className="topbar__search"
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(ABRIR_PALETA))}
    >
      <Icono id="buscar" tamano={16} />
      <span>Buscá lo que necesites hacer</span>
      <kbd>Ctrl</kbd>
      <kbd>K</kbd>
    </button>
  );
}
