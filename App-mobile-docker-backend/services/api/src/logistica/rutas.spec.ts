import { describe, expect, it } from 'vitest';

import { distanciaRecta, leerViajeOsrm, viajeEnLineaRecta } from './rutas.js';

const PLAZA_DE_ARMAS = { lat: -33.4378, lon: -70.6504 };
const PROVIDENCIA = { lat: -33.4263, lon: -70.6178 };
const NUNOA = { lat: -33.4569, lon: -70.5977 };
const MAIPU = { lat: -33.5167, lon: -70.7667 };

describe('distanciaRecta', () => {
  it('mide en metros sobre la superficie de la Tierra', () => {
    expect(distanciaRecta(PLAZA_DE_ARMAS, PLAZA_DE_ARMAS)).toBe(0);
    // De la Plaza de Armas a Providencia hay unos 3,3 km en línea recta.
    expect(distanciaRecta(PLAZA_DE_ARMAS, PROVIDENCIA)).toBeGreaterThan(3200);
    expect(distanciaRecta(PLAZA_DE_ARMAS, PROVIDENCIA)).toBeLessThan(3400);
    expect(distanciaRecta(PROVIDENCIA, PLAZA_DE_ARMAS)).toBeCloseTo(distanciaRecta(PLAZA_DE_ARMAS, PROVIDENCIA), 6);
  });
});

describe('viajeEnLineaRecta', () => {
  it('va siempre al destino sin visitar más cercano y vuelve al origen', () => {
    const viaje = viajeEnLineaRecta(PLAZA_DE_ARMAS, [MAIPU, NUNOA, PROVIDENCIA]);

    // Providencia es lo más cercano a la plaza, después Ñuñoa y al final Maipú.
    expect(viaje.orden).toEqual([2, 1, 0]);
    expect(viaje.tramos).toHaveLength(4);
    expect(viaje.trazado).toEqual([PLAZA_DE_ARMAS, PROVIDENCIA, NUNOA, MAIPU, PLAZA_DE_ARMAS]);
    expect(viaje.tramos[0]!.distancia).toBe(Math.round(distanciaRecta(PLAZA_DE_ARMAS, PROVIDENCIA)));
    // A 25 km/h, 1 km toma 144 segundos.
    expect(viaje.tramos[0]!.duracion).toBe(Math.round(viaje.tramos[0]!.distancia / (25_000 / 3600)));
  });

  it('sin destinos no hay recorrido', () => {
    expect(viajeEnLineaRecta(PLAZA_DE_ARMAS, [])).toEqual({ orden: [], tramos: [], trazado: [] });
  });
});

describe('leerViajeOsrm', () => {
  const respuesta = {
    code: 'Ok',
    trips: [
      {
        geometry: { coordinates: [[-70.65, -33.43], [-70.6, -33.45], [-70.62, -33.42], [-70.65, -33.43]] as [number, number][] },
        legs: [
          { distance: 5100.4, duration: 600.6 },
          { distance: 3000, duration: 400 },
          { distance: 4000, duration: 500 },
        ],
      },
    ],
    // En el orden en que se enviaron: origen, Providencia, Ñuñoa. Ñuñoa quedó primera.
    waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
  };

  it('ordena los destinos según su lugar en el viaje y convierte el trazado a latitud y longitud', () => {
    const viaje = leerViajeOsrm(respuesta, 2)!;

    expect(viaje.orden).toEqual([1, 0]);
    expect(viaje.tramos).toEqual([
      { distancia: 5100, duracion: 601 },
      { distancia: 3000, duracion: 400 },
      { distancia: 4000, duracion: 500 },
    ]);
    expect(viaje.trazado[1]).toEqual({ lat: -33.45, lon: -70.6 });
  });

  it('descarta una respuesta que no es un viaje para esos puntos', () => {
    expect(leerViajeOsrm({ code: 'NoTrips' }, 2)).toBeNull();
    expect(leerViajeOsrm(respuesta, 3)).toBeNull();
    expect(leerViajeOsrm({ ...respuesta, waypoints: [{ waypoint_index: 1 }, { waypoint_index: 0 }, { waypoint_index: 2 }] }, 2)).toBeNull();
  });
});
