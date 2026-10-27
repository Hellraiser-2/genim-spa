import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CobroMaquina,
  ErrorMaquina,
  MaquinaDeCobro,
  esperarResultado,
  guardarConfigMaquina,
  leerConfigMaquina,
  maquinaHttp,
  pagoParaVenta,
  tipoTarjeta,
  ultimosDigitos,
  urlBase,
} from './terminal';

const cobro = (datos: Partial<CobroMaquina> = {}): CobroMaquina => ({
  id: 'c1',
  monto: 15990,
  tipo: 'DEBITO',
  referencia: 'clave-1',
  estado: 'PENDIENTE',
  codigoAutorizacion: null,
  tarjeta: null,
  motivo: null,
  ...datos,
});

const respuesta = (status: number, cuerpo: unknown) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;

describe('urlBase', () => {
  it('agrega http y quita la barra final', () => {
    expect(urlBase('192.168.1.50:8090')).toBe('http://192.168.1.50:8090');
    expect(urlBase(' http://maquina.local:8090/ ')).toBe('http://maquina.local:8090');
    expect(urlBase('https://pos.tienda.cl')).toBe('https://pos.tienda.cl');
  });
});

describe('tipoTarjeta', () => {
  it('solo las tarjetas pasan por la maquina', () => {
    expect(tipoTarjeta('DEBITO_PRESENCIAL')).toBe('DEBITO');
    expect(tipoTarjeta('CREDITO_PRESENCIAL')).toBe('CREDITO');
    expect(tipoTarjeta('EFECTIVO')).toBeNull();
  });
});

describe('pago para la venta', () => {
  it('guarda solo los ultimos cuatro digitos de la tarjeta', () => {
    expect(ultimosDigitos('•••• 4242')).toBe('4242');
    expect(ultimosDigitos('**** **** **** 0007 ')).toBe('0007');
    expect(ultimosDigitos(null)).toBeNull();
    expect(ultimosDigitos('sin datos')).toBeNull();
  });

  it('arma el pago con el cobro, la autorizacion y los ultimos digitos', () => {
    expect(pagoParaVenta(cobro({ estado: 'APROBADO', codigoAutorizacion: '123456', tarjeta: '•••• 4242' }))).toEqual({
      idCobro: 'c1',
      codigoAutorizacion: '123456',
      ultimosDigitos: '4242',
    });
  });
});

describe('configuracion', () => {
  beforeEach(() => localStorage.clear());

  it('parte desactivada y recuerda lo guardado', () => {
    expect(leerConfigMaquina()).toEqual({ activa: false, direccion: 'localhost:8090' });
    guardarConfigMaquina({ activa: true, direccion: '192.168.1.50:8090' });
    expect(leerConfigMaquina()).toEqual({ activa: true, direccion: '192.168.1.50:8090' });
  });

  it('ignora una configuracion danada', () => {
    localStorage.setItem('pos_maquina_cobro', '{no es json');
    expect(leerConfigMaquina().activa).toBe(false);
  });
});

describe('maquinaHttp', () => {
  it('envia el cobro con monto, tipo y referencia', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(201, cobro()));
    const maquina = maquinaHttp('192.168.1.50:8090', fetchMock);
    await expect(maquina.cobrar(15990, 'DEBITO', 'clave-1')).resolves.toMatchObject({ estado: 'PENDIENTE' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.50:8090/api/cobros');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ monto: 15990, tipo: 'DEBITO', referencia: 'clave-1' });
  });

  it('un corte de red es SIN_CONEXION con la direccion en el mensaje', async () => {
    const maquina = maquinaHttp('10.0.0.9:8090', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await maquina.info().catch((e) => e);
    expect(error).toBeInstanceOf(ErrorMaquina);
    expect(error.codigo).toBe('SIN_CONEXION');
    expect(error.message).toContain('http://10.0.0.9:8090');
  });

  it('propaga el codigo de la maquina, por ejemplo OCUPADA', async () => {
    const maquina = maquinaHttp('m:1', vi.fn().mockResolvedValue(respuesta(409, { codigo: 'OCUPADA', mensaje: 'Otro cobro en curso.' })));
    await expect(maquina.cobrar(1, 'CREDITO', 'k')).rejects.toMatchObject({ codigo: 'OCUPADA', message: 'Otro cobro en curso.' });
  });

  it('cancelar un cobro que ya se pago devuelve el cobro aprobado', async () => {
    const aprobado = cobro({ estado: 'APROBADO', codigoAutorizacion: '123456' });
    const maquina = maquinaHttp('m:1', vi.fn().mockResolvedValue(respuesta(409, { codigo: 'ESTADO_INVALIDO', mensaje: 'Ya aprobado', detalle: aprobado })));
    await expect(maquina.cancelar('c1')).resolves.toEqual(aprobado);
  });
});

describe('esperarResultado', () => {
  const maquinaCon = (consultar: MaquinaDeCobro['consultar']) => ({ consultar }) as MaquinaDeCobro;

  it('consulta hasta que el cobro deja de estar pendiente', async () => {
    const consultar = vi
      .fn()
      .mockResolvedValueOnce(cobro())
      .mockResolvedValueOnce(cobro())
      .mockResolvedValueOnce(cobro({ estado: 'APROBADO' }));
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1 })).resolves.toMatchObject({ estado: 'APROBADO' });
    expect(consultar).toHaveBeenCalledTimes(3);
  });

  it('tolera cortes de red pasajeros', async () => {
    const sinRed = new ErrorMaquina('sin red', 'SIN_CONEXION');
    const consultar = vi.fn().mockRejectedValueOnce(sinRed).mockRejectedValueOnce(sinRed).mockResolvedValueOnce(cobro({ estado: 'RECHAZADO' }));
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1 })).resolves.toMatchObject({ estado: 'RECHAZADO' });
  });

  it('se rinde si la maquina no vuelve', async () => {
    const consultar = vi.fn().mockRejectedValue(new ErrorMaquina('sin red', 'SIN_CONEXION'));
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1 })).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
    expect(consultar).toHaveBeenCalledTimes(6);
  });

  it('deja de esperar al abortar', async () => {
    const control = new AbortController();
    const consultar = vi.fn().mockImplementation(async () => {
      control.abort();
      return cobro();
    });
    await expect(esperarResultado(maquinaCon(consultar), 'c1', { intervaloMs: 1, senal: control.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
