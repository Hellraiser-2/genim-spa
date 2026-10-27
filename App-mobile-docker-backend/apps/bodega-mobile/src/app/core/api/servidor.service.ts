import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { environment } from '../../../environments/environment';

const CLAVE = 'servidor';
const ESPERA_PRUEBA_MS = 6000;
/** Puerto de la API cuando se escribe solo la IP del equipo. */
export const PUERTO_API = 3000;

/** A qué se conecta la app: a un servidor real o al backend simulado de demostración. */
export interface Conexion {
  modoDemo: boolean;
  /** Dirección del servidor, sin la ruta de la API: `http://192.168.1.20:3000`. */
  direccion: string;
}

/**
 * Deja una dirección escrita a mano en la forma `http://equipo:puerto`: agrega el
 * protocolo si falta y quita la barra final y la ruta de la API si se pegaron completas.
 * Con solo la IP o el nombre del equipo, sin protocolo ni puerto, usa el puerto de la API.
 * Devuelve `null` si no es una dirección válida.
 */
export function normalizarDireccion(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio === '') {
    return null;
  }
  try {
    const conProtocolo = /^https?:\/\//i.test(limpio);
    const url = new URL(conProtocolo ? limpio : `http://${limpio}`);
    if (!conProtocolo && url.port === '') {
      url.port = String(PUERTO_API);
    }
    return url.hostname === '' ? null : url.origin;
  } catch {
    return null;
  }
}

/**
 * Conexión elegida por el usuario. En un teléfono la dirección del backend no se conoce
 * al compilar y cambia con la red, así que se configura en la app y se guarda en el dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class ServidorService {
  /** Falso cuando la app y la API comparten origen, como en la imagen Docker. */
  readonly configurable = environment.servidorConfigurable;

  readonly modoDemo = signal(environment.useMockApi);
  readonly direccion = signal(environment.servidorPorDefecto);
  /** La app instalada aún no sabe a qué servidor conectarse: hay que pedirle la IP. */
  readonly sinServidor = computed(() => this.configurable && !this.modoDemo() && this.direccion() === '');

  /** Recupera la conexión guardada en el dispositivo al abrir la app. */
  async restaurar(): Promise<void> {
    if (!this.configurable) {
      return;
    }
    const { value } = await Preferences.get({ key: CLAVE });
    if (!value) {
      return;
    }
    try {
      const guardada = JSON.parse(value) as Partial<Conexion>;
      if (typeof guardada.modoDemo === 'boolean' && typeof guardada.direccion === 'string') {
        this.modoDemo.set(guardada.modoDemo);
        this.direccion.set(guardada.direccion);
      }
    } catch {
      // Un valor ilegible se ignora: quedan los valores por defecto.
    }
  }

  async guardar(conexion: Conexion): Promise<void> {
    this.modoDemo.set(conexion.modoDemo);
    this.direccion.set(conexion.direccion);
    await Preferences.set({ key: CLAVE, value: JSON.stringify(conexion) });
  }

  /**
   * Dirección real de una solicitud armada con el prefijo `environment.apiUrl`. Con un
   * servidor elegido, cambia ese prefijo por el del servidor; si no, la deja igual.
   */
  resolver(url: string): string {
    if (!this.configurable || this.modoDemo() || this.direccion() === '' || !url.startsWith(environment.apiUrl)) {
      return url;
    }
    return `${this.direccion()}/api/v1${url.slice(environment.apiUrl.length)}`;
  }

  /** Verifica que en esa dirección responde el backend de Rockstar. */
  async probar(direccion: string): Promise<boolean> {
    const limite = new AbortController();
    const temporizador = setTimeout(() => limite.abort(), ESPERA_PRUEBA_MS);
    try {
      const respuesta = await fetch(`${direccion}/api/v1/salud`, { signal: limite.signal });
      return respuesta.ok && ((await respuesta.json()) as { estado?: unknown }).estado === 'ok';
    } catch {
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
