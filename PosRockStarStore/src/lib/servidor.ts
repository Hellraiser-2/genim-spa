/**
 * Dirección del backend.
 *
 * En el navegador (Docker o `npm run dev`) se usa la de la compilación: `/api/v1` del mismo
 * origen o VITE_API_URL. En la app instalada en un teléfono no hay mismo origen, y la IP del
 * equipo servidor cambia con la red (el Wi-Fi del local o la zona Wi-Fi de un celular): la
 * app la pide al abrirse, la recuerda y la vuelve a pedir si deja de responder.
 */
import { Capacitor } from '@capacitor/core';

const CLAVE = 'rockstar.pos.servidor';
/** Puerto de la API cuando se escribe solo la IP del equipo. */
export const PUERTO_API = 3000;

/** La app corre instalada en un teléfono, no en un navegador. */
export const esAppInstalada = Capacitor.isNativePlatform();

/**
 * "192.168.1.20" -> "http://192.168.1.20:3000"; "http://192.168.1.20:3000/" -> "http://192.168.1.20:3000".
 * Con el protocolo escrito, el puerto se respeta tal cual. `null` si no es una dirección.
 */
export function normalizarServidor(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio === '') return null;
  try {
    const conProtocolo = /^https?:\/\//i.test(limpio);
    const url = new URL(conProtocolo ? limpio : `http://${limpio}`);
    if (!conProtocolo && url.port === '') url.port = String(PUERTO_API);
    return url.hostname === '' ? null : url.origin;
  } catch {
    return null;
  }
}

/** La dirección elegida en el teléfono; vacía si se usa la de la compilación. */
export function servidorElegido(): string {
  try {
    return localStorage.getItem(CLAVE) ?? '';
  } catch {
    return '';
  }
}

export function elegirServidor(direccion: string): void {
  try {
    localStorage.setItem(CLAVE, direccion);
  } catch {
    // Sin almacenamiento, la dirección dura lo que la app siga abierta.
  }
}

/** Base de todas las rutas de la API, por ejemplo "http://192.168.1.20:3000/api/v1". */
export function baseApi(): string {
  const elegido = servidorElegido();
  return elegido ? `${elegido}/api/v1` : import.meta.env.VITE_API_URL || '/api/v1';
}

/** La app instalada aún no sabe a qué servidor conectarse: hay que pedirle la IP. */
export function faltaServidor(): boolean {
  return esAppInstalada && servidorElegido() === '' && !import.meta.env.VITE_API_URL;
}

/** Comprueba que en esa dirección (`http://equipo:puerto`) responde el backend de Rockstar. */
export async function probarServidor(direccion: string, esperaMs = 6000): Promise<boolean> {
  const limite = new AbortController();
  const temporizador = setTimeout(() => limite.abort(), esperaMs);
  try {
    const respuesta = await fetch(`${direccion}/api/v1/salud`, { signal: limite.signal });
    return respuesta.ok && ((await respuesta.json()) as { estado?: unknown }).estado === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

/** El equipo de una dirección, sin protocolo ni puerto: "http://192.168.1.20:3000" -> "192.168.1.20". */
export function equipoDe(direccion: string): string {
  try {
    return new URL(direccion).hostname;
  } catch {
    return '';
  }
}

/** El servidor al que apunta la app ahora, sin el `/api/v1`, para mostrarlo. */
export function servidorActual(): string {
  return baseApi().replace(/\/api\/v1\/?$/, '') || 'este mismo origen';
}
