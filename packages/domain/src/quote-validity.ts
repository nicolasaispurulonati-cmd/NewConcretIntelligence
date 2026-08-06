/**
 * Hasta cuándo vale un presupuesto.
 *
 * Un presupuesto es una promesa fechada, y una promesa sin fecha de
 * vencimiento es una promesa abierta: el cliente que la acepta seis meses
 * después tiene razón en reclamar el precio, porque el documento nunca dijo
 * lo contrario.
 *
 * Hasta esta sección el dato no existía. La columna `valid_until` estaba en el
 * esquema desde el principio y **nadie la completaba nunca**, con dos
 * consecuencias: el estado `vencido` era inalcanzable, y el documento no podía
 * declarar hasta cuándo valía lo que prometía. Ver D-017.
 *
 * Vive acá porque es una regla del negocio, no una configuración del
 * despliegue: cambiarla cambia lo que NewConcret le promete a un cliente, y
 * eso se discute y se revisa en un diff, no se edita en un panel.
 */

/**
 * Los días que vale un presupuesto de NewConcret desde que se emite.
 *
 * Es un plazo único de la empresa, decidido como tal: no lo elige el vendedor
 * presupuesto por presupuesto. Si algún día hace falta la excepción —un precio
 * de importación que se sostiene una semana— la forma de agregarla es un plazo
 * por presupuesto que tenga a éste como valor por defecto, no reemplazarlo.
 */
export const QUOTE_VALIDITY_DAYS = 30;

/**
 * La fecha hasta la que vale un presupuesto emitido en ese momento.
 *
 * Devuelve `AAAA-MM-DD` porque la columna es `date` y no `timestamp`: la
 * validez se vence el día, no la hora. Guardar una hora obligaría a decidir en
 * qué huso horario vence, que es una pregunta que no le interesa a nadie y que
 * el sistema respondería mal la mitad de las veces.
 *
 * Se calcula sobre la fecha local de la emisión y no en UTC. Un presupuesto
 * emitido a las 21 de Buenos Aires ya es del día siguiente en UTC, y el
 * documento diría un día más de lo que el vendedor entiende que dio.
 */
export function validUntilFrom(issuedAt: Date, days: number = QUOTE_VALIDITY_DAYS): string {
  const vence = new Date(issuedAt.getFullYear(), issuedAt.getMonth(), issuedAt.getDate() + days);

  const mes = String(vence.getMonth() + 1).padStart(2, '0');
  const dia = String(vence.getDate()).padStart(2, '0');
  return `${vence.getFullYear()}-${mes}-${dia}`;
}
