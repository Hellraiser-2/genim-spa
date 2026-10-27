import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Sustituye a `mock.interceptor.ts` en las compilaciones que usan la API real (ver
 * `fileReplacements` de la configuración `docker` en angular.json). Deja pasar todas
 * las solicitudes, de modo que el backend simulado no viaja en el paquete.
 */
export const mockInterceptor: HttpInterceptorFn = (solicitud, next) => next(solicitud);
