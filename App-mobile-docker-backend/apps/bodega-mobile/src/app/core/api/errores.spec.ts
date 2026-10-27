import { HttpErrorResponse } from '@angular/common/http';

import { codigoDeError, esFallaDeConexion, mensajeDeError } from './errores';

const error = (status: number, cuerpo?: unknown) => new HttpErrorResponse({ status, error: cuerpo });

describe('errores de API', () => {
  it('trata la falta de conexión y los errores del servidor como fallas reintentables', () => {
    expect(esFallaDeConexion(error(0))).toBe(true);
    expect(esFallaDeConexion(error(503))).toBe(true);
    expect(esFallaDeConexion(error(409, { codigo: 'STOCK_INSUFICIENTE' }))).toBe(false);
    expect(esFallaDeConexion(new Error('otro'))).toBe(false);
  });

  it('explica la falta de conexión', () => {
    expect(mensajeDeError(error(0))).toContain('No hay conexión');
  });

  it('traduce los códigos de error conocidos', () => {
    expect(mensajeDeError(error(409, { codigo: 'STOCK_INSUFICIENTE', mensaje: 'x' }))).toContain('existencia suficiente');
    expect(mensajeDeError(error(409, { codigo: 'UNIDADES_RESERVADAS', mensaje: 'x' }))).toContain('comprometidas en pedidos');
    expect(mensajeDeError(error(401, { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'x' }))).toBe(
      'Correo o contraseña no válidos.',
    );
  });

  it('usa el mensaje del servidor cuando el código no es conocido', () => {
    expect(mensajeDeError(error(400, { codigo: 'DATOS_INVALIDOS', mensaje: 'El motivo es obligatorio.' }))).toBe(
      'El motivo es obligatorio.',
    );
  });

  it('da un mensaje según el estado cuando la respuesta no trae cuerpo', () => {
    expect(mensajeDeError(error(403))).toContain('no tiene permiso');
    expect(mensajeDeError(error(404))).toContain('No se encontró');
    expect(mensajeDeError(error(418))).toBe('No se pudo completar la operación.');
  });

  it('extrae el código del cuerpo del error', () => {
    expect(codigoDeError(error(404, { codigo: 'NO_ENCONTRADO', mensaje: 'x' }))).toBe('NO_ENCONTRADO');
    expect(codigoDeError(new Error('otro'))).toBeUndefined();
  });
});
