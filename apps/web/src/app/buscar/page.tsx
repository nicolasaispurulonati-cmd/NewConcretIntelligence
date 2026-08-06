/**
 * Búsqueda universal.
 *
 * "El usuario escribe: Concret D. El sistema devuelve producto, stock, ventas,
 *  documentos, videos, casos técnicos, procedimientos, consultas, compras,
 *  campañas. Todo relacionado. No importa dónde esté almacenado."
 *
 * Cada resultado dice por qué apareció. `matchedBy` viene del motor y hasta
 * ahora se imprimía crudo al final de una línea larga: "coincidencia
 * aproximada". Es información valiosa —explica por qué algo que no se escribió
 * igual está en la lista— y merece leerse como una frase.
 */

import Link from 'next/link';

import { searchGrouped } from '@nci/core';
import { formatRelativeTime } from '@nci/design';
import { DOMAINS, isDomainId, type DomainId } from '@nci/domain';

import { requireScope } from '@/lib/session';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dominio?: string }>;
}): Promise<React.ReactElement> {
  const scope = await requireScope();
  const { q, dominio } = await searchParams;
  const term = q?.trim() ?? '';

  // Se llega acá desde Espacios con un dominio y sin término: la pantalla
  // tiene que poder mostrar el espacio entero y no una búsqueda vacía.
  const filtro: DomainId | null = dominio && isDomainId(dominio) ? dominio : null;

  const groups =
    term.length >= 2
      ? await searchGrouped(scope, term, filtro ? { domains: [filtro] } : {})
      : [];
  const total = groups.reduce((sum, group) => sum + group.hits.length, 0);

  return (
    <>
      <header className="page__header">
        <h1 className="page__greeting">Buscar</h1>
        <p className="page__lede">
          Escribí lo que necesitás. No importa en qué dominio esté guardado.
          {filtro && ` Ahora mismo se busca sólo dentro de ${DOMAINS[filtro].name}.`}
        </p>
      </header>

      <form className="field" method="get" role="search">
        {filtro && <input type="hidden" name="dominio" value={filtro} />}
        <input
          type="search"
          name="q"
          defaultValue={term}
          placeholder="Concret D, Cliente XYZ, pulido espejo…"
          aria-label="Buscar en toda la plataforma"
          autoFocus
        />
        <p className="page__breadcrumb">
          {filtro ? (
            <>
              <Link href={`/buscar?q=${encodeURIComponent(term)}`}>
                Buscar en toda la plataforma
              </Link>
              <span>·</span>
              <Link href="/espacios">Volver a Espacios</Link>
            </>
          ) : (
            <span>
              También desde cualquier pantalla con Ctrl + K, que además ejecuta acciones.
            </span>
          )}
        </p>
      </form>

      {term.length < 2 && (
        <p className="page__lede">
          Con dos letras alcanza para empezar. Se busca por nombre exacto, por texto, por
          aproximación —para cuando está escrito distinto— y por significado.
        </p>
      )}

      {term.length >= 2 && total === 0 && (
        <p className="page__lede">
          Busqué «{term}» en todo lo que podés consultar y no encontré nada. Puede que esté escrito
          de otra forma, o que todavía no exista en la plataforma. Probá con un término más general,
          o creá el elemento desde <kbd>Ctrl</kbd> + <kbd>K</kbd>.
        </p>
      )}

      {total > 0 && (
        <p className="page__lede">
          {total === 1 ? '1 resultado' : `${total} resultados`} para «{term}», agrupados por
          dominio.
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
                    {formatRelativeTime(hit.updatedAt).toLowerCase()}
                  </span>
                  <span className="related__relation">{porQueAparece(hit.matchedBy)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Por qué este resultado está en la lista.
 *
 * Importa sobre todo en los dos últimos casos: un resultado que no contiene lo
 * que se escribió parece un error del buscador hasta que se explica que no lo
 * es.
 */
function porQueAparece(matchedBy: 'exacta' | 'texto' | 'aproximada' | 'significado'): string {
  switch (matchedBy) {
    case 'exacta':
      return 'Coincide exactamente con lo que buscaste.';
    case 'texto':
      return 'Contiene lo que buscaste.';
    case 'aproximada':
      return 'Se parece a lo que buscaste, aunque esté escrito distinto.';
    case 'significado':
      return 'Habla de lo mismo, aunque no use esas palabras.';
  }
}
