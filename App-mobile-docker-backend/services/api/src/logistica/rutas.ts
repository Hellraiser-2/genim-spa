import type { Coordenada } from '@rockstar/contracts';

/**
 * Cálculos puros de la ruta de reparto: distancias, el orden de respaldo y la lectura de
 * la respuesta del servicio de rutas. No llaman a nada: reciben coordenadas y devuelven
 * el recorrido.
 */

const RADIO_TIERRA_M = 6_371_000;
/** Velocidad media en la ciudad para estimar tiempos cuando no hay servicio de rutas. */
const KMH_EN_CIUDAD = 25;

/** Distancia en línea recta entre dos puntos, en metros (fórmula del haversine). */
export function distanciaRecta(a: Coordenada, b: Coordenada): number {
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

/** Un recorrido que sale del origen, visita los destinos y vuelve. */
export interface Viaje {
  /** Índices de los destinos (en el orden en que llegaron) en el orden de visita. */
  orden: number[];
  /** Tramos en orden de visita: hasta cada destino y, el último, el regreso al origen. */
  tramos: { distancia: number; duracion: number }[];
  trazado: Coordenada[];
}

/**
 * Orden del vecino más cercano: desde el origen, siempre al destino sin visitar más próximo
 * en línea recta. No es el óptimo, pero es razonable y no necesita ningún servicio.
 */
export function viajeEnLineaRecta(origen: Coordenada, destinos: Coordenada[]): Viaje {
  const pendientes = new Set(destinos.map((_, indice) => indice));
  const orden: number[] = [];
  let actual = origen;
  while (pendientes.size > 0) {
    let mejor = -1;
    for (const indice of pendientes) {
      if (mejor === -1 || distanciaRecta(actual, destinos[indice]!) < distanciaRecta(actual, destinos[mejor]!)) mejor = indice;
    }
    orden.push(mejor);
    pendientes.delete(mejor);
    actual = destinos[mejor]!;
  }
  const puntos = [origen, ...orden.map((indice) => destinos[indice]!), origen];
  const tramos = puntos.slice(1).map((punto, i) => {
    const distancia = distanciaRecta(puntos[i]!, punto);
    return { distancia: Math.round(distancia), duracion: Math.round(distancia / ((KMH_EN_CIUDAD * 1000) / 3600)) };
  });
  return { orden, tramos: destinos.length === 0 ? [] : tramos, trazado: destinos.length === 0 ? [] : puntos };
}

/** Lo que interesa de la respuesta del servicio `trip` de OSRM. */
export interface RespuestaViajeOsrm {
  code: string;
  trips?: { geometry: { coordinates: [number, number][] }; legs: { distance: number; duration: number }[] }[];
  waypoints?: { waypoint_index: number }[];
}

/**
 * Lee la respuesta de OSRM a un viaje que partió con el origen y siguió con los destinos.
 * `waypoints` viene en el orden en que se enviaron los puntos y dice en qué lugar del viaje
 * quedó cada uno. `null` si la respuesta no es un viaje válido para esos puntos.
 */
export function leerViajeOsrm(respuesta: RespuestaViajeOsrm, cantidadDestinos: number): Viaje | null {
  const viaje = respuesta.trips?.[0];
  const puntos = respuesta.waypoints;
  if (respuesta.code !== 'Ok' || !viaje || !puntos || puntos.length !== cantidadDestinos + 1) return null;
  if (puntos[0]!.waypoint_index !== 0 || viaje.legs.length !== cantidadDestinos + 1) return null;
  const orden = puntos
    .slice(1)
    .map((punto, indice) => ({ indice, lugar: punto.waypoint_index }))
    .sort((a, b) => a.lugar - b.lugar)
    .map((punto) => punto.indice);
  return {
    orden,
    tramos: viaje.legs.map((tramo) => ({ distancia: Math.round(tramo.distance), duracion: Math.round(tramo.duration) })),
    // OSRM entrega [longitud, latitud].
    trazado: viaje.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
  };
}
