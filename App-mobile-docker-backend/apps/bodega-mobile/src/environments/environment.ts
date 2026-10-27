// `ng build` reemplaza este archivo por `environment.prod.ts` (ver `fileReplacements` en angular.json).

export const environment = {
  production: false,
  /** Prefijo con que los clientes de API arman sus direcciones. */
  apiUrl: 'http://localhost:3000/api/v1',
  /** Con `true`, la app arranca en modo demostración: responde un backend simulado en memoria. */
  useMockApi: true,
  /** Servidor al que se conecta la app mientras el usuario no elija otro. */
  servidorPorDefecto: 'http://localhost:3000',
  /** Con `true`, la pantalla de inicio de sesión permite cambiar de servidor o de modo. */
  servidorConfigurable: true,
};
