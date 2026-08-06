'use client';

/**
 * Qué hacer cuando el alta termina, en esta pantalla.
 *
 * El componente de alta no decide a dónde ir: lo decide quien lo embebe. Acá
 * se va a la ficha del cliente recién creado; en el flujo de presupuesto, en
 * cambio, se queda donde está y lo selecciona.
 */

import { useRouter } from 'next/navigation';

import { AltaDeCliente } from '@/components/alta-de-cliente';

export function NuevoCliente(): React.ReactElement {
  const router = useRouter();

  return (
    <AltaDeCliente
      onCreado={(cliente) => {
        router.push(`/e/customer/${cliente.slug}`);
      }}
    />
  );
}
