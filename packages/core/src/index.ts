/**
 * @nci/core — el motor de NewConcret Intelligence.
 *
 * Toda lectura y toda escritura pasan por un `Scope`, que lleva adentro el
 * Actor y sus capacidades. No hay forma de operar sobre los datos sin uno.
 * Esa restricción es la que sostiene, sin depender de la disciplina de nadie,
 * la promesa de que la IA nunca ve lo que la persona no podría ver.
 */

export * from './errors.js';
export * from './authorization/actor.js';
export * from './authorization/resolve.js';
export * from './authorization/session.js';
export * from './audit.js';
export * from './graph/entities.js';
export * from './graph/relations.js';
export * from './graph/universe.js';
export * from './search.js';
