import { HttpErrorResponse } from '@angular/common/http';
import type { ErrorApi } from '@rockstar/contracts';

const MENSAJES_POR_CODIGO: Record<string, string> = {
  CREDENCIALES_INVALIDAS: 'Correo o contraseña no válidos.',
  SESION_INVALIDA: 'Tu sesión expiró. Inicia sesión nuevamente.',
  ACCESO_DENEGADO: 'Tu cuenta no tiene permiso para esta operación.',
  NO_ENCONTRADO: 'No se encontró lo solicitado.',
  STOCK_INSUFICIENTE: 'No hay existencia suficiente en la ubicación indicada.',
  UNIDADES_RESERVADAS: 'Hay unidades comprometidas en pedidos; no se puede descontar esa cantidad.',
  VARIANTE_INACTIVA: 'El producto está desactivado y no admite movimientos.',
  VARIANTE_DUPLICADA: 'Ya existe ese producto con la misma talla y color.',
  PRODUCTO_DUPLICADO: 'Ya existe otro producto con ese nombre.',
};

function cuerpoDeError(error: HttpErrorResponse): Partial<ErrorApi> {
  return typeof error.error === 'object' && error.error !== null ? (error.error as Partial<ErrorApi>) : {};
}

export function codigoDeError(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? cuerpoDeError(error).codigo : undefined;
}

/**
 * Indica si la operación pudo no haberse registrado por una falla ajena a los datos
 * (sin conexión o error del servidor), por lo que conviene reintentarla tal cual.
 */
export function esFallaDeConexion(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

/** Traduce cualquier error de una llamada HTTP a un mensaje para el usuario. */
export function mensajeDeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error && error.message ? error.message : 'Ocurrió un error inesperado.';
  }
  if (error.status === 0) {
    return 'No hay conexión con el servidor. Revisa tu conexión y reintenta.';
  }
  if (error.status >= 500) {
    return 'El servidor no pudo confirmar la operación. Reintenta en unos segundos.';
  }
  const { codigo, mensaje } = cuerpoDeError(error);
  if (codigo && MENSAJES_POR_CODIGO[codigo]) {
    return MENSAJES_POR_CODIGO[codigo];
  }
  if (mensaje) {
    return mensaje;
  }
  switch (error.status) {
    case 401:
      return MENSAJES_POR_CODIGO['SESION_INVALIDA'];
    case 403:
      return MENSAJES_POR_CODIGO['ACCESO_DENEGADO'];
    case 404:
      return MENSAJES_POR_CODIGO['NO_ENCONTRADO'];
    default:
      return 'No se pudo completar la operación.';
  }
}
