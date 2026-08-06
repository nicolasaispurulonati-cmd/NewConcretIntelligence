/**
 * Armar un presupuesto.
 *
 * El borrador ya existe cuando se llega acá: se creó al elegir el cliente, en
 * `/presupuesto/nuevo`. Esta pantalla carga lo que hay y deja seguir.
 *
 * La ficha de sólo lectura del presupuesto sigue viviendo en `/e/quote/<slug>`,
 * como la de cualquier otra entidad. Ésta es la de trabajo.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getEntityBySlug, getRelated, isNciError } from '@nci/core';
import { loadQuote } from '@nci/sales';

import { ArmarPresupuesto } from '@/components/armar-presupuesto';
import { comoVista } from '@/lib/presupuesto';
import { requireScope } from '@/lib/session';

export default async function ArmarPresupuestoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  const scope = await requireScope();

  try {
    const entity = await getEntityBySlug(scope, 'quote', slug);
    const quote = await loadQuote(scope, entity.id);

    // A qué cliente se le cotiza vive en el grafo, no en una clave foránea.
    const [cliente] = await getRelated(scope, entity.id, { types: ['quoted_to'], limit: 1 });

    return (
      <>
        <p className="page__lede">
          <Link href="/">Escritorio</Link> · <Link href={`/e/quote/${slug}`}>Ficha</Link>
        </p>

        <section className="section">
          <ArmarPresupuesto
            inicial={comoVista(quote)}
            clienteId={cliente?.id ?? null}
            clienteNombre={cliente?.displayName ?? entity.subtitle ?? 'Sin cliente'}
          />
        </section>
      </>
    );
  } catch (error) {
    if (isNciError(error)) notFound();
    throw error;
  }
}
