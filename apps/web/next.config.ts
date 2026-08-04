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
  // Los paquetes del monorepo se publican como TypeScript sin compilar hacia la
  // app: Next los transpila con el mismo pipeline que su propio código.
  transpilePackages: ['@nci/domain', '@nci/db', '@nci/core', '@nci/ai', '@nci/sales', '@nci/design'],
  // El driver de PostgreSQL y el SDK de Anthropic usan APIs de Node que no
  // deben empaquetarse: se resuelven en tiempo de ejecución del servidor.
  serverExternalPackages: ['postgres', '@anthropic-ai/sdk'],
};

export default config;
