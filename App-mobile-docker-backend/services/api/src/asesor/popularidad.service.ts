import { Inject, Injectable, Logger } from '@nestjs/common';

import { CONFIGURACION, type Configuracion } from '../config.js';

/** Géneros de Deezer cuyos rankings de canciones se revisan: metal y rock. */
const GENEROS = [464, 152];
const CANCIONES_POR_RANKING = 100;
const MS_DE_ESPERA = 6000;
/** Consultas simultáneas; Deezer admite 50 cada 5 segundos. */
const EN_PARALELO = 6;
/** La popularidad cambia despacio: se consulta de nuevo pasado este tiempo. */
const MS_DE_VIGENCIA = 6 * 60 * 60 * 1000;

export interface ArtistaEnRanking {
  nombre: string;
  canciones: number;
  /** Mejor puesto de una de sus canciones, desde 1. */
  mejorPuesto: number;
}

/** Lo que se sabe por internet de la popularidad de las bandas, por clave de artista. */
export interface Popularidad {
  /** Falso si Deezer no respondió nada. */
  disponible: boolean;
  fans: Map<string, number>;
  ranking: Map<string, ArtistaEnRanking>;
}

/** Nombre de un artista sin mayúsculas, tildes ni signos: "AC/DC" y "Ac Dc" son el mismo. */
export function claveDeArtista(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

interface ArtistaDeezer {
  name: string;
  nb_fan: number;
}

interface CancionDeezer {
  id: number;
  artist: { name: string };
}

/**
 * Popularidad de las bandas según Deezer, por su API pública: no pide clave ni cobra.
 * Entrega los seguidores de cada banda y qué artistas tienen canciones en los rankings
 * actuales de metal y rock. Es un dato de apoyo: si Deezer no responde, quien consulta
 * recibe lo que haya, sin error.
 */
@Injectable()
export class PopularidadService {
  private readonly log = new Logger('Popularidad');
  private readonly url: string;
  private guardada: { bandas: string; vence: number; datos: Popularidad } | null = null;

  constructor(@Inject(CONFIGURACION) configuracion: Configuracion) {
    this.url = configuracion.deezerUrl;
  }

  async consultar(bandas: string[]): Promise<Popularidad> {
    const clave = [...bandas].sort().join('|');
    if (this.guardada && this.guardada.bandas === clave && this.guardada.vence > Date.now()) {
      return this.guardada.datos;
    }
    const [fans, ranking] = await Promise.all([this.fansDe(bandas), this.rankingActual()]);
    const datos: Popularidad = { disponible: fans !== null || ranking !== null, fans: fans ?? new Map(), ranking: ranking ?? new Map() };
    // Una consulta fallida no se guarda: la siguiente lo intenta de nuevo.
    if (fans !== null && ranking !== null) {
      this.guardada = { bandas: clave, vence: Date.now() + MS_DE_VIGENCIA, datos };
    }
    return datos;
  }

  private async pedir<T>(ruta: string): Promise<T[] | null> {
    try {
      const respuesta = await fetch(`${this.url}${ruta}`, { signal: AbortSignal.timeout(MS_DE_ESPERA) });
      const cuerpo = (await respuesta.json()) as { data?: T[] };
      return respuesta.ok && Array.isArray(cuerpo.data) ? cuerpo.data : null;
    } catch (error) {
      this.log.warn(`Deezer no respondió ${ruta}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** Seguidores de cada banda. `null` si ninguna consulta resultó. */
  private async fansDe(bandas: string[]): Promise<Map<string, number> | null> {
    const fans = new Map<string, number>();
    let respondio = false;
    for (let inicio = 0; inicio < bandas.length; inicio += EN_PARALELO) {
      await Promise.all(
        bandas.slice(inicio, inicio + EN_PARALELO).map(async (banda) => {
          const artistas = await this.pedir<ArtistaDeezer>(`/search/artist?q=${encodeURIComponent(banda)}&limit=25`);
          if (artistas === null) {
            return;
          }
          respondio = true;
          // La búsqueda trae homónimos y tributos: vale el artista de nombre igual con más seguidores.
          const iguales = artistas.filter((artista) => claveDeArtista(artista.name) === claveDeArtista(banda));
          if (iguales.length > 0) {
            fans.set(claveDeArtista(banda), Math.max(...iguales.map((artista) => artista.nb_fan)));
          }
        }),
      );
    }
    return respondio || bandas.length === 0 ? fans : null;
  }

  /** Artistas con canciones en los rankings actuales de metal y rock. `null` si ningún ranking respondió. */
  private async rankingActual(): Promise<Map<string, ArtistaEnRanking> | null> {
    const rankings = await Promise.all(GENEROS.map((genero) => this.pedir<CancionDeezer>(`/chart/${genero}/tracks?limit=${CANCIONES_POR_RANKING}`)));
    if (rankings.every((ranking) => ranking === null)) {
      return null;
    }
    const artistas = new Map<string, ArtistaEnRanking & { vistas: Set<number> }>();
    for (const ranking of rankings) {
      (ranking ?? []).forEach((cancion, indice) => {
        const clave = claveDeArtista(cancion.artist.name);
        const artista = artistas.get(clave) ?? { nombre: cancion.artist.name, canciones: 0, mejorPuesto: indice + 1, vistas: new Set<number>() };
        // Una canción puede estar en los dos rankings: se cuenta una vez.
        if (!artista.vistas.has(cancion.id)) {
          artista.vistas.add(cancion.id);
          artista.canciones += 1;
        }
        artista.mejorPuesto = Math.min(artista.mejorPuesto, indice + 1);
        artistas.set(clave, artista);
      });
    }
    return new Map([...artistas].map(([clave, { nombre, canciones, mejorPuesto }]) => [clave, { nombre, canciones, mejorPuesto }]));
  }
}
