import type { Coordenada } from '@rockstar/contracts';

/** "850 m" o "12,4 km". */
export function formatoDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }
  return `${(metros / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} km`;
}

/** "5 min" o "1 h 20 min". */
export function formatoDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) {
    return `${minutos} min`;
  }
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/**
 * Enlace que abre la navegación hasta un punto en Google Maps (la app del teléfono, si
 * está instalada). Usa las coordenadas: la dirección escrita podría llevar a otro lugar.
 */
export function enlaceNavegacion(destino: Coordenada, origen?: Coordenada): string {
  const parametros = new URLSearchParams({ api: '1', destination: `${destino.lat},${destino.lon}`, travelmode: 'driving' });
  if (origen) {
    parametros.set('origin', `${origen.lat},${origen.lon}`);
  }
  return `https://www.google.com/maps/dir/?${parametros}`;
}
