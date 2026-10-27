import type { CodigoError, ErrorApi } from '@rockstar/contracts';

/**
 * Rechazo de una operación por una regla del negocio o por datos no válidos.
 * El filtro global lo convierte en la respuesta `{ codigo, mensaje }` del contrato.
 */
export class ErrorDeNegocio extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoError,
    mensaje: string,
    /** Datos con que el cliente puede corregir la solicitud, por ejemplo qué líneas no tienen stock. */
    readonly detalle?: unknown,
  ) {
    super(mensaje);
  }

  cuerpo(): ErrorApi {
    return { codigo: this.codigo, mensaje: this.message, ...(this.detalle === undefined ? {} : { detalle: this.detalle }) };
  }
}

export const datosInvalidos = (mensaje: string) => new ErrorDeNegocio(400, 'DATOS_INVALIDOS', mensaje);
export const sesionInvalida = () => new ErrorDeNegocio(401, 'SESION_INVALIDA', 'La sesión no es válida.');
export const accesoDenegado = () =>
  new ErrorDeNegocio(403, 'ACCESO_DENEGADO', 'El rol no tiene permiso para esta operación.');
export const noEncontrado = (mensaje: string) => new ErrorDeNegocio(404, 'NO_ENCONTRADO', mensaje);

/** Corta la operación con `400 DATOS_INVALIDOS` si la condición no se cumple. */
export function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) {
    throw datosInvalidos(mensaje);
  }
}

export function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

/** Texto recortado de un campo del cuerpo; vacío si no vino o no es texto. */
export function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** El cuerpo de la solicitud como objeto; vacío si no vino o no es un objeto. */
export function cuerpoComo<T>(cuerpo: unknown): Partial<T> {
  return typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo) ? (cuerpo as Partial<T>) : {};
}
