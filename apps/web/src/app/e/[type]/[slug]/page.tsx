/**
 * La vista de una entidad.
 *
 * "Imaginá abrir Concret D. No estarías viendo una ficha. Estarías viendo todo
 *  el universo relacionado con ese producto."
 *
 * Una sola página sirve a las treinta entidades del modelo. Eso no es economía
 * de código: es el Principio 12 del PDL — una entidad tiene una identidad, el
 * usuario aprende la estructura una vez y después reconoce cualquier cosa.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getEntityBySlug, getEntityUniverse, isNciError } from '@nci/core';
import { formatRelativeTime } from '@nci/design';
import { ENTITY_TYPES, isEntityTypeId } from '@nci/domain';

import { Notice } from '@/components/notice';
import { requireScope } from '@/lib/session';

export default async function EntityPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { type, slug } = await params;
  if (!isEntityTypeId(type)) notFound();

  const scope = await requireScope();

  try {
    const entity = await getEntityBySlug(scope, type, slug);
    const universe = await getEntityUniverse(scope, entity.id);

    return (
      <>
        <p className="page__breadcrumb">
          <Link href="/">Escritorio</Link>
          <span>·</span>
          <Link href={`/buscar?dominio=${ENTITY_TYPES[type].domain}`}>
            {universe.meaning.domainName}
          </Link>
          <span>·</span>
          <span>{universe.meaning.typeName}</span>
        </p>

        <header className="identity">
          <p className="identity__type">{universe.meaning.typeName}</p>
          <h1 className="identity__name">{entity.displayName}</h1>
          {entity.subtitle && <p className="identity__subtitle">{entity.subtitle}</p>}

          <div className="identity__meta">
            {entity.status && <span>Estado: {entity.status}</span>}
            <span>Dominio: {universe.meaning.domainName}</span>
            <span>Actualizado {formatRelativeTime(entity.updatedAt).toLowerCase()}</span>
            {/* Archivar es sacar de la vista, no borrar. Que se diga, porque
                explica por qué esto no aparece en las búsquedas. */}
            {entity.archivedAt && (
              <span>Archivado {formatRelativeTime(entity.archivedAt).toLowerCase()}</span>
            )}
          </div>

          {/* Qué es esta entidad en el lenguaje del negocio, no en el del sistema. */}
          <p className="identity__meaning">{universe.meaning.description}</p>
        </header>

        <section className="section">
          <h2 className="section__title">Todo lo relacionado</h2>

          {universe.sections.length === 0 ? (
            <p className="page__lede">
              Todavía no hay nada relacionado con {entity.displayName}. A medida que se carguen
              documentos, procedimientos, movimientos o consultas, aparecerán acá sin que haya que
              vincularlos a mano desde cada pantalla.
            </p>
          ) : (
            <div className="universe">
              {universe.sections.map((section) => (
                <div key={section.domain}>
                  <h3 className="section__title">{section.title}</h3>
                  <ul className="related">
                    {section.nodes.map((node) => (
                      <li key={node.id} className="related__item">
                        <Link href={`/e/${node.type}/${node.slug}`}>
                          <span className="related__name">{node.displayName}</span>
                          <span className="related__relation">
                            {node.relationLabel}
                            {node.source === 'ai' && ' · relación sugerida por la IA'}
                            {node.status && ` · ${node.status}`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/*
            Dos avisos distintos, y por eso van separados. Uno se resuelve
            pidiendo permiso; el otro, ampliando la consulta. Presentarlos como
            una sola cifra dejaba al usuario sin saber cuál de las dos cosas le
            estaba pasando — y en el caso peor, sin saber que le pasaba alguna.

            De las tres situaciones posibles, la tercera —no hay más— no se
            enuncia: la ausencia de estos dos avisos ya la comunica.
          */}
          {universe.truncatedCount > 0 && (
            <p className="page__lede">
              Se muestran los primeros {universe.sections.reduce((n, s) => n + s.nodes.length, 0)}.
              Hay {universe.truncatedCount}{' '}
              {universe.truncatedCount === 1 ? 'elemento más' : 'elementos más'} relacionados con{' '}
              {entity.displayName} que sí podés consultar y no entraron en esta vista. Buscá por
              nombre para llegar a uno en particular.
            </p>
          )}

          {/*
            Se informa el número, nunca el contenido. Saber que hay algo que no
            se puede ver es distinto de creer que no existe.
          */}
          {universe.restrictedCount > 0 && (
            <p className="restricted">
              Hay {universe.restrictedCount}{' '}
              {universe.restrictedCount === 1 ? 'elemento relacionado' : 'elementos relacionados'}{' '}
              fuera de tu alcance de acceso. Si necesitás consultarlos para tu trabajo, podés
              solicitarlo al administrador del sistema.
            </p>
          )}
        </section>

        <section className="section">
          <h2 className="section__title">Línea de tiempo</h2>
          {universe.timeline.length === 0 ? (
            <p className="page__lede">Todavía no hay actividad registrada sobre esta entidad.</p>
          ) : (
            <ul className="timeline">
              {universe.timeline.map((event) => (
                <li key={event.id} className="timeline__event">
                  <span className="timeline__when">{formatRelativeTime(event.occurredAt)}</span>
                  <span>
                    {event.summary}
                    {event.source === 'ai' && <span className="timeline__source"> · IA</span>}
                    {event.source === 'integration' && (
                      <span className="timeline__source"> · Integración</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    );
  } catch (error) {
    // El error explica y ofrece una salida; no muestra un código.
    if (isNciError(error)) {
      return (
        <Notice
          title={error.message}
          reason={error.reason}
          actions={error.actions.map((action) => ({
            label: action.label,
            ...(action.href ? { href: action.href } : {}),
          }))}
        />
      );
    }
    throw error;
  }
}
