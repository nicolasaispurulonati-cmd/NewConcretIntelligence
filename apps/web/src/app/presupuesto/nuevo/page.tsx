/**
 * Empezar un presupuesto.
 *
 * El primer dato es el cliente, y si no existe se lo crea acá mismo: mandar a
 * alguien a otra pantalla en el medio de cotizar es la fricción que hace que
 * se vuelva al cuaderno. Es el motivo por el que el alta de cliente es un
 * componente y no una pantalla.
 *
 * Elegir el cliente crea el borrador. Desde ese momento lo que se cargue está
 * guardado.
 */

import { listCustomers } from '@nci/crm';

import { requireScope } from '@/lib/session';
import { ElegirCliente } from './elegir-cliente';

export default async function NuevoPresupuestoPage(): Promise<React.ReactElement> {
  const scope = await requireScope();
  scope.actor.assertCanActOn('quote', 'create');

  const clientes = await listCustomers(scope, { limit: 20 });

  return (
    <>
      <h1 className="page__greeting">Nuevo presupuesto</h1>
      <p className="page__lede">
        Empezá por el cliente. Si es nuevo, se puede crear acá sin perder lo que estás haciendo.
      </p>

      <section className="section">
        <ElegirCliente
          iniciales={clientes.map((cliente) => ({
            id: cliente.id,
            displayName: cliente.displayName,
          }))}
        />
      </section>
    </>
  );
}
