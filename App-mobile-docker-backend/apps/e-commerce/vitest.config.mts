import { defineConfig } from 'vitest/config';

// Pruebas unitarias de la lógica sin Angular (cálculos en `src/app/data`).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
