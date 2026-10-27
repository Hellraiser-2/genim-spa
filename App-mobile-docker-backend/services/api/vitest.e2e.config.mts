import { defineConfig } from 'vitest/config';

// Pruebas de contrato: ejercitan la API compilada por HTTP, contra una base real.
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.spec.ts'],
    globalSetup: ['test/preparacion.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
