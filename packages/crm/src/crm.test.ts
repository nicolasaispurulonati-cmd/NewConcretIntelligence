/**
 * Pruebas unitarias del dominio CRM.
 *
 * Reglas y casos que no requieren conexión a la base de datos.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findSimilarCustomers } from './customers.js';

describe('Búsqueda de clientes similares (unitario)', () => {
  it('con menos de dos caracteres no busca nada', async () => {
    const dummyScope = {} as any;
    assert.deepEqual(await findSimilarCustomers(dummyScope, ''), []);
    assert.deepEqual(await findSimilarCustomers(dummyScope, '  a  '), []);
  });
});
