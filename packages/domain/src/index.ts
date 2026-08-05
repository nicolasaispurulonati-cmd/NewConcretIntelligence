/**
 * @nci/domain — el lenguaje oficial de NewConcret Intelligence.
 *
 * Este paquete no sabe nada de bases de datos, HTTP ni React. Define qué
 * significan las cosas; el resto del sistema las implementa. Cualquier
 * ambigüedad sobre un concepto del negocio se resuelve acá y en ningún otro
 * lado — es lo que sostiene el Principio 1: una única fuente de verdad.
 */

export * from './domains.js';
export * from './entity-types.js';
export * from './capabilities.js';
export * from './relations.js';
export * from './roles.js';
export * from './provenance.js';
