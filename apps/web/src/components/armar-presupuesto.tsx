'use client';

/**
 * Armar un presupuesto.
 *
 * El borrador ya existe en la base antes de que esta pantalla se muestre: se
 * creó al elegir el cliente. Todo lo que se hace acá se guarda en el momento,
 * renglón por renglón. Un formulario que sólo guarda al final es el que hace
 * que se prefiera el cuaderno, donde lo escrito queda escrito.
 *
 * Los importes se leen y se muestran con las funciones de `@nci/domain`, que
 * son literalmente las mismas que usa el servidor para calcular el total.
 */

import { useEffect, useRef, useState } from 'react';

import { formatMoney, parseMoney } from '@nci/domain';

import {
  agregarRenglon,
  buscarArticulos,
  definirCondicionDePago,
  emitirPresupuesto,
  quitarRenglon,
  type ArticuloVista,
} from '@/lib/acciones';
import { esEditable, type PresupuestoVista } from '@/lib/presupuesto';

interface Falla {
  readonly message: string;
  readonly reason: string;
  readonly field?: string | undefined;
}

/** Lo que se está por agregar, mientras se completa. */
interface Borrador {
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio: string;
  descuento: string;
  /** La moneda del precio que trajo el catálogo, si vino de ahí. */
  monedaOrigen?: string | undefined;
}

const VACIO: Borrador = {
  descripcion: '',
  cantidad: '1',
  unidad: 'unidad',
  precio: '',
  descuento: '',
};

export function ArmarPresupuesto({
  inicial,
  clienteId,
  clienteNombre,
}: {
  inicial: PresupuestoVista;
  clienteId: string | null;
  clienteNombre: string;
}): React.ReactElement {
  const [presupuesto, setPresupuesto] = useState(inicial);
  const [falla, setFalla] = useState<Falla | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const editable = esEditable(presupuesto);

  function aplicar(resultado: Awaited<ReturnType<typeof agregarRenglon>>): boolean {
    if (resultado.ok) {
      setPresupuesto(resultado.valor);
      setFalla(null);
      return true;
    }
    setFalla({ message: resultado.message, reason: resultado.reason, field: resultado.field });
    return false;
  }

  return (
    <div className="armar">
      <header className="armar__cabecera">
        <div>
          <p className="font-label-caps">
            {presupuesto.number}
            {presupuesto.version > 1 && ` · versión ${presupuesto.version}`}
          </p>
          <h2>{clienteNombre}</h2>
        </div>
        <p className="armar__moneda">
          {/* La moneda es del presupuesto entero, no del renglón. Ver D-003. */}
          Todo en {presupuesto.currency}
        </p>
      </header>

      {editable ? (
        <AgregarRenglon
          moneda={presupuesto.currency}
          ocupado={ocupado}
          onAgregar={async (borrador) => {
            setOcupado(true);
            const agregado = aplicar(
              await agregarRenglon(presupuesto.id, {
                description: borrador.descripcion.trim(),
                quantity: Number(borrador.cantidad.replace(',', '.')),
                unit: borrador.unidad,
                unitPrice: parseMoney(borrador.precio) ?? 0,
                ...(borrador.descuento ? { discountPercent: Number(borrador.descuento) } : {}),
                ...(borrador.monedaOrigen ? { priceCurrency: borrador.monedaOrigen } : {}),
              }),
            );
            setOcupado(false);
            return agregado;
          }}
        />
      ) : (
        <p className="armar__congelado">
          Este presupuesto está {presupuesto.status} y ya no se modifica. Para cambiar algo hay que
          crear una versión nueva, que queda relacionada con ésta.
        </p>
      )}

      <Renglones
        presupuesto={presupuesto}
        editable={editable}
        onQuitar={async (itemId) => {
          setOcupado(true);
          aplicar(await quitarRenglon(presupuesto.id, itemId));
          setOcupado(false);
        }}
      />

      <Totales presupuesto={presupuesto} />

      {falla && (
        <div className="armar__falla">
          <p className="alta__problema">{falla.message}</p>
          <p className="alta__ayuda">{falla.reason}</p>
          {/* El error que enseña: ofrece la acción que lo resuelve, en el
              lugar donde apareció. Ver D-013. */}
          {falla.field === 'paymentTermsDays' && clienteId && (
            <CondicionDePago
              clienteId={clienteId}
              onListo={async () => {
                setOcupado(true);
                aplicar(await emitirPresupuesto(presupuesto.id));
                setOcupado(false);
              }}
            />
          )}
        </div>
      )}

      {editable && (
        <button
          className="button button--primary"
          type="button"
          disabled={ocupado || presupuesto.items.length === 0}
          onClick={async () => {
            setOcupado(true);
            aplicar(await emitirPresupuesto(presupuesto.id));
            setOcupado(false);
          }}
        >
          Emitir presupuesto
        </button>
      )}

      {presupuesto.status === 'emitido' && (
        <p className="armar__ayuda">
          Emitido. Falta hacérselo llegar al cliente, que es un paso aparte y todavía no está
          construido.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function AgregarRenglon({
  moneda,
  ocupado,
  onAgregar,
}: {
  moneda: string;
  ocupado: boolean;
  onAgregar: (borrador: Borrador) => Promise<boolean>;
}): React.ReactElement {
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [articulos, setArticulos] = useState<readonly ArticuloVista[]>([]);
  const ultimaBusqueda = useRef(0);

  // Se busca mientras se escribe la descripción. Elegir un artículo completa
  // el renglón; no elegir ninguno lo deja libre, que es un caso real: un
  // flete, una mano de obra, algo que todavía no está en el catálogo.
  useEffect(() => {
    const termino = borrador.descripcion.trim();
    if (termino.length < 2) {
      setArticulos([]);
      return;
    }

    const propia = ++ultimaBusqueda.current;
    const espera = setTimeout(async () => {
      const resultado = await buscarArticulos(termino);
      if (propia !== ultimaBusqueda.current) return;
      setArticulos(resultado.ok ? resultado.valor : []);
    }, 250);

    return () => clearTimeout(espera);
  }, [borrador.descripcion]);

  const precioEnCentavos = parseMoney(borrador.precio);
  const cantidad = Number(borrador.cantidad.replace(',', '.'));
  const listo =
    borrador.descripcion.trim().length > 0 && precioEnCentavos !== null && cantidad > 0;

  function elegir(articulo: ArticuloVista): void {
    setBorrador((actual) => ({
      ...actual,
      descripcion: articulo.name,
      unidad: articulo.unit,
      precio: articulo.unitPrice === null ? '' : (articulo.unitPrice / 100).toFixed(2).replace('.', ','),
      ...(articulo.currency ? { monedaOrigen: articulo.currency } : {}),
    }));
    setArticulos([]);
  }

  return (
    <section className="armar__nuevo">
      <label className="alta__campo">
        <span className="font-label-caps">Producto o servicio</span>
        <input
          className="palette__input"
          value={borrador.descripcion}
          placeholder="Buscá en el catálogo, o escribí un renglón libre"
          onChange={(evento) =>
            setBorrador((actual) => ({
              ...actual,
              descripcion: evento.target.value,
              // Si se reescribe a mano, el precio deja de venir del catálogo.
              monedaOrigen: undefined,
            }))
          }
        />
      </label>

      {articulos.length > 0 && (
        <ul className="armar__catalogo">
          {articulos.map((articulo) => (
            <li key={articulo.sku}>
              <button type="button" onClick={() => elegir(articulo)}>
                <span>{articulo.name}</span>
                <span className="armar__catalogo-precio">
                  {articulo.unitPrice === null
                    ? 'sin precio en la lista'
                    : `${formatMoney(articulo.unitPrice, articulo.currency ?? moneda)} · ${articulo.unit}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="armar__campos">
        <Campo
          etiqueta="Cantidad"
          valor={borrador.cantidad}
          onCambio={(v) => setBorrador((a) => ({ ...a, cantidad: v }))}
        />
        <Campo
          etiqueta="Unidad"
          valor={borrador.unidad}
          onCambio={(v) => setBorrador((a) => ({ ...a, unidad: v }))}
        />
        <Campo
          etiqueta={`Precio unitario (${moneda})`}
          valor={borrador.precio}
          onCambio={(v) => setBorrador((a) => ({ ...a, precio: v }))}
        />
        <Campo
          etiqueta="Descuento %"
          valor={borrador.descuento}
          onCambio={(v) => setBorrador((a) => ({ ...a, descuento: v }))}
        />
      </div>

      <button
        className="button"
        type="button"
        disabled={!listo || ocupado}
        onClick={async () => {
          if (await onAgregar(borrador)) setBorrador(VACIO);
        }}
      >
        Agregar renglón
      </button>
    </section>
  );
}

function Renglones({
  presupuesto,
  editable,
  onQuitar,
}: {
  presupuesto: PresupuestoVista;
  editable: boolean;
  onQuitar: (itemId: string) => Promise<void>;
}): React.ReactElement {
  if (presupuesto.items.length === 0) {
    return <p className="armar__ayuda">Todavía no tiene renglones. El borrador ya está guardado.</p>;
  }

  return (
    <table className="armar__renglones">
      <thead>
        <tr>
          <th>Detalle</th>
          <th>Cantidad</th>
          <th>Precio</th>
          <th>Descuento</th>
          <th>Neto</th>
          {editable && <th />}
        </tr>
      </thead>
      <tbody>
        {presupuesto.items.map((item) => (
          <tr key={item.id}>
            <td>{item.description}</td>
            <td>
              {item.quantity} {item.unit}
            </td>
            <td>{formatMoney(item.unitPrice, presupuesto.currency)}</td>
            {/* El descuento por renglón se muestra siempre, también cuando es
                cero: que aparezca sólo a veces hace que su ausencia se lea
                como que no existe la posibilidad. */}
            <td>{item.discountPercent > 0 ? `${item.discountPercent} %` : '—'}</td>
            <td>{formatMoney(item.lineTotal, presupuesto.currency)}</td>
            {editable && (
              <td>
                <button type="button" className="armar__quitar" onClick={() => onQuitar(item.id)}>
                  Quitar
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totales({ presupuesto }: { presupuesto: PresupuestoVista }): React.ReactElement {
  const moneda = presupuesto.currency;

  return (
    <dl className="armar__totales">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatMoney(presupuesto.subtotal, moneda)}</dd>
      </div>
      {presupuesto.discountTotal > 0 && (
        <div>
          <dt>Descuentos</dt>
          <dd>− {formatMoney(presupuesto.discountTotal, moneda)}</dd>
        </div>
      )}
      <div>
        <dt>IVA</dt>
        <dd>{formatMoney(presupuesto.taxTotal, moneda)}</dd>
      </div>
      <div className="armar__total">
        <dt>Total</dt>
        <dd>{formatMoney(presupuesto.total, moneda)}</dd>
      </div>
      <div>
        <dt>Condición de pago</dt>
        <dd>
          {presupuesto.paymentTermsDays === null
            ? 'sin definir'
            : `${presupuesto.paymentTermsDays} días`}
        </dd>
      </div>
    </dl>
  );
}

/** El campo que resuelve el error de emisión sin salir de la pantalla. */
function CondicionDePago({
  clienteId,
  onListo,
}: {
  clienteId: string;
  onListo: () => Promise<void>;
}): React.ReactElement {
  const [dias, setDias] = useState('30');
  const [guardando, setGuardando] = useState(false);

  return (
    <div className="armar__remedio">
      <Campo etiqueta="Plazo de pago, en días" valor={dias} onCambio={setDias} />
      <button
        className="button"
        type="button"
        disabled={guardando}
        onClick={async () => {
          setGuardando(true);
          const guardado = await definirCondicionDePago(clienteId, Number(dias));
          if (guardado.ok) await onListo();
          setGuardando(false);
        }}
      >
        Guardar y emitir
      </button>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
}): React.ReactElement {
  return (
    <label className="alta__campo">
      <span className="font-label-caps">{etiqueta}</span>
      <input
        className="palette__input"
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
      />
    </label>
  );
}
