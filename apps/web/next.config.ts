import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { NextConfig } from 'next';

/**
 * Next carga el `.env` del directorio de la aplicación, pero en este monorepo
 * vive en la raíz para que todos los paquetes compartan una sola configuración.
 * Sin esto, la app arrancaría sin conexión a la base y sin clave de IA.
 */
function loadRootEnv(): void {
  let current = resolve(process.cwd());

  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(current, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

loadRootEnv();

const config: NextConfig = {
  /**
   * Dónde se escribe el resultado de la compilación.
   *
   * `next dev` y `next build` usan el mismo directorio, así que compilar
   * mientras el servidor de desarrollo está sirviendo le pisa el runtime y lo
   * deja tirando `__webpack_modules__[moduleId] is not a function`. Pasó de
   * verdad. Con esta variable, una verificación puede construir en su propio
   * directorio sin tocar al que está trabajando.
   */
  ...(process.env['NCI_DIST_DIR'] ? { distDir: process.env['NCI_DIST_DIR'] } : {}),

  // Los paquetes del monorepo se publican como TypeScript sin compilar hacia la
  // app: Next los transpila con el mismo pipeline que su propio código.
  transpilePackages: ['@nci/domain', '@nci/db', '@nci/core', '@nci/ai', '@nci/sales', '@nci/design'],

  // El driver de PostgreSQL y el SDK de Anthropic usan APIs de Node que no
  // deben empaquetarse: se resuelven en tiempo de ejecución del servidor.
  //
  // pdfkit está por otro motivo: lee de disco las métricas de sus fuentes
  // estándar (los archivos .afm) en tiempo de ejecución. Empaquetado, compila
  // bien y falla recién al generar el primer documento, que es el peor momento
  // posible para enterarse.
  serverExternalPackages: ['postgres', '@anthropic-ai/sdk', 'pdfkit'],
};

export default config;
