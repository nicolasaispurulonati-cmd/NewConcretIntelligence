'use client';

/**
 * Command Palette.
 *
 * "Todo el sistema se maneja desde allí."
 *
 * Es la navegación real de la plataforma: el menú lateral tiene cinco entradas
 * porque se espera que casi nadie lo use. Ctrl+K busca entidades y ejecuta
 * acciones desde cualquier lugar, sin que el usuario piense en qué módulo está
 * lo que necesita.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * El evento con el que cualquier parte de la interfaz pide abrir la paleta.
 *
 * Se expone como constante para que el disparador de la cabecera y el que
 * escucha acá no puedan quedar escritos distinto.
 */
export const ABRIR_PALETA = 'nci:abrir-paleta';

interface PaletteHit {
  readonly id: string;
  readonly type: string;
  readonly typeName: string;
  readonly domain: string;
  readonly href: string;
  readonly displayName: string;
  readonly subtitle: string | null;
}

interface QuickAction {
  readonly label: string;
  readonly href: string;
  readonly keywords: readonly string[];
}

/**
 * Quick Actions.
 *
 * "Desde cualquier lugar podrá escribir: Nuevo presupuesto. La acción aparece
 *  inmediatamente."
 */
const QUICK_ACTIONS: readonly QuickAction[] = [
  { label: 'Nuevo presupuesto', href: '/presupuesto/nuevo', keywords: ['presupuesto', 'cotizar', 'nuevo'] },
  { label: 'Registrar compra', href: '/e/purchase_order/nuevo', keywords: ['compra', 'orden', 'proveedor'] },
  { label: 'Consultar producto', href: '/buscar?tipo=product', keywords: ['producto', 'ficha', 'consultar'] },
  { label: 'Crear procedimiento', href: '/e/procedure/nuevo', keywords: ['procedimiento', 'crear', 'instructivo'] },
  { label: 'Analizar ventas', href: '/espacios/executive', keywords: ['ventas', 'analizar', 'indicadores'] },
  { label: 'Nuevo cliente', href: '/e/customer/nuevo', keywords: ['cliente', 'alta', 'nuevo'] },
];

export function CommandPalette(): React.ReactElement | null {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly PaletteHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions = QUICK_ACTIONS.filter((action) => {
    if (query.trim().length === 0) return true;
    const term = normalize(query);
    return (
      normalize(action.label).includes(term) ||
      action.keywords.some((keyword) => normalize(keyword).includes(term))
    );
  });

  const options = [
    ...actions.map((action) => ({ kind: 'action' as const, ...action })),
    ...hits.map((hit) => ({ kind: 'entity' as const, ...hit })),
  ];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
      if (event.key === 'Escape') setOpen(false);
    }

    function onAbrir(): void {
      setOpen(true);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(ABRIR_PALETA, onAbrir);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(ABRIR_PALETA, onAbrir);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery('');
      setHits([]);
      setActiveIndex(0);
    }
  }, [open]);

  // Se espera a que la persona deje de escribir: buscar en cada tecla castiga
  // la base y hace parpadear los resultados.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/buscar?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = (await response.json()) as { hits: PaletteHit[] };
          setHits(data.hits);
          setActiveIndex(0);
        }
      } catch {
        // Una búsqueda cancelada no es un error: la persona siguió escribiendo.
      } finally {
        setSearching(false);
      }
    }, 160);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      setOpen(false);
      router.push(option.href);
    },
    [options, router],
  );

  if (!open) return null;

  return (
    <div
      className="palette__backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar y ejecutar acciones">
        <input
          ref={inputRef}
          className="palette__input"
          type="text"
          value={query}
          placeholder="¿Qué necesitás hacer?"
          aria-label="Buscar en toda la plataforma"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, options.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(activeIndex);
            }
          }}
        />

        <ul className="palette__results">
          {actions.length > 0 && <li className="palette__group">Acciones rápidas</li>}
          {actions.map((action, index) => (
            <li key={action.href}>
              <button
                type="button"
                className="palette__option"
                data-active={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{action.label}</span>
              </button>
            </li>
          ))}

          {hits.length > 0 && <li className="palette__group">En la plataforma</li>}
          {hits.map((hit, index) => {
            const optionIndex = actions.length + index;
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  className="palette__option"
                  data-active={activeIndex === optionIndex}
                  onMouseEnter={() => setActiveIndex(optionIndex)}
                  onClick={() => choose(optionIndex)}
                >
                  <span>
                    {hit.displayName}
                    {hit.subtitle ? <span className="palette__option-type"> · {hit.subtitle}</span> : null}
                  </span>
                  <span className="palette__option-type">{hit.typeName}</span>
                </button>
              </li>
            );
          })}

          {/* Nunca "No encontré nada": se dice qué se buscó y qué se puede hacer. */}
          {options.length === 0 && !searching && query.trim().length >= 2 && (
            <li className="palette__empty">
              No hay resultados para «{query.trim()}» dentro de lo que podés consultar. Probá con otro
              término, o creá el elemento desde las acciones rápidas.
            </li>
          )}
        </ul>

        <div className="palette__footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> para moverte
          </span>
          <span>
            <kbd>Enter</kbd> para abrir
          </span>
          <span>
            <kbd>Esc</kbd> para cerrar
          </span>
        </div>
      </div>
    </div>
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
