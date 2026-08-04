/**
 * Errores que enseñan.
 *
 * Principio 18 del PDL: nunca "Error 500". Un error dice qué pasó, por qué, y
 * ofrece la acción que lo resuelve. Por eso todo error del sistema lleva esas
 * tres cosas como campos y no como un texto suelto: la interfaz puede
 * mostrarlos, la IA puede explicarlos y la auditoría puede registrarlos.
 */

export interface RemedyAction {
  /** "Configurar condición de pago". */
  readonly label: string;
  /** A dónde lleva, cuando lleva a algún lado. */
  readonly href?: string;
  /** La capacidad que hace falta para poder ejecutarla. */
  readonly requires?: string;
}

export interface NciErrorDetails {
  /** Qué no se pudo hacer, en el lenguaje del negocio. */
  readonly message: string;
  /** Por qué no se pudo. Siempre presente: un error sin causa no enseña nada. */
  readonly reason: string;
  /** Qué puede hacer la persona al respecto. */
  readonly actions?: readonly RemedyAction[];
  readonly cause?: unknown;
}

export abstract class NciError extends Error {
  abstract readonly code: string;
  /** Código HTTP sugerido. La capa de transporte decide, pero éste es el correcto. */
  abstract readonly httpStatus: number;

  readonly reason: string;
  readonly actions: readonly RemedyAction[];

  constructor(details: NciErrorDetails) {
    super(details.message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = new.target.name;
    this.reason = details.reason;
    this.actions = details.actions ?? [];
  }

  /** La forma en que el error viaja al cliente y a la auditoría. */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      reason: this.reason,
      actions: this.actions,
    };
  }
}

/**
 * El usuario no tiene la capacidad necesaria.
 *
 * El mensaje se redacta desde la capacidad que falta, no desde la ruta que
 * intentó tocar: "No posee permisos para consultar información financiera" y
 * no "403 en /api/reports/margin". Es exactamente la respuesta que el
 * documento de roles espera cuando Marketing pregunta por el margen bruto.
 */
export class NotAuthorizedError extends NciError {
  readonly code = 'not_authorized';
  readonly httpStatus = 403;
  readonly missingCapability: string;

  constructor(params: {
    missingCapability: string;
    /** "consultar información financiera" — se arma desde el catálogo. */
    inHumanTerms: string;
    actions?: readonly RemedyAction[];
  }) {
    super({
      message: `No posee permisos para ${params.inHumanTerms}.`,
      reason:
        'Los permisos se asignan por responsabilidad. Si necesita este acceso para su trabajo, puede solicitarlo al administrador del sistema.',
      actions: params.actions ?? [
        { label: 'Solicitar acceso', requires: params.missingCapability },
      ],
    });
    this.missingCapability = params.missingCapability;
  }
}

/** No hay sesión, o venció. */
export class NotAuthenticatedError extends NciError {
  readonly code = 'not_authenticated';
  readonly httpStatus = 401;

  constructor() {
    super({
      message: 'La sesión no está activa.',
      reason: 'La sesión venció o se cerró desde otro dispositivo.',
      actions: [{ label: 'Iniciar sesión', href: '/ingresar' }],
    });
  }
}

/**
 * Lo que se buscó no existe — o existe y la persona no puede verlo.
 *
 * Se responde igual en ambos casos a propósito: distinguirlos le confirmaría a
 * quien no tiene permiso que el dato existe, y eso ya es información.
 */
export class NotFoundError extends NciError {
  readonly code = 'not_found';
  readonly httpStatus = 404;

  constructor(what: string) {
    super({
      message: `No se encontró ${what}.`,
      reason: 'Puede haberse archivado, o puede estar fuera de su alcance de acceso.',
      actions: [{ label: 'Buscar en toda la plataforma', href: '/buscar' }],
    });
  }
}

/** Los datos no cumplen una regla del negocio. */
export class ValidationError extends NciError {
  readonly code = 'validation_failed';
  readonly httpStatus = 422;
  readonly field: string | undefined;

  constructor(params: {
    message: string;
    reason: string;
    field?: string;
    actions?: readonly RemedyAction[];
  }) {
    super({
      message: params.message,
      reason: params.reason,
      ...(params.actions ? { actions: params.actions } : {}),
    });
    this.field = params.field;
  }
}

/**
 * La acción es posible pero tiene consecuencias que la persona todavía no vio.
 *
 * Principio 3 del PDL: primero comprender, después actuar. En lugar de un botón
 * "Borrar", el sistema responde "Este documento está relacionado con 14
 * procedimientos" y recién entonces pregunta si desea continuar.
 */
export class ConfirmationRequiredError extends NciError {
  readonly code = 'confirmation_required';
  readonly httpStatus = 409;
  /** Lo que la persona necesita saber antes de decidir. */
  readonly consequences: readonly string[];
  /** Se reenvía la misma petición con este token para confirmar. */
  readonly confirmationToken: string;

  constructor(params: {
    message: string;
    consequences: readonly string[];
    confirmationToken: string;
  }) {
    super({
      message: params.message,
      reason: params.consequences.join(' '),
      actions: [{ label: 'Confirmar y continuar' }, { label: 'Cancelar' }],
    });
    this.consequences = params.consequences;
    this.confirmationToken = params.confirmationToken;
  }
}

export function isNciError(error: unknown): error is NciError {
  return error instanceof NciError;
}
