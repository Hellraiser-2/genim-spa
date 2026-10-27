import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Coordenada, PrecisionUbicacion } from '@rockstar/contracts';

import { claveDe } from '../comun/texto.js';
import { CONFIGURACION, type Configuracion } from '../config.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { type RespuestaViajeOsrm, type Viaje, leerViajeOsrm } from './rutas.js';

const MS_DE_ESPERA = 8000;
/** Nominatim pide como máximo una consulta por segundo. */
const MS_ENTRE_BUSQUEDAS = 1100;
/** Una dirección que no se encontró se vuelve a buscar después de un día. */
const HORAS_PARA_REINTENTAR = 24;

export interface Ubicacion {
  ubicacion: Coordenada;
  precision: PrecisionUbicacion;
}

interface FilaGeocodificacion {
  lat: number | null;
  lon: number | null;
  precision: PrecisionUbicacion | null;
  vigente: boolean;
}

/**
 * Mapas de OpenStreetMap: Nominatim ubica direcciones y OSRM calcula recorridos por calles.
 * Son servicios públicos y gratuitos con reglas de uso: identificarse, no repetir consultas
 * y no pasar de una búsqueda por segundo. Por eso cada dirección se busca una vez y queda
 * guardada en la base. Si un servicio no responde, quien llama recibe `null`, sin error.
 */
@Injectable()
export class MapasService {
  private readonly log = new Logger('Mapas');
  private ultimaBusqueda = 0;

  constructor(
    private readonly db: BaseDeDatos,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  /**
   * Ubica una dirección de la Región Metropolitana. Si la calle no aparece, usa el centro de
   * su comuna como ubicación aproximada. `null` si tampoco se encuentra la comuna.
   */
  async ubicar(direccion: string, comuna: string): Promise<Ubicacion | null> {
    // Lo que va después de la primera coma suele ser el departamento u oficina: confunde la búsqueda.
    const calle = direccion.split(',')[0]!.trim();
    const exacta = await this.buscar(`${calle}|${comuna}`, { street: calle, city: comuna, state: 'Región Metropolitana' }, 'DIRECCION');
    return exacta ?? this.buscar(`|${comuna}`, { city: comuna, state: 'Región Metropolitana' }, 'COMUNA');
  }

  /** Recorrido por calles que sale del origen, pasa por los destinos en el mejor orden y vuelve. */
  async viaje(origen: Coordenada, destinos: Coordenada[]): Promise<Viaje | null> {
    const puntos = [origen, ...destinos].map((punto) => `${punto.lon},${punto.lat}`).join(';');
    const ruta = `/trip/v1/driving/${puntos}?source=first&roundtrip=true&geometries=geojson&overview=full`;
    try {
      const respuesta = await fetch(`${this.configuracion.rutasUrl}${ruta}`, {
        headers: { 'User-Agent': this.configuracion.agenteMapas },
        signal: AbortSignal.timeout(MS_DE_ESPERA),
      });
      const viaje = leerViajeOsrm((await respuesta.json()) as RespuestaViajeOsrm, destinos.length);
      if (!viaje) this.log.warn(`El servicio de rutas respondió ${respuesta.status} sin un viaje válido.`);
      return viaje;
    } catch (error) {
      this.log.warn(`El servicio de rutas no respondió: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async buscar(texto: string, campos: Record<string, string>, precision: PrecisionUbicacion): Promise<Ubicacion | null> {
    const consulta = claveDe(texto) || texto.toLowerCase();
    const [guardada] = await this.db.consultar<FilaGeocodificacion>(
      `SELECT lat, lon, precision, buscada_en > now() - make_interval(hours => ${HORAS_PARA_REINTENTAR}) AS vigente
       FROM logistica.geocodificaciones WHERE consulta = $1`,
      [consulta],
    );
    if (guardada && (guardada.lat !== null || guardada.vigente)) {
      return guardada.lat === null ? null : { ubicacion: { lat: guardada.lat, lon: guardada.lon! }, precision: guardada.precision! };
    }

    const encontrada = await this.consultarNominatim(campos);
    if (encontrada === undefined) {
      // Sin respuesta del servicio: no se guarda nada y se intenta en la próxima consulta.
      return null;
    }
    await this.db.consultar(
      `INSERT INTO logistica.geocodificaciones (consulta, lat, lon, precision) VALUES ($1, $2, $3, $4)
       ON CONFLICT (consulta) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, precision = EXCLUDED.precision, buscada_en = now()`,
      [consulta, encontrada?.lat ?? null, encontrada?.lon ?? null, encontrada ? precision : null],
    );
    return encontrada ? { ubicacion: encontrada, precision } : null;
  }

  /** La primera coincidencia en Chile; `null` si no hay ninguna y `undefined` si el servicio no respondió. */
  private async consultarNominatim(campos: Record<string, string>): Promise<Coordenada | null | undefined> {
    const espera = this.ultimaBusqueda + MS_ENTRE_BUSQUEDAS - Date.now();
    if (espera > 0) await new Promise((resolver) => setTimeout(resolver, espera));
    this.ultimaBusqueda = Date.now();

    const parametros = new URLSearchParams({ ...campos, country: 'Chile', countrycodes: 'cl', format: 'jsonv2', limit: '1' });
    try {
      const respuesta = await fetch(`${this.configuracion.geocodificadorUrl}/search?${parametros}`, {
        headers: { 'User-Agent': this.configuracion.agenteMapas, 'Accept-Language': 'es' },
        signal: AbortSignal.timeout(MS_DE_ESPERA),
      });
      if (!respuesta.ok) {
        this.log.warn(`El servicio de direcciones respondió ${respuesta.status}.`);
        return undefined;
      }
      const [primera] = (await respuesta.json()) as { lat: string; lon: string }[];
      return primera ? { lat: Number(primera.lat), lon: Number(primera.lon) } : null;
    } catch (error) {
      this.log.warn(`El servicio de direcciones no respondió: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
}
