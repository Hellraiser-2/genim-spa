import { afterEach, describe, expect, it, vi } from 'vitest';

import { baseApi, elegirServidor, equipoDe, faltaServidor, normalizarServidor, probarServidor, servidorActual } from './servidor';

describe('servidor del backend', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('con solo la IP usa el puerto de la API', () => {
    expect(normalizarServidor('192.168.43.10')).toBe('http://192.168.43.10:3000');
    expect(normalizarServidor('192.168.43.10:8000')).toBe('http://192.168.43.10:8000');
  });

  it('acepta la dirección completa y quita la barra final', () => {
    expect(normalizarServidor(' http://192.168.1.20:3000/ ')).toBe('http://192.168.1.20:3000');
    // Con el protocolo escrito se respeta tal cual: puede ser un servidor en el puerto 80 o 443.
    expect(normalizarServidor('https://pos.rockstar.cl')).toBe('https://pos.rockstar.cl');
  });

  it('rechaza lo que no es una dirección', () => {
    expect(normalizarServidor('')).toBeNull();
    expect(normalizarServidor('http://')).toBeNull();
    expect(normalizarServidor('dos palabras')).toBeNull();
  });

  it('usa el servidor elegido en el teléfono antes que el de la compilación', () => {
    const deCompilacion = baseApi();
    elegirServidor('http://10.0.0.5:3000');
    expect(baseApi()).toBe('http://10.0.0.5:3000/api/v1');
    expect(servidorActual()).toBe('http://10.0.0.5:3000');
    elegirServidor('');
    expect(baseApi()).toBe(deCompilacion);
  });

  it('en el navegador nunca pide servidor: usa el mismo origen', () => {
    expect(faltaServidor()).toBe(false);
  });

  it('obtiene el equipo de una dirección', () => {
    expect(equipoDe('http://192.168.43.10:3000')).toBe('192.168.43.10');
    expect(equipoDe('no es una dirección')).toBe('');
  });

  it('da por conectado solo un servidor que responde como el de Rockstar', async () => {
    const respuesta = (cuerpo: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(cuerpo) } as Response);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    fetch.mockReturnValueOnce(respuesta({ estado: 'ok' }));
    expect(await probarServidor('http://192.168.43.10:3000')).toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://192.168.43.10:3000/api/v1/salud', expect.anything());

    fetch.mockReturnValueOnce(respuesta({ hola: 'mundo' }));
    expect(await probarServidor('http://192.168.43.10:3000')).toBe(false);

    fetch.mockReturnValueOnce(Promise.reject(new TypeError('Failed to fetch')));
    expect(await probarServidor('http://192.168.43.10:3000')).toBe(false);
  });
});
