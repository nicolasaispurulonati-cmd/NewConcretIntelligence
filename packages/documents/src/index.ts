/**
 * @nci/documents — lo que NCI le entrega a un cliente.
 *
 * Este paquete recibe datos ya congelados y los dibuja. No sabe de dónde
 * salieron, no puede volver a buscarlos, y no conoce la base ni el catálogo ni
 * el dominio comercial. Esa ignorancia es la garantía: un documento que no
 * puede consultar un precio actual no va a imprimir uno.
 */

export * from './company.js';
export * from './quote-document.js';
