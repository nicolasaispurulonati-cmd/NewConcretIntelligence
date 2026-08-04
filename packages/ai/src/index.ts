/**
 * @nci/ai — el AI Engine.
 *
 * No expone pantallas ni conversaciones sueltas: expone una función que los
 * dominios llaman cuando la IA aporta valor. Y no puede consultar la plataforma
 * sin un Scope, así que nunca ve lo que la persona no vería.
 */

export * from './contract.js';
export * from './personality.js';
export * from './retrieval.js';
export * from './assistant.js';
