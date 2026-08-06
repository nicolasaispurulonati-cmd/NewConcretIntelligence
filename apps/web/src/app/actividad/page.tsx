/**
 * Actividad.
 *
 * Principio 10: el tiempo es visible. Quién, cuándo, qué cambió.
 *
 * El menú lateral ofrecía esta sección desde el principio y la ruta no
 * existía: se llegaba a un 404, que es la forma más directa de romper el
 * Principio 11. Lo que se muestra es la tabla `activity`, que ya venía
 * registrando todo y sólo se leía de a seis filas desde un widget.
 */

import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

import { activity, entities } from '@nci/db';
import { formatRelativeTime } from '@nci/design';

import { requireScope } from '@/lib/session';

/** Cuántos hechos entran en la página. */
const MAXIMO = 60;

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{ quien?: string }>;
}): Promise<React.ReactElement> {
  const scope = await requireScope();
  const { quien } = await searchParams;
  const soloMias = quien === 'yo';

  const base = scope.db
    .select({
      id: activity.id,
      summary: activity.summary,
      occurredAt: activity.occurredAt,
      actorName: activity.actorName,
      source: activity.source,
      sourceSystem: activity.sourceSystem,
      type: entities.type,
      slug: entities.slug,
      displayName: entities.displayName,
    })
    .from(activity)
    .leftJoin(entities, eq(entities.id, activity.entityId));

  const eventos = await (soloMias
    ? base.where(eq(activity.actorId, scope.actor.id))
    : base
  )
    .orderBy(desc(activity.occurredAt))
    .limit(MAXIMO);

  return (
    <>
      <header className="page__header">
        <h1 className="page__greeting">Actividad</h1>
        <p className="page__lede">
          Todo lo que pasó en la plataforma, en el orden en que pasó. Cada hecho dice quién lo
          produjo y sobre qué, y lo que hizo la IA o llegó de otro sistema se distingue de lo que
          hizo una persona.
        </p>
      </header>

      <nav className="notice__actions" aria-label="Filtrar la actividad">
        <Link className={soloMias ? 'button' : 'button button--primary'} href="/actividad">
          Toda la empresa
        </Link>
        <Link className={soloMias ? 'button button--primary' : 'button'} href="/actividad?quien=yo">
          Sólo la mía
        </Link>
      </nav>

      <section className="section">
        {eventos.length === 0 ? (
          <p className="page__lede">
            {soloMias
              ? 'Todavía no registraste actividad en la plataforma. Aparecerá acá en cuanto crees o modifiques algo.'
              : 'Todavía no hay actividad registrada. Aparecerá acá en cuanto alguien cree o modifique algo.'}
          </p>
        ) : (
          <ul className="timeline">
            {eventos.map((evento) => (
              <li key={evento.id} className="timeline__event">
                <span className="timeline__when">
                  {formatRelativeTime(evento.occurredAt)}
                  {' · '}
                  {procedencia(evento)}
                </span>
                <span>
                  {evento.summary}{' '}
                  {/* El hecho menciona una entidad; desde acá se llega a ella. */}
                  {evento.type && evento.slug && (
                    <Link href={`/e/${evento.type}/${evento.slug}`}>
                      {evento.displayName ?? 'Ver'}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {eventos.length === MAXIMO && (
          <p className="widget__asof">
            Se muestran los {MAXIMO} hechos más recientes. Para llegar a uno más viejo, buscá la
            entidad por nombre y mirá su línea de tiempo.
          </p>
        )}
      </section>
    </>
  );
}

/**
 * De dónde salió el hecho.
 *
 * Principio 14: nunca una caja negra. Una recomendación de la IA y una carga
 * manual no pesan lo mismo cuando alguien decide sobre ellas.
 */
function procedencia(evento: {
  source: string;
  sourceSystem: string | null;
  actorName: string;
}): string {
  if (evento.source === 'ai') return 'IA';
  if (evento.source === 'integration') return evento.sourceSystem ?? 'Integración';
  return evento.actorName;
}
