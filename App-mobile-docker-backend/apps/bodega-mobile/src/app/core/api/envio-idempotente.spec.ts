import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';

import { EnvioIdempotente } from './envio-idempotente';

const sinConexion = () => throwError(() => new HttpErrorResponse({ status: 0 }));
const rechazo = () => throwError(() => new HttpErrorResponse({ status: 409, error: { codigo: 'STOCK_INSUFICIENTE' } }));

describe('EnvioIdempotente', () => {
  it('reutiliza la misma clave al reintentar tras una falla de conexión', async () => {
    const envio = new EnvioIdempotente();
    const claves: string[] = [];

    await envio.ejecutar((clave) => (claves.push(clave), sinConexion()));
    expect(envio.reintentable()).toBe(true);
    expect(envio.error()).toContain('No hay conexión');

    const resultado = await envio.ejecutar((clave) => (claves.push(clave), of('ok')));

    expect(resultado).toBe('ok');
    expect(claves[1]).toBe(claves[0]);
    expect(envio.reintentable()).toBe(false);
    expect(envio.error()).toBeNull();
  });

  it('usa una clave nueva después de un envío exitoso', async () => {
    const envio = new EnvioIdempotente();
    const claves: string[] = [];

    await envio.ejecutar((clave) => (claves.push(clave), of(1)));
    await envio.ejecutar((clave) => (claves.push(clave), of(2)));

    expect(claves[1]).not.toBe(claves[0]);
  });

  it('usa una clave nueva después de un rechazo del servidor', async () => {
    const envio = new EnvioIdempotente();
    const claves: string[] = [];

    await envio.ejecutar((clave) => (claves.push(clave), rechazo()));
    expect(envio.reintentable()).toBe(false);
    expect(envio.error()).toContain('existencia suficiente');

    await envio.ejecutar((clave) => (claves.push(clave), of(1)));
    expect(claves[1]).not.toBe(claves[0]);
  });

  it('ignora una segunda confirmación mientras hay un envío en curso', async () => {
    const envio = new EnvioIdempotente();
    const respuesta = new Subject<string>();
    let llamadas = 0;
    const operacion = () => (llamadas++, respuesta);

    const primero = envio.ejecutar(operacion);
    expect(envio.enviando()).toBe(true);
    const segundo = await envio.ejecutar(operacion);

    respuesta.next('ok');
    respuesta.complete();

    expect(segundo).toBeUndefined();
    expect(await primero).toBe('ok');
    expect(llamadas).toBe(1);
    expect(envio.enviando()).toBe(false);
  });

  it('descarta el envío pendiente al reiniciar', async () => {
    const envio = new EnvioIdempotente();
    const claves: string[] = [];

    await envio.ejecutar((clave) => (claves.push(clave), sinConexion()));
    envio.reiniciar();
    await envio.ejecutar((clave) => (claves.push(clave), of(1)));

    expect(claves[1]).not.toBe(claves[0]);
  });
});
