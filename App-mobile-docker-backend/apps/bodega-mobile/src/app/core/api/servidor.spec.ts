import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mockInterceptor } from '../mock/mock.interceptor';
import { servidorInterceptor } from './servidor.interceptor';
import { ServidorService, normalizarDireccion } from './servidor.service';

describe('normalizarDireccion', () => {
  it('agrega el protocolo cuando solo se escribe el equipo y el puerto', () => {
    expect(normalizarDireccion(' 192.168.1.20:3000 ')).toBe('http://192.168.1.20:3000');
  });

  it('quita la barra final y la ruta de la API si se pegó completa', () => {
    expect(normalizarDireccion('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000');
    expect(normalizarDireccion('https://api.tienda.cl/api/v1/salud')).toBe('https://api.tienda.cl');
  });

  it('con solo la IP usa el puerto de la API', () => {
    expect(normalizarDireccion('192.168.43.10')).toBe('http://192.168.43.10:3000');
    expect(normalizarDireccion('192.168.43.10:8000')).toBe('http://192.168.43.10:8000');
    // Con el protocolo escrito se respeta tal cual: puede ser un servidor publicado en el puerto 80 o 443.
    expect(normalizarDireccion('https://api.tienda.cl')).toBe('https://api.tienda.cl');
  });

  it('rechaza un texto vacío o que no es una dirección', () => {
    expect(normalizarDireccion('   ')).toBeNull();
    expect(normalizarDireccion('http://')).toBeNull();
    expect(normalizarDireccion('mi servidor')).toBeNull();
  });
});

describe('ServidorService', () => {
  let servidor: ServidorService;
  let http: HttpClient;
  let solicitudes: HttpTestingController;

  beforeEach(async () => {
    await Preferences.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockInterceptor, servidorInterceptor])), provideHttpClientTesting()],
    });
    servidor = TestBed.inject(ServidorService);
    http = TestBed.inject(HttpClient);
    solicitudes = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    solicitudes.verify();
    vi.unstubAllGlobals();
  });

  it('arranca con los valores del entorno', () => {
    expect(servidor.modoDemo()).toBe(environment.useMockApi);
    expect(servidor.direccion()).toBe(environment.servidorPorDefecto);
  });

  it('guarda la conexión elegida y la recupera al volver a abrir la app', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.1.20:3000' });

    const alReabrir = TestBed.runInInjectionContext(() => new ServidorService());
    await alReabrir.restaurar();

    expect(alReabrir.modoDemo()).toBe(false);
    expect(alReabrir.direccion()).toBe('http://192.168.1.20:3000');
  });

  it('ignora un valor guardado que no se puede leer', async () => {
    await Preferences.set({ key: 'servidor', value: '{no es json' });

    await servidor.restaurar();

    expect(servidor.modoDemo()).toBe(environment.useMockApi);
    expect(servidor.direccion()).toBe(environment.servidorPorDefecto);
  });

  it('en modo demostración responde el backend simulado, sin salir a la red', async () => {
    await servidor.guardar({ modoDemo: true, direccion: 'http://192.168.1.20:3000' });

    await expect(firstValueFrom(http.get(`${environment.apiUrl}/inventario/variantes`))).rejects.toMatchObject({
      status: 401,
      error: { codigo: 'SESION_INVALIDA' },
    });
    solicitudes.expectNone(() => true);
  });

  it('con un servidor elegido, envía las solicitudes de la API a ese servidor', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.1.20:3000' });

    const respuesta = firstValueFrom(http.get(`${environment.apiUrl}/inventario/variantes`, { params: { q: 'polera' } }));
    const solicitud = solicitudes.expectOne('http://192.168.1.20:3000/api/v1/inventario/variantes?q=polera');
    solicitud.flush([]);

    expect(await respuesta).toEqual([]);
  });

  it('no toca las solicitudes que no son de la API', async () => {
    await servidor.guardar({ modoDemo: false, direccion: 'http://192.168.1.20:3000' });

    const respuesta = firstValueFrom(http.get('assets/datos.json'));
    solicitudes.expectOne('assets/datos.json').flush({});

    expect(await respuesta).toEqual({});
  });

  describe('probar', () => {
    it('acepta un servidor que responde la verificación de vida de Rockstar', async () => {
      const fetchSimulado = vi.fn().mockResolvedValue(new Response(JSON.stringify({ estado: 'ok' })));
      vi.stubGlobal('fetch', fetchSimulado);

      expect(await servidor.probar('http://192.168.1.20:3000')).toBe(true);
      expect(fetchSimulado.mock.calls[0][0]).toBe('http://192.168.1.20:3000/api/v1/salud');
    });

    it('rechaza una dirección donde responde otra cosa', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>')));

      expect(await servidor.probar('http://192.168.1.1')).toBe(false);
    });

    it('rechaza un servidor que no responde', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      expect(await servidor.probar('http://192.168.1.20:3000')).toBe(false);
    });
  });
});
