/**
 * Búsqueda universal.
 *
 * "El usuario escribe: Concret D. El sistema devuelve producto, stock, ventas,
 *  documentos, videos, casos técnicos, procedimientos, consultas, compras,
 *  campañas. Todo relacionado. No importa dónde esté almacenado."
 */

import Link from 'next/link';

import { searchGrouped } from '@nci/core';
import { formatRelativeTime } from '@nci/design';
import { DOMAINS } from '@nci/domain';

import { requireScope } from '@/lib/session';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.ReactElement> {
  const scope = await requireScope();
  const { q } = await searchParams;
  const term = q?.trim() ?? '';

  const groups = term.length >= 2 ? await searchGrouped(scope, term) : [];
  const total = groups.reduce((sum, group) => sum + group.hits.length, 0);

  return (
    <>
      <h1 className="page__greeting">Buscar</h1>
      <p className="page__lede">
        Escribí lo que necesitás. No importa en qué dominio esté guardado.
      </p>

      <form className="section" method="get">
        <input
          className="palette__input"
          style={{
            width: '100%',
            border: '1px solid var(--nci-border-strong)',
            borderRadius: 'var(--nci-radius)',
            background: 'var(--nci-surface-raised)',
          }}
          type="search"
          name="q"
          defaultValue={term}
          placeholder="Concret D, Cliente XYZ, pulido espejo…"
          aria-label="Buscar en toda la plataforma"
        />
      </form>

      {term.length >= 2 && total === 0 && (
        <p className="page__lede">
          Busqué «{term}» en todo lo que podés consultar y no encontré nada. Puede que esté escrito
          de otra forma, o que todavía no exista en la plataforma. Probá con un término más general,
          o creá el elemento desde <kbd>Ctrl</kbd> + <kbd>K</kbd>.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.domain} className="section">
          <h2 className="section__title">{DOMAINS[group.domain].name}</h2>
          <ul className="related">
            {group.hits.map((hit) => (
              <li key={hit.id} className="related__item">
                <Link href={`/e/${hit.type}/${hit.slug}`}>
                  <span className="related__name">{hit.displayName}</span>
                  <span className="related__relation">
                    {hit.typeName}
                    {hit.subtitle && ` · ${hit.subtitle}`}
                    {hit.status && ` · ${hit.status}`} · actualizado{' '}
                    {formatRelativeTime(hit.updatedAt).toLowerCase()} · coincidencia {hit.matchedBy}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
