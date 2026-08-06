'use client';

/**
 * Elegir el cliente, o crearlo sin irse.
 *
 * Apenas se elige uno se crea el borrador y se pasa a armarlo. El presupuesto
 * existe en la base desde ese momento: si el navegador se cierra, lo que sigue
 * no se pierde.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AltaDeCliente } from '@/components/alta-de-cliente';
import { iniciarPresupuesto } from '@/lib/acciones';

interface Opcion {
  readonly id: string;
  readonly displayName: string;
}

export function ElegirCliente({
  iniciales,
}: {
  iniciales: readonly Opcion[];
}): React.ReactElement {
  const router = useRouter();
  const [filtro, setFiltro] = useState('');
  const [creando, setCreando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const visibles = iniciales.filter((cliente) =>
    cliente.displayName.toLowerCase().includes(filtro.trim().toLowerCase()),
  );

  async function empezar(customerId: string): Promise<void> {
    setOcupado(true);
    setFalla(null);

    const resultado = await iniciarPresupuesto(customerId);
    if (resultado.ok) {
      router.push(`/presupuesto/${resultado.valor.slug}`);
      return;
    }

    setOcupado(false);
    setFalla(`${resultado.message} ${resultado.reason}`.trim());
  }

  if (creando) {
    return (
      <div className="alta">
        <p className="alta__ayuda">
          Se crea el cliente y se sigue con el presupuesto, sin volver atrás.
        </p>
        <AltaDeCliente nombreInicial={filtro} onCreado={(cliente) => void empezar(cliente.id)} />
        <button className="armar__quitar" type="button" onClick={() => setCreando(false)}>
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <div className="alta">
      <label className="alta__campo">
        <span className="font-label-caps">Cliente</span>
        <input
          value={filtro}
          placeholder="Buscá por nombre"
          onChange={(evento) => setFiltro(evento.target.value)}
          autoFocus
        />
      </label>

      {visibles.length > 0 ? (
        <ul className="armar__catalogo">
          {visibles.map((cliente) => (
            <li key={cliente.id}>
              <button type="button" disabled={ocupado} onClick={() => void empezar(cliente.id)}>
                <span>{cliente.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="alta__ayuda">
          Ningún cliente coincide con lo que escribiste. Puede ser que todavía no esté cargado.
        </p>
      )}

      {falla && <p className="alta__problema">{falla}</p>}

      <button className="button" type="button" onClick={() => setCreando(true)}>
        Crear un cliente nuevo
      </button>
    </div>
  );
}
