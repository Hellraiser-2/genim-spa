import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { BandaCatalogo, ConciertoBandaRequest, ImagenBandaRequest } from '@rockstar/contracts';

import { cuerpoComo, exigir, noEncontrado, texto } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { CatalogosService } from './catalogos.service.js';

/** Tamaño máximo de la foto de una banda, ya decodificada. */
const MAXIMO_BYTES = 2 * 1024 * 1024;
const LARGO_MAXIMO_CREDITO = 300;

const FORMA_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Primeros bytes de cada formato admitido. El tipo declarado debe coincidir con el
 * contenido: lo que se guarda se entrega después a los navegadores con ese tipo, y no
 * debe poder colarse otra cosa (un HTML, un SVG con código) haciéndola pasar por foto.
 */
const FIRMAS: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const LARGO_MAXIMO_LUGAR = 120;
const FORMA_FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface FilaBanda {
  id_banda: number;
  nombre: string;
  imagen_huella: string | null;
  imagen_credito: string | null;
  concierto_fecha: string | null;
  concierto_lugar: string | null;
}

export interface ImagenDeBanda {
  bytes: Buffer;
  tipo: string;
}

const aBanda = (fila: FilaBanda): BandaCatalogo => ({
  idBanda: fila.id_banda,
  nombre: fila.nombre,
  // La huella en la dirección hace que una foto nueva tenga dirección nueva: la anterior se puede guardar para siempre.
  imagenUrl: fila.imagen_huella ? `/api/v1/inventario/catalogo/bandas/${fila.id_banda}/imagen?v=${fila.imagen_huella}` : null,
  credito: fila.imagen_credito,
  concierto: fila.concierto_fecha ? { fecha: fila.concierto_fecha, lugar: fila.concierto_lugar } : null,
});

/** La fecha sale como texto `AAAA-MM-DD`: es un día, no un instante, y no debe correrse con la zona horaria. */
const COLUMNAS = `id_banda, nombre, imagen_huella, imagen_credito, to_char(concierto_fecha, 'YYYY-MM-DD') AS concierto_fecha, concierto_lugar`;
const SELECCION = `SELECT ${COLUMNAS} FROM inventario.bandas`;

/** Indica si el texto `AAAA-MM-DD` es un día que existe; "2026-02-30" no lo es. */
function esFecha(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !FORMA_FECHA.test(valor)) {
    return false;
  }
  const dia = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().startsWith(valor);
}

/**
 * Lo que la tienda muestra de cada banda: su foto, que se guarda en la base y se entrega
 * por una dirección del backend, y su próximo concierto en Chile.
 */
@Injectable()
export class BandasService {
  constructor(
    private readonly db: BaseDeDatos,
    private readonly catalogos: CatalogosService,
  ) {}

  /** Todas las bandas con la dirección de su foto, en orden alfabético. */
  async listar(): Promise<BandaCatalogo[]> {
    const filas = await this.db.consultar<FilaBanda>(SELECCION);
    return filas.map(aBanda).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async imagen(idBanda: number): Promise<ImagenDeBanda> {
    const [fila] = await this.db.consultar<{ imagen: Buffer | null; imagen_tipo: string | null }>(
      'SELECT imagen, imagen_tipo FROM inventario.bandas WHERE id_banda = $1',
      [idBanda],
    );
    if (!fila?.imagen || !fila.imagen_tipo) {
      throw noEncontrado('La banda no tiene foto.');
    }
    return { bytes: fila.imagen, tipo: fila.imagen_tipo };
  }

  /** Guarda la foto de la banda, registrándola si aún no existe. */
  async guardarImagen(cuerpo: unknown): Promise<BandaCatalogo> {
    const datos = cuerpoComo<ImagenBandaRequest>(cuerpo);
    const partes = FORMA_DATA_URL.exec(typeof datos.imagen === 'string' ? datos.imagen : '');
    exigir(partes !== null, 'La imagen debe ser una foto JPEG, PNG o WebP.');
    const [, tipo, base64] = partes;
    const bytes = Buffer.from(base64!, 'base64');
    exigir(bytes.length <= MAXIMO_BYTES, 'La imagen no puede pesar más de 2 MB.');
    exigir(FIRMAS[tipo!]!(bytes), 'El contenido de la imagen no corresponde a su formato.');
    exigir(datos.credito == null || typeof datos.credito === 'string', 'El crédito de la foto no es válido.');
    const credito = texto(datos.credito).slice(0, LARGO_MAXIMO_CREDITO) || null;
    const huella = createHash('sha256').update(bytes).digest('hex').slice(0, 16);

    return this.db.transaccion(async (tx: Ejecutor) => {
      const banda = await this.catalogos.incorporar(tx, 'bandas', datos.banda);
      const [fila] = await tx.consultar<FilaBanda>(
        `UPDATE inventario.bandas SET imagen = $2, imagen_tipo = $3, imagen_huella = $4, imagen_credito = $5
         WHERE id_banda = $1 RETURNING ${COLUMNAS}`,
        [banda.id, bytes, tipo, huella, credito],
      );
      return aBanda(fila!);
    });
  }

  /** Registra el próximo concierto de la banda en Chile, o lo quita si no viene fecha. */
  async guardarConcierto(cuerpo: unknown): Promise<BandaCatalogo> {
    const datos = cuerpoComo<ConciertoBandaRequest>(cuerpo);
    exigir(datos.fecha === null || esFecha(datos.fecha), 'La fecha del concierto debe ser un día válido, con la forma AAAA-MM-DD.');
    exigir(datos.lugar == null || typeof datos.lugar === 'string', 'El lugar del concierto no es válido.');
    const fecha = datos.fecha ?? null;
    const lugar = fecha === null ? null : texto(datos.lugar).slice(0, LARGO_MAXIMO_LUGAR) || null;

    return this.db.transaccion(async (tx: Ejecutor) => {
      const banda = await this.catalogos.incorporar(tx, 'bandas', datos.banda);
      const [fila] = await tx.consultar<FilaBanda>(
        `UPDATE inventario.bandas SET concierto_fecha = $2, concierto_lugar = $3 WHERE id_banda = $1 RETURNING ${COLUMNAS}`,
        [banda.id, fecha, lugar],
      );
      return aBanda(fila!);
    });
  }
}
