/**
 * Dinero, en el lenguaje del negocio.
 *
 * Todo importe del sistema es un entero en la unidad menor de su moneda —
 * centavos para pesos y para dólares. Nunca un decimal: 0.1 + 0.2 no da 0.3 en
 * punto flotante, y en un presupuesto eso termina siendo una diferencia que
 * nadie sabe explicar y que el cliente sí ve.
 *
 * El tipo vive acá y no en el dominio comercial porque el catálogo también
 * cotiza, y el catálogo no puede depender de ventas: el modelo declara que
 * ventas depende de productos, no al revés. Un mismo concepto nombrado dos
 * veces es la puerta de entrada a que signifiquen dos cosas distintas.
 *
 * La aritmética —redondeo, IVA, descuentos— vive en `@nci/sales`, que es quien
 * la necesita. Acá está sólo el nombre.
 */

/** Un importe en la unidad menor de su moneda. El alias existe para que se lea. */
export type Cents = number;
