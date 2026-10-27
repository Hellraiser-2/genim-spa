import type { TestProject } from 'vitest/node';

import { iniciarEntornoLocal } from './entorno-local.mjs';

declare module 'vitest' {
  export interface ProvidedContext {
    apiUrl: string;
  }
}

/**
 * Las pruebas de contrato hablan con la API por HTTP. Con `API_URL` definido usan esa
 * API, por ejemplo la de `docker compose` (`http://localhost:3000/api/v1`); sin él,
 * levantan una propia con base en memoria.
 */
export default async function preparar(proyecto: TestProject): Promise<(() => Promise<void>) | void> {
  const externa = process.env['API_URL']?.replace(/\/$/, '');
  if (externa) {
    proyecto.provide('apiUrl', externa);
    return;
  }
  const { apiUrl, detener } = await iniciarEntornoLocal({ silencioso: true });
  proyecto.provide('apiUrl', apiUrl);
  return detener;
}
