/**
 * Alta de cliente, en su propia pantalla.
 *
 * Es el segundo camino, no el principal: el primero es crearlo sin salir del
 * presupuesto. Existe para quien prefiere cargar primero y cotizar después, y
 * porque el Command Palette ya ofrecía "Nuevo cliente" y la ruta no existía.
 */

import { requireScope } from '@/lib/session';
import { NuevoCliente } from './nuevo-cliente';

export default async function NuevoClientePage(): Promise<React.ReactElement> {
  const scope = await requireScope();
  scope.actor.assertCanActOn('customer', 'create');

  return (
    <>
      <h1 className="page__greeting">Nuevo cliente</h1>
      <p className="page__lede">
        Alcanza con el nombre y una forma de contactarlo. Todo lo demás se puede completar cuando
        haga falta.
      </p>

      <section className="section">
        <NuevoCliente />
      </section>
    </>
  );
}
