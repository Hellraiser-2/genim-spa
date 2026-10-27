import { HttpErrorResponse } from '@angular/common/http';
import type { ErrorApi } from '@rockstar/contracts';

/**
 * Dirección del backend. Es relativa: en Docker el servidor web de la tienda reenvía
 * `/api` al backend, y en desarrollo lo hace el proxy de `ng serve` (proxy.conf.json).
 */
export const API_URL = '/api/v1';

function errorBody(error: HttpErrorResponse): Partial<ErrorApi> {
  return typeof error.error === 'object' && error.error !== null ? (error.error as Partial<ErrorApi>) : {};
}

/** Código del error que respondió el backend, por ejemplo `STOCK_INSUFICIENTE`. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? errorBody(error).codigo : undefined;
}

/** Detalle con que el backend acompaña algunos rechazos. */
export function errorDetail<T>(error: unknown): T | undefined {
  return error instanceof HttpErrorResponse ? (errorBody(error).detalle as T | undefined) : undefined;
}

/** Traduce cualquier error de una llamada al backend a un mensaje para mostrar. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error && error.message ? error.message : 'Ocurrió un error inesperado.';
  }
  if (error.status === 0 || error.status === 502 || error.status === 504) {
    return 'No hay conexión con el servidor. Revisa tu conexión y reintenta.';
  }
  const { mensaje } = errorBody(error);
  if (mensaje && error.status < 500) {
    return mensaje;
  }
  if (error.status === 503 && mensaje) {
    return mensaje;
  }
  return 'El servidor no pudo completar la operación. Reintenta en unos segundos.';
}

/** UUID para las claves de idempotencia. `crypto.randomUUID` no existe fuera de HTTPS o localhost. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
