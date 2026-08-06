/**
 * Espacios.
 *
 * "No existen pantallas. Existen espacios de trabajo."
 *
 * Un espacio es un dominio visto desde el trabajo: lo que importa de él no es
 * qué tablas tiene sino qué preguntas responde. Por eso lo que se lista es
 * `answers` y no la lista de entidades — la lista de entidades es la respuesta
 * a "cómo está hecho", que es la pregunta de quien lo construye, no la de
 * quien lo usa.
 *
 * Cada espacio dice además cuánto hay cargado hoy y si esta persona puede
 * entrar. Un dominio sin permiso no se esconde: se muestra diciendo que hace
 * falta pedirlo. Saber que algo existe y no está a tu alcance es distinto de
 * creer que no existe.
 */

import { inArray, sql } from 'drizzle-orm';
import Link from 'next/link';

import { entities } from '@nci/db';
import {
  DOMAINS,
  DOMAIN_IDS,
  entityTypesOfDomain,
  type DomainId,
  type EntityTypeId,
} from '@nci/domain';

import { requireScope } from '@/lib/session';

export default async function EspaciosPage(): Promise<React.ReactElement> {
  const scope = await requireScope();

  // Cuánto hay cargado, por tipo. Una sola consulta agregada: contar por
  // dominio en la aplicación exigiría traerse las entidades enteras.
  const conteos = await scope.db
    .select({ type: entities.type, cuantas: sql<number>`count(*)::int` })
    .from(entities)
    .where(inArray(entities.type, [...DOMAIN_IDS.flatMap(tiposDe)]))
    .groupBy(entities.type);

  const porTipo = new Map(conteos.map((fila) => [fila.type, fila.cuantas]));

  // Los que no tienen superficie propia no son espacios de trabajo: identity
  // e ia se atraviesan desde otro lado, no se visitan.
  const espacios = DOMAIN_IDS.filter((id) => DOMAINS[id].userFacing);

  return (
    <>
      <header className="page__header">
        <h1 className="page__greeting">Espacios</h1>
        <p className="page__lede">
          Cada espacio reúne la información y las herramientas de una actividad. No hace falta
          entrar a uno para encontrar algo: la búsqueda universal cruza todos. Están acá para
          cuando lo que se necesita es el panorama de un área y no un dato en particular.
        </p>
      </header>

      <div className="cards">
        {espacios.map((id) => (
          <Espacio
            key={id}
            id={id}
            cargadas={tiposDe(id).reduce((total, tipo) => total + (porTipo.get(tipo) ?? 0), 0)}
            /* Con que pueda leer una de sus entidades, el espacio le sirve. */
            accesible={tiposDe(id).some((tipo) => scope.actor.canActOn(tipo, 'read'))}
          />
        ))}
      </div>
    </>
  );
}

function Espacio({
  id,
  cargadas,
  accesible,
}: {
  id: DomainId;
  cargadas: number;
  accesible: boolean;
}): React.ReactElement {
  const dominio = DOMAINS[id];

  const contenido = (
    <>
      <h2 className="card__title">{dominio.name}</h2>
      <p className="card__text">{dominio.responsibility}</p>

      <ul className="card__list">
        {dominio.answers.slice(0, 3).map((pregunta) => (
          <li key={pregunta}>{pregunta}</li>
        ))}
      </ul>

      {/* Nunca sólo un número: qué significa ese número acá. */}
      <span className="tag">{disponibilidad({ cargadas, accesible })}</span>
    </>
  );

  // Sin nada cargado no hay a dónde ir todavía, y sin permiso tampoco. En los
  // dos casos la tarjeta se muestra igual y explica por qué no lleva a nada.
  return accesible && cargadas > 0 ? (
    <Link className="card" href={`/buscar?dominio=${id}`}>
      {contenido}
    </Link>
  ) : (
    <div className="card card--pending">{contenido}</div>
  );
}

function disponibilidad({
  cargadas,
  accesible,
}: {
  cargadas: number;
  accesible: boolean;
}): string {
  if (!accesible) {
    return 'Fuera de tu alcance de acceso. Se solicita al administrador.';
  }
  if (cargadas === 0) {
    return 'Sin datos cargados todavía.';
  }
  return cargadas === 1 ? '1 elemento cargado' : `${cargadas} elementos cargados`;
}

/** Los tipos de entidad de un dominio. */
function tiposDe(id: DomainId): readonly EntityTypeId[] {
  return entityTypesOfDomain(id).map((tipo) => tipo.id);
}
