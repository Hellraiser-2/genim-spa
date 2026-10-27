import { Injectable } from '@nestjs/common';
import type { Categoria, GuiaDeTallas, MedidaDeTalla, MedidasDeCategoriaRequest } from '@rockstar/contracts';

import { cuerpoComo, esEnteroPositivo, exigir, noEncontrado, texto } from '../comun/errores.js';
import { claveDe, ordenar } from '../comun/texto.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { elegirZona } from './ubicaciones.js';

/** Catálogos de un solo nombre, con la columna de su identificador. */
const CATALOGOS = { bandas: 'id_banda', colores: 'id_color', tallas: 'id_talla' } as const;
export type Catalogo = keyof typeof CATALOGOS;

/** Tallas con que nace una categoría nueva. */
const TALLAS_POR_DEFECTO = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/** Tope de una medida de la guía de tallas: ninguna prenda mide más. */
const MAXIMO_CM = 300;

/** Número arbitrario y fijo: serializa la creación de categorías, que deben repartirse las zonas de bodega. */
const CANDADO_CATEGORIAS = 7_301_002;

export interface Registro {
  id: number;
  nombre: string;
}

export interface RegistroDeCategoria extends Registro {
  usaBanda: boolean;
}

/** Bandas, colores, tallas y categorías: listas que existen por sí mismas, tengan o no productos. */
@Injectable()
export class CatalogosService {
  constructor(private readonly db: BaseDeDatos) {}

  async listar(catalogo: Catalogo): Promise<string[]> {
    const filas = await this.db.consultar<{ nombre: string }>(`SELECT nombre FROM inventario.${catalogo}`);
    return ordenar(filas.map((fila) => fila.nombre));
  }

  /** Registra el nombre y devuelve la lista completa. */
  async agregar(catalogo: Catalogo, nombre: unknown): Promise<string[]> {
    await this.incorporar(this.db, catalogo, nombre);
    return this.listar(catalogo);
  }

  /**
   * Devuelve el registro con ese nombre, creándolo si no existe. Un nombre que solo
   * difiere en mayúsculas o tildes de uno registrado es el mismo: se conserva el existente.
   */
  async incorporar(ejecutor: Ejecutor, catalogo: Catalogo, nombre: unknown): Promise<Registro> {
    const limpio = texto(nombre);
    exigir(limpio !== '', 'El nombre es obligatorio.');
    const columna = CATALOGOS[catalogo];
    const clave = claveDe(limpio);
    const [nuevo] = await ejecutor.consultar<Registro>(
      `INSERT INTO inventario.${catalogo} (nombre, clave) VALUES ($1, $2)
       ON CONFLICT (clave) DO NOTHING RETURNING ${columna} AS id, nombre`,
      [limpio, clave],
    );
    if (nuevo) {
      return nuevo;
    }
    const [existente] = await ejecutor.consultar<Registro>(
      `SELECT ${columna} AS id, nombre FROM inventario.${catalogo} WHERE clave = $1`,
      [clave],
    );
    return existente!;
  }

  async listarCategorias(): Promise<Categoria[]> {
    const filas = await this.db.consultar<{ nombre: string; usa_banda: boolean; tallas: string[] }>(
      `SELECT c.nombre, c.usa_banda,
              COALESCE(array_agg(t.nombre ORDER BY ct.orden) FILTER (WHERE t.id_talla IS NOT NULL), '{}') AS tallas
       FROM inventario.categorias c
       LEFT JOIN inventario.categorias_tallas ct ON ct.id_categoria = c.id_categoria
       LEFT JOIN inventario.tallas t ON t.id_talla = ct.id_talla
       GROUP BY c.id_categoria`,
    );
    return filas
      .map((fila) => ({ nombre: fila.nombre, tallas: fila.tallas, usaBanda: fila.usa_banda }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async agregarCategoria(nombre: unknown): Promise<Categoria[]> {
    await this.db.transaccion((tx) => this.incorporarCategoria(tx, nombre));
    return this.listarCategorias();
  }

  /**
   * Devuelve la categoría con ese nombre, creándola si no existe. Una categoría nueva
   * nace con tallas XS a XXL, admite banda y recibe su zona en la bodega.
   * Debe llamarse dentro de una transacción.
   */
  async incorporarCategoria(tx: Ejecutor, nombre: unknown): Promise<RegistroDeCategoria> {
    const limpio = texto(nombre);
    exigir(limpio !== '', 'El nombre es obligatorio.');
    const clave = claveDe(limpio);
    const buscar = async () =>
      (
        await tx.consultar<RegistroDeCategoria>(
          'SELECT id_categoria AS id, nombre, usa_banda AS "usaBanda" FROM inventario.categorias WHERE clave = $1',
          [clave],
        )
      )[0];

    let categoria = await buscar();
    if (categoria) {
      return categoria;
    }
    // Dos altas simultáneas podrían elegir la misma zona: se hacen de a una.
    await tx.consultar('SELECT pg_advisory_xact_lock($1)', [CANDADO_CATEGORIAS]);
    categoria = await buscar();
    if (categoria) {
      return categoria;
    }
    const zonas = await tx.consultar<{ zona: string }>('SELECT zona FROM inventario.categorias');
    const zona = elegirZona(limpio, new Set(zonas.map((fila) => fila.zona)));
    [categoria] = await tx.consultar<RegistroDeCategoria>(
      `INSERT INTO inventario.categorias (nombre, clave, zona) VALUES ($1, $2, $3)
       RETURNING id_categoria AS id, nombre, usa_banda AS "usaBanda"`,
      [limpio, clave, zona],
    );
    for (const talla of TALLAS_POR_DEFECTO) {
      await this.admitirTalla(tx, categoria!.id, (await this.incorporar(tx, 'tallas', talla)).id);
    }
    return categoria!;
  }

  /** La guía de tallas de cada categoría, o solo la de una, con las tallas en su orden. */
  async guiasDeTallas(ejecutor: Ejecutor = this.db, idCategoria: number | null = null): Promise<GuiaDeTallas[]> {
    const filas = await ejecutor.consultar<{ categoria: string; tallas: MedidaDeTalla[] }>(
      `SELECT c.nombre AS categoria,
              json_agg(json_build_object('talla', t.nombre, 'anchoCm', ct.ancho_cm, 'largoCm', ct.largo_cm) ORDER BY ct.orden) AS tallas
       FROM inventario.categorias c
       JOIN inventario.categorias_tallas ct ON ct.id_categoria = c.id_categoria
       JOIN inventario.tallas t ON t.id_talla = ct.id_talla
       WHERE $1::int IS NULL OR c.id_categoria = $1
       GROUP BY c.id_categoria`,
      [idCategoria],
    );
    return filas.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'));
  }

  /** Guarda las medidas de las tallas enviadas; las demás tallas de la categoría quedan como están. */
  guardarMedidas(cuerpo: unknown): Promise<GuiaDeTallas> {
    const datos = cuerpoComo<MedidasDeCategoriaRequest>(cuerpo);
    exigir(Array.isArray(datos.tallas) && datos.tallas.length > 0, 'Faltan las medidas de las tallas.');
    const medida = (valor: unknown) => valor === null || valor === undefined || (esEnteroPositivo(valor) && valor <= MAXIMO_CM);
    for (const talla of datos.tallas as Partial<MedidaDeTalla>[]) {
      exigir(typeof talla === 'object' && talla !== null && texto(talla.talla) !== '', 'Cada medida necesita su talla.');
      exigir(medida(talla.anchoCm) && medida(talla.largoCm), `Las medidas van en centímetros enteros, entre 1 y ${MAXIMO_CM}.`);
    }

    return this.db.transaccion(async (tx) => {
      const [categoria] = await tx.consultar<{ id: number }>('SELECT id_categoria AS id FROM inventario.categorias WHERE clave = $1', [claveDe(texto(datos.categoria))]);
      if (!categoria) {
        throw noEncontrado('La categoría no existe.');
      }
      for (const talla of datos.tallas!) {
        const [guardada] = await tx.consultar(
          `UPDATE inventario.categorias_tallas ct SET ancho_cm = $3, largo_cm = $4
           FROM inventario.tallas t
           WHERE t.id_talla = ct.id_talla AND ct.id_categoria = $1 AND t.clave = $2
           RETURNING ct.id_talla`,
          [categoria.id, claveDe(texto(talla.talla)), talla.anchoCm ?? null, talla.largoCm ?? null],
        );
        exigir(guardada !== undefined, `La categoría no admite la talla ${texto(talla.talla)}.`);
      }
      return (await this.guiasDeTallas(tx, categoria.id))[0]!;
    });
  }

  /** Agrega la talla a las que admite la categoría, al final; no hace nada si ya la admite. */
  async admitirTalla(tx: Ejecutor, idCategoria: number, idTalla: number): Promise<void> {
    await tx.consultar(
      `INSERT INTO inventario.categorias_tallas (id_categoria, id_talla, orden)
       VALUES ($1, $2, (SELECT COALESCE(max(orden), 0) + 1 FROM inventario.categorias_tallas WHERE id_categoria = $1))
       ON CONFLICT DO NOTHING`,
      [idCategoria, idTalla],
    );
  }
}
