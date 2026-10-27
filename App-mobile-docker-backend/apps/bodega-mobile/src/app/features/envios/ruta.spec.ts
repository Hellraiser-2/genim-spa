import { TestBed } from '@angular/core/testing';

import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { enlaceNavegacion, formatoDistancia, formatoDuracion } from './ruta';
import { RutaRepartoPage } from './ruta.page';

describe('formatos de la ruta', () => {
  it('muestra metros bajo un kilómetro y kilómetros con un decimal sobre él', () => {
    expect(formatoDistancia(850)).toBe('850 m');
    expect(formatoDistancia(12_449)).toBe('12,4 km');
    expect(formatoDistancia(3000)).toBe('3 km');
  });

  it('muestra minutos, y horas desde la hora', () => {
    expect(formatoDuracion(20)).toBe('1 min');
    expect(formatoDuracion(300)).toBe('5 min');
    expect(formatoDuracion(3600)).toBe('1 h');
    expect(formatoDuracion(4800)).toBe('1 h 20 min');
  });

  it('arma el enlace de navegación con coordenadas', () => {
    const enlace = new URL(enlaceNavegacion({ lat: -33.4263, lon: -70.6178 }, { lat: -33.4378, lon: -70.6504 }));
    expect(enlace.origin + enlace.pathname).toBe('https://www.google.com/maps/dir/');
    expect(enlace.searchParams.get('destination')).toBe('-33.4263,-70.6178');
    expect(enlace.searchParams.get('origin')).toBe('-33.4378,-70.6504');
    expect(enlace.searchParams.get('travelmode')).toBe('driving');
  });
});

describe('RutaRepartoPage', () => {
  let entorno: EntornoDePrueba;

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
  });

  it('carga la ruta con los pedidos por enviar de la Región Metropolitana', async () => {
    const pagina = TestBed.createComponent(RutaRepartoPage).componentInstance;
    // El mapa necesita un navegador de verdad: aquí solo se revisan los datos.
    vi.spyOn(pagina as unknown as { dibujar: () => Promise<void> }, 'dibujar').mockResolvedValue();

    await pagina.cargar();

    const ruta = pagina.ruta()!;
    expect(pagina.error()).toBeNull();
    // En los datos de ejemplo, el único por enviar de la región es el de Providencia; Valparaíso y Concepción van por Starken.
    expect(ruta.paradas.map((parada) => parada.idPedido)).toEqual([1001]);
    expect(ruta.paradas[0]).toMatchObject({ orden: 1, comuna: 'Providencia', precision: 'COMUNA' });
    expect(ruta.trazado[0]).toEqual(ruta.origen.ubicacion);
    expect(ruta.trazado.at(-1)).toEqual(ruta.origen.ubicacion);
    expect(ruta.distanciaTotal).toBeGreaterThan(ruta.paradas[0]!.distanciaTramo);
    expect(new URL(pagina.navegar(1)).searchParams.get('origin')).toBe(`${ruta.origen.ubicacion.lat},${ruta.origen.ubicacion.lon}`);
  });
});
