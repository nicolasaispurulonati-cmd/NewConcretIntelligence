'use client';

/**
 * El alta de un cliente.
 *
 * Está en un componente y no en una pantalla porque tiene que poder aparecer
 * en dos lugares: en su propia página, para quien la prefiera, y dentro del
 * flujo de presupuesto sin salir de él. El centro del trabajo comercial es la
 * conversación, no la ficha, y mandar a alguien a otra pantalla en el medio de
 * cotizar es la fricción que hace que se vuelva al cuaderno.
 *
 * Las reglas de validación no están acá: se importan de `@nci/domain`, que es
 * el mismo módulo que ejecuta el servidor. Escribirlas dos veces termina
 * siempre igual — la del navegador dice que sí a algo que el servidor rechaza.
 */

import { useEffect, useRef, useState } from 'react';

import { looksLikeSameCustomer, validateCustomer, type FieldIssue } from '@nci/domain';

import { crearCliente, type ClienteCreado } from '@/lib/acciones';

interface Parecido {
  readonly id: string;
  readonly displayName: string;
  readonly href: string;
  readonly probablyTheSame: boolean;
}

export function AltaDeCliente({
  onCreado,
  nombreInicial = '',
}: {
  /** Qué hacer con el cliente recién creado. Lo decide quien embebe esto. */
  onCreado: (cliente: ClienteCreado) => void;
  nombreInicial?: string;
}): React.ReactElement {
  const [legalName, setLegalName] = useState(nombreInicial);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('');

  const [parecidos, setParecidos] = useState<readonly Parecido[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  /** Hasta que no se intenta guardar, no se marca nada en rojo. */
  const [intentado, setIntentado] = useState(false);

  const draft = {
    legalName,
    email,
    phone,
    taxId,
    paymentTermsDays: paymentTermsDays === '' ? null : Number(paymentTermsDays),
  };

  const problemas = validateCustomer(draft);
  const problemaDe = (field: string): FieldIssue | undefined =>
    intentado ? problemas.find((p) => p.field === field) : undefined;

  // ── Duplicados ──────────────────────────────────────────────────────
  // Se consultan mientras se escribe y no bloquean nada. Un vendedor apurado
  // que no puede avanzar porque el sistema sospecha vuelve al cuaderno.
  const ultimaBusqueda = useRef(0);

  useEffect(() => {
    const termino = legalName.trim();
    if (termino.length < 3) {
      setParecidos([]);
      return;
    }

    const propia = ++ultimaBusqueda.current;
    const espera = setTimeout(async () => {
      try {
        const respuesta = await fetch(
          `/api/buscar?tipo=customer&q=${encodeURIComponent(termino)}`,
        );
        if (!respuesta.ok) return;

        const { hits } = (await respuesta.json()) as {
          hits: { id: string; displayName: string; href: string }[];
        };

        // Una respuesta vieja no puede pisar a una nueva.
        if (propia !== ultimaBusqueda.current) return;

        setParecidos(
          hits.map((hit) => ({
            ...hit,
            // La misma regla que usa el servidor, del mismo módulo.
            probablyTheSame: looksLikeSameCustomer(hit.displayName, termino),
          })),
        );
      } catch {
        // Que la sugerencia falle no puede impedir dar de alta a nadie.
        setParecidos([]);
      }
    }, 300);

    return () => clearTimeout(espera);
  }, [legalName]);

  async function guardar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    setIntentado(true);
    setFalla(null);

    if (problemas.length > 0) return;

    setEnviando(true);
    const resultado = await crearCliente({
      legalName: legalName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      taxId: taxId.trim() || undefined,
      paymentTermsDays: paymentTermsDays === '' ? null : Number(paymentTermsDays),
    });
    setEnviando(false);

    if (resultado.ok) {
      onCreado(resultado.valor);
      return;
    }

    setFalla(`${resultado.message} ${resultado.reason}`.trim());
  }

  return (
    <form className="alta" onSubmit={guardar} noValidate>
      <Campo
        etiqueta="Nombre"
        valor={legalName}
        onCambio={setLegalName}
        problema={problemaDe('legalName')}
        autoFocus
      />

      {parecidos.length > 0 && (
        <div className="alta__parecidos">
          <p className="font-label-caps">
            {parecidos.some((p) => p.probablyTheSame)
              ? 'Puede que ya exista'
              : 'Clientes con nombre parecido'}
          </p>
          <ul>
            {parecidos.map((parecido) => (
              <li key={parecido.id}>
                <a href={parecido.href}>{parecido.displayName}</a>
                {parecido.probablyTheSame && ' · muy parecido'}
              </li>
            ))}
          </ul>
          <p className="alta__ayuda">
            Si es otro cliente, seguí. Nadie te va a impedir crearlo.
          </p>
        </div>
      )}

      <div className="alta__par">
        <Campo etiqueta="Teléfono" valor={phone} onCambio={setPhone} />
        <Campo etiqueta="Correo" valor={email} onCambio={setEmail} problema={problemaDe('email')} />
      </div>

      {problemaDe('contacto') && (
        <p className="alta__problema">
          {problemaDe('contacto')!.message} {problemaDe('contacto')!.reason}
        </p>
      )}

      <details className="alta__opcional">
        <summary>Datos para facturar</summary>
        <p className="alta__ayuda">
          Los necesita Tango para facturar, no NCI para cotizar. Se pueden cargar ahora o después.
        </p>
        <div className="alta__par">
          <Campo etiqueta="CUIT" valor={taxId} onCambio={setTaxId} />
          <Campo
            etiqueta="Plazo de pago, en días"
            valor={paymentTermsDays}
            onCambio={setPaymentTermsDays}
            problema={problemaDe('paymentTermsDays')}
          />
        </div>
      </details>

      {falla && <p className="alta__problema">{falla}</p>}

      <button className="button button--primary" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Crear cliente'}
      </button>
    </form>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambio,
  problema,
  autoFocus,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  problema?: FieldIssue | undefined;
  autoFocus?: boolean;
}): React.ReactElement {
  return (
    <label className="alta__campo">
      <span className="font-label-caps">{etiqueta}</span>
      <input
        className="palette__input"
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        autoFocus={autoFocus}
      />
      {/* El error explica, no sólo señala: Principio 18 del PDL. */}
      {problema && (
        <span className="alta__problema">
          {problema.message} {problema.reason}
        </span>
      )}
    </label>
  );
}
