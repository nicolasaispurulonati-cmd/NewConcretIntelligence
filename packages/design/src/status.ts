/**
 * Estados.
 *
 * Principio 8 del PDL: el sistema siempre explica el estado. Nunca un círculo
 * verde a secas — "Disponible. Stock para 28 días."
 *
 * El tipo lo hace obligatorio: no existe forma de construir un estado sin
 * etiqueta. El color es opcional y decorativo; la palabra no.
 */

export type StatusTone = 'ok' | 'attention' | 'critical' | 'neutral';

export interface StatusDescriptor {
  /** La palabra. Siempre presente. */
  readonly label: string;
  /** Qué significa, en concreto. Es lo que convierte un estado en información. */
  readonly detail: string;
  /** Refuerza la etiqueta. Nunca la reemplaza. */
  readonly tone: StatusTone;
}

export function describeStatus(params: {
  label: string;
  detail: string;
  tone?: StatusTone;
}): StatusDescriptor {
  if (params.label.trim().length === 0) {
    throw new Error('Un estado sin etiqueta comunica sólo con color, y el PDL lo prohíbe.');
  }
  if (params.detail.trim().length === 0) {
    throw new Error(
      `El estado "${params.label}" no explica nada. El sistema siempre explica, no sólo informa.`,
    );
  }
  return { label: params.label, detail: params.detail, tone: params.tone ?? 'neutral' };
}

export const STATUS_TONE_VARIABLE: Readonly<Record<StatusTone, string>> = {
  ok: 'var(--nci-state-ok)',
  attention: 'var(--nci-state-attention)',
  critical: 'var(--nci-state-critical)',
  neutral: 'var(--nci-state-neutral)',
};

/**
 * Cobertura de stock expresada como estado.
 *
 * Es el ejemplo canónico del PDL y por eso vive acá: cualquier dominio que
 * muestre disponibilidad usa esta función y obtiene la misma frase.
 */
export function describeStockCoverage(params: {
  quantity: number;
  unit: string;
  weeklyConsumption: number;
}): StatusDescriptor {
  const { quantity, unit, weeklyConsumption } = params;

  if (weeklyConsumption <= 0) {
    return describeStatus({
      label: 'Sin rotación',
      detail: `${quantity} ${unit} en depósito. No hay consumo registrado, así que no puede estimarse cobertura.`,
      tone: 'neutral',
    });
  }

  const days = Math.round((quantity / weeklyConsumption) * 7);

  if (days <= 7) {
    return describeStatus({
      label: 'Crítico',
      detail: `${quantity} ${unit}. El consumo promedio cubre unos ${days} días.`,
      tone: 'critical',
    });
  }

  if (days <= 21) {
    return describeStatus({
      label: 'Bajo',
      detail: `${quantity} ${unit}. El consumo promedio cubre unos ${days} días.`,
      tone: 'attention',
    });
  }

  return describeStatus({
    label: 'Disponible',
    detail: `${quantity} ${unit}. El consumo promedio cubre unos ${days} días.`,
    tone: 'ok',
  });
}
