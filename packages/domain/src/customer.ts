/**
 * Qué hace falta para dar de alta un cliente.
 *
 * Vive acá y no en el dominio comercial por una razón concreta: el navegador
 * tiene que poder ejecutar estas mismas reglas. `@nci/domain` no depende de la
 * base ni de la red, así que es el único paquete que puede viajar al cliente
 * sin arrastrar nada detrás. La alternativa —escribir la validación dos veces—
 * termina siempre igual: las dos versiones se separan y la del navegador dice
 * que sí a algo que el servidor rechaza.
 *
 * **Dos campos obligatorios y ninguno más.** El nombre y un canal por donde
 * contactarlo. CUIT, condición de IVA, límite de crédito y condición de pago
 * son datos que Tango necesita para facturar y NCI no necesita para cotizar
 * (D-001). Se pueden cargar y no se exigen: pedirlos antes de dejar trabajar
 * es el reflejo de ERP que este producto no copia — un vendedor que no puede
 * avanzar vuelve al cuaderno, y ahí el dato no se recupera nunca.
 */

/** Lo que se puede cargar de un cliente al darlo de alta. */
export interface CustomerDraft {
  readonly legalName: string;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly whatsapp?: string | undefined;
  /** CUIT o documento. Lo necesita Tango para facturar, no NCI para cotizar. */
  readonly taxId?: string | undefined;
  /** 'constructora' | 'industria' | 'distribuidor' | 'particular' */
  readonly segment?: string | undefined;
  /**
   * Días de plazo de pago. Opcional al dar de alta.
   *
   * Se exige recién al emitir el presupuesto, no antes: ver D-013.
   */
  readonly paymentTermsDays?: number | null | undefined;
}

/**
 * Un problema concreto, dicho como lo diría una persona.
 *
 * `reason` no es decoración: el Principio 18 del PDL pide que el error enseñe.
 * "Falta el nombre" no explica nada; "sin nombre no se lo puede encontrar
 * después" sí.
 */
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
  readonly reason: string;
}

/** Los canales por los que se puede contactar a alguien. */
export const CONTACT_CHANNELS = ['email', 'phone', 'whatsapp'] as const;

const MIN_NAME = 2;
const MAX_PAYMENT_TERMS = 365;

/** Un correo con la forma mínima. No valida que exista, sólo que sea uno. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function limpio(valor: string | null | undefined): string {
  return (valor ?? '').trim();
}

/**
 * Los problemas de un alta de cliente. Vacío significa que se puede guardar.
 *
 * Devuelve todos los problemas juntos y no el primero: corregir de a uno,
 * enviando el formulario cada vez para descubrir el siguiente, es la forma más
 * rápida de que alguien abandone.
 */
export function validateCustomer(draft: CustomerDraft): FieldIssue[] {
  const problemas: FieldIssue[] = [];

  const nombre = limpio(draft.legalName);
  if (nombre.length < MIN_NAME) {
    problemas.push({
      field: 'legalName',
      message: 'Falta el nombre del cliente.',
      reason: 'Es lo único con lo que se lo va a poder encontrar después.',
    });
  }

  const email = limpio(draft.email);
  const telefono = limpio(draft.phone);
  const whatsapp = limpio(draft.whatsapp);

  if (email.length === 0 && telefono.length === 0 && whatsapp.length === 0) {
    problemas.push({
      field: 'contacto',
      message: 'Falta un canal de contacto.',
      reason:
        'Un cliente sin forma de contactarlo no sirve para trabajar: alcanza con un correo, un teléfono o un WhatsApp.',
    });
  }

  if (email.length > 0 && !EMAIL.test(email)) {
    problemas.push({
      field: 'email',
      message: 'El correo no tiene una forma válida.',
      reason: 'Revisá que esté completo, con arroba y dominio.',
    });
  }

  const plazo = draft.paymentTermsDays;
  if (plazo !== undefined && plazo !== null) {
    if (!Number.isInteger(plazo) || plazo < 0 || plazo > MAX_PAYMENT_TERMS) {
      problemas.push({
        field: 'paymentTermsDays',
        message: `El plazo de pago tiene que ser un número entero de días, entre 0 y ${MAX_PAYMENT_TERMS}.`,
        reason: 'Cero es pago contra entrega. La base rechaza cualquier otra cosa.',
      });
    }
  }

  return problemas;
}

/**
 * Si dos nombres son lo bastante parecidos como para sospechar que son el
 * mismo cliente escrito de dos formas.
 *
 * Se sugiere, no se impide: el vendedor sabe cosas que el sistema no. Lo que
 * se busca es que no cree "Constructora del Litoral SA" al lado de
 * "Constructora del Litoral S.A." sin enterarse.
 */
export function looksLikeSameCustomer(a: string, b: string): boolean {
  const reducir = (valor: string) =>
    valor
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Formas societarias y puntuación: lo que más varía entre dos cargas
      // de la misma empresa.
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|sas|scs|ltda?)\b/g, '')
      .replace(/[^a-z0-9]/g, '');

  const izquierda = reducir(a);
  const derecha = reducir(b);

  if (izquierda.length === 0 || derecha.length === 0) return false;

  return (
    izquierda === derecha ||
    izquierda.includes(derecha) ||
    derecha.includes(izquierda)
  );
}
