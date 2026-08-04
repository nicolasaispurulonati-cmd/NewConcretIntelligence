import { defineConfig } from 'drizzle-kit';

import { loadEnv } from './src/env.js';

// drizzle-kit corre desde este paquete, pero el .env vive en la raíz.
loadEnv();

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
