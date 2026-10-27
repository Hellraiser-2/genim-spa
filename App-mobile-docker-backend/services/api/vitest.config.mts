import { defineConfig } from 'vitest/config';

// Pruebas unitarias: lógica pura, sin base de datos ni servidor.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
