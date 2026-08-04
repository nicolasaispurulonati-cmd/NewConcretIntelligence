/**
 * Métricas con contexto.
 *
 * Principio 2 del PDL: nunca mostrar únicamente un número. El dato aislado
 * tiene poco valor; lo que decide es la comparación.
 *
 * Igual que con los estados, la regla está en el tipo: una métrica sin al menos
 * un dato de contexto no se puede construir.
 */

export interface MetricContextLine {
  readonly label: string;
  readonly value: string;
}

export interface Metric {
  readonly label: string;
  readonly value: string;
  /** Al menos uno. Sin contexto no hay métrica, hay un número suelto. */
  readonly context: readonly [MetricContextLine, ...MetricContextLine[]];
  /** Variación contra el período anterior, cuando existe uno. */
  readonly trend?: { readonly direction: 'up' | 'down' | 'flat'; readonly label: string };
  /** Cuándo se calculó. Principio 10: el tiempo es visible. */
  readonly asOf: Date;
}

export function metric(params: {
  label: string;
  value: string;
  context: readonly MetricContextLine[];
  trend?: Metric['trend'];
  asOf?: Date;
}): Metric {
  const [first, ...rest] = params.context;
  if (!first) {
    throw new Error(
      `La métrica "${params.label}" no tiene contexto. Un número aislado no ayuda a decidir nada.`,
    );
  }
  return {
    label: params.label,
    value: params.value,
    context: [first, ...rest],
    ...(params.trend ? { trend: params.trend } : {}),
    asOf: params.asOf ?? new Date(),
  };
}

const CURRENCY = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const NUMBER = new Intl.NumberFormat('es-AR');

export function formatCurrency(value: number): string {
  return CURRENCY.format(value);
}

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${NUMBER.format(rounded)} %`;
}

/**
 * Tiempo relativo, en el registro del sistema.
 *
 * "Hace 2 horas", no "2h". La plataforma habla como un profesional, no como
 * una notificación de teléfono.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Recién';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return minutes === 1 ? 'Hace un minuto' : `Hace ${minutes} minutos`;
  }
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600);
    return hours === 1 ? 'Hace una hora' : `Hace ${hours} horas`;
  }

  const days = Math.floor(seconds / 86_400);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Hace una semana' : `Hace ${weeks} semanas`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? 'Hace un mes' : `Hace ${months} meses`;
  }

  const years = Math.floor(days / 365);
  return years === 1 ? 'Hace un año' : `Hace ${years} años`;
}
