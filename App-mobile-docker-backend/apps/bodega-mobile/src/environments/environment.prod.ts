// Configuración de la app instalada en un teléfono (`ng build`, que usa el APK).

/**
 * Dirección inicial del backend, fijada al compilar con `--define`. Vacía (lo normal), la
 * app pide la IP del servidor al abrirse: en la red del local o en la zona Wi-Fi de un
 * celular, la dirección del equipo no se conoce al compilar.
 */
declare const SERVIDOR_API: string;
/** Con `true` (`npm run apk -- --demo`), la app arranca con datos de ejemplo, sin servidor. */
declare const MODO_DEMO: boolean;

export const environment = {
  production: true,
  // En un teléfono no existe `localhost`: es solo el prefijo que se reemplaza por el servidor elegido.
  apiUrl: 'http://localhost:3000/api/v1',
  useMockApi: MODO_DEMO,
  servidorPorDefecto: SERVIDOR_API,
  servidorConfigurable: true,
};
