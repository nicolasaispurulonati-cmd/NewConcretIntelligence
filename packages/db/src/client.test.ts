/**
 * La cadena de conexión.
 *
 * Es el único punto donde el entorno de producción entra al código, y los dos
 * errores que produce no se ven hasta que se despliega: una conexión rechazada
 * por un parámetro que el servidor no conoce, y sentencias preparadas contra un
 * pooler que reparte cada consulta en una sesión distinta.
 *
 * Ninguna de estas pruebas abre una conexión.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseConnectionUrl } from './client.js';

const NEON = 'postgresql://usuario:clave@ep-ejemplo-pooler.sa-east-1.aws.neon.tech/nci';
const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

describe('Parámetros que el servidor no entiende', () => {
  it('quita channel_binding, que trae la cadena que Neon da para copiar', () => {
    const { url } = parseConnectionUrl(`${NEON}?sslmode=require&channel_binding=require`);

    assert.ok(!url.includes('channel_binding'), 'el servidor rechaza la conexión entera por este parámetro');
    assert.ok(url.includes('sslmode=require'), 'pero sslmode sí lo entiende el driver');
  });

  it('conserva el resto de la cadena intacto', () => {
    const { url } = parseConnectionUrl(`${NEON}?channel_binding=require`);
    const parsed = new URL(url);

    assert.equal(parsed.username, 'usuario');
    assert.equal(parsed.password, 'clave');
    assert.equal(parsed.hostname, 'ep-ejemplo-pooler.sa-east-1.aws.neon.tech');
    assert.equal(parsed.pathname, '/nci');
  });

  it('una cadena que no se puede interpretar se pasa tal cual', () => {
    // El driver dará un error más específico que cualquiera inventado acá.
    const raro = 'esto no es una cadena de conexión';
    assert.equal(parseConnectionUrl(raro).url, raro);
  });
});

describe('SSL', () => {
  it('lo exige cuando la cadena lo pide', () => {
    assert.equal(parseConnectionUrl(`${NEON}?sslmode=require`).ssl, true);
    assert.equal(parseConnectionUrl(`${NEON}?sslmode=verify-full`).ssl, true);
  });

  it('no lo impone en desarrollo, donde la base no lo ofrece', () => {
    assert.equal(parseConnectionUrl(LOCAL).ssl, false);
    assert.equal(parseConnectionUrl(`${LOCAL}?sslmode=disable`).ssl, false);
  });

  it('sslmode=prefer no alcanza para exigirlo', () => {
    // "prefer" significa: usalo si está. Tratarlo como "require" haría fallar
    // una conexión que el servidor aceptaría.
    assert.equal(parseConnectionUrl(`${LOCAL}?sslmode=prefer`).ssl, false);
  });
});

describe('Pooler en modo transacción', () => {
  it('lo reconoce por el nombre del host', () => {
    assert.equal(parseConnectionUrl(`${NEON}?sslmode=require`).pooler, true);
  });

  it('lo reconoce por el parámetro que agregan otros proveedores', () => {
    const { pooler, url } = parseConnectionUrl(`${LOCAL}?pgbouncer=true`);

    assert.equal(pooler, true);
    assert.ok(!url.includes('pgbouncer'), 'se lee antes de quitarlo de la cadena');
  });

  it('una conexión directa no lo activa', () => {
    const directa = 'postgresql://usuario:clave@ep-ejemplo.sa-east-1.aws.neon.tech/nci?sslmode=require';

    assert.equal(parseConnectionUrl(directa).pooler, false);
    assert.equal(parseConnectionUrl(LOCAL).pooler, false);
  });
});
