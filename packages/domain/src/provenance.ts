/**
 * De dónde salió un dato.
 *
 * Un nodo, una arista y un evento de actividad se afirman de la misma manera, y
 * quien lee el grafo no tiene que aprender tres idiomas. El vocabulario vive
 * acá y en ningún otro lado: las tres tablas construyen su restricción a partir
 * de esta lista.
 *
 * Ver D-007 y D-009.
 */

export const SOURCE_IDS = ['user', 'system', 'ai', 'integration'] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

/**
 * La procedencia que viene de afuera de la plataforma.
 *
 * Es la única que obliga a decir de qué sistema salió el dato y cuándo se leyó.
 * Una máquina inferida del historial de ventas de Tango no la infiere un
 * usuario, ni la lógica interna, ni la IA: la trae un sistema externo, y
 * `system` sería inexacto — describiría a NCI afirmando algo por su cuenta.
 */
export const EXTERNAL_SOURCE = 'integration' satisfies SourceId;

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

/**
 * La procedencia de un dato, con lo que exige cuando viene de afuera.
 *
 * Los dos campos externos van juntos y sólo con `integration`. Que sean
 * obligatorios es lo que hace aplicable D-001: Tango es dueño del dato, NCI lo
 * muestra con su fecha y deja visible que envejeció. Sin la fecha de lectura,
 * ese principio no alcanza a los datos que la plataforma dedujo.
 */
export type Provenance =
  | {
      readonly source: Exclude<SourceId, typeof EXTERNAL_SOURCE>;
      readonly sourceSystem?: never;
      readonly sourceReadAt?: never;
    }
  | {
      readonly source: typeof EXTERNAL_SOURCE;
      /** Qué integración lo produjo: `tango`. En minúsculas y estable. */
      readonly sourceSystem: string;
      /** Cuándo se leyó del sistema de origen. */
      readonly sourceReadAt: Date;
    };
