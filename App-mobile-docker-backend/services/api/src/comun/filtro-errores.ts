import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorApi } from '@rockstar/contracts';

import { ErrorDeNegocio } from './errores.js';

interface Respuesta {
  status(codigo: number): { json(cuerpo: unknown): void };
}

const POR_STATUS: Record<number, ErrorApi> = {
  400: { codigo: 'DATOS_INVALIDOS', mensaje: 'La solicitud no es válida.' },
  401: { codigo: 'SESION_INVALIDA', mensaje: 'La sesión no es válida.' },
  403: { codigo: 'ACCESO_DENEGADO', mensaje: 'El rol no tiene permiso para esta operación.' },
  404: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta no existe.' },
  413: { codigo: 'DATOS_INVALIDOS', mensaje: 'La solicitud es demasiado grande.' },
};

/** Status de un error de Express, por ejemplo un cuerpo JSON mal formado o demasiado grande. */
function statusDeCliente(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/** Responde todo error con el formato común `{ codigo, mensaje, detalle? }`. */
@Catch()
export class FiltroDeErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Respuesta>();

    if (error instanceof ErrorDeNegocio) {
      respuesta.status(error.status).json(error.cuerpo());
      return;
    }
    const status = error instanceof HttpException ? error.getStatus() : statusDeCliente(error);
    if (status !== undefined && status < 500) {
      respuesta.status(status).json(POR_STATUS[status] ?? { codigo: 'DATOS_INVALIDOS', mensaje: 'La solicitud no es válida.' });
      return;
    }
    // No se revela el detalle al cliente: puede contener datos internos.
    this.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    respuesta.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' } satisfies ErrorApi);
  }
}
