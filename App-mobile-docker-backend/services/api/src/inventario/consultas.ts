import type {
  ArticuloCatalogo,
  Movimiento,
  TipoMerma,
  TipoMovimiento,
  Ubicacion,
  VarianteGestion,
  VarianteStock,
} from '@rockstar/contracts';

import type { Ejecutor } from '../db/base-de-datos.js';
import { ID_UBICACION } from './ubicaciones.js';

/**
 * Una reserva compromete unidades mientras está confirmada (compra pagada sin despachar)
 * o mientras está activa y no ha vencido (pago en curso).
 */
export const RESERVA_VIGENTE = `(r.estado = 'CONFIRMADA' OR (r.estado = 'ACTIVA' AND r.expira_en > now()))`;

/** Primer día del mes en curso en Chile: una oferta rige durante un mes calendario. */
export const MES_ACTUAL = `date_trunc('month', now() AT TIME ZONE 'America/Santiago')::date`;

/** Une al producto `p` su oferta de este mes, si tiene una, con el alias `o`. */
export const OFERTA_DEL_MES = `LEFT JOIN inventario.ofertas o ON o.id_producto = p.id_producto AND o.mes = ${MES_ACTUAL}`;

interface FilaVariante {
  id_variante: number;
  id_producto: number;
  precio: number | null;
  precio_oferta: number | null;
  descripcion: string | null;
  tipo_estampado: string | null;
  sku: string;
  codigo: string;
  producto: string;
  categoria: string;
  banda: string | null;
  imagen_url: string | null;
  codigo_ubicacion: string;
  talla: string;
  color: string;
  activo: boolean;
  bodega: number;
  sala: number;
  reservado: number;
}

const SELECCION_VARIANTE = `
  SELECT v.id_variante, p.id_producto, p.precio, o.precio_oferta, p.descripcion, p.tipo_estampado,
         v.sku, v.codigo, p.nombre AS producto, c.nombre AS categoria, b.nombre AS banda,
         p.imagen_url, p.codigo_ubicacion, t.nombre AS talla, co.nombre AS color,
         (v.activo AND p.activo) AS activo,
         COALESCE((SELECT e.cantidad FROM inventario.existencias e
                   WHERE e.id_variante = v.id_variante AND e.id_ubicacion = ${ID_UBICACION.BODEGA}), 0) AS bodega,
         COALESCE((SELECT e.cantidad FROM inventario.existencias e
                   WHERE e.id_variante = v.id_variante AND e.id_ubicacion = ${ID_UBICACION.SALA_VENTAS}), 0) AS sala,
         COALESCE((SELECT sum(r.cantidad) FROM inventario.reservas r
                   WHERE r.id_variante = v.id_variante AND ${RESERVA_VIGENTE}), 0)::int AS reservado
  FROM inventario.variantes v
  JOIN inventario.productos p ON p.id_producto = v.id_producto
  ${OFERTA_DEL_MES}
  JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
  LEFT JOIN inventario.bandas b ON b.id_banda = p.id_banda
  JOIN inventario.tallas t ON t.id_talla = v.id_talla
  JOIN inventario.colores co ON co.id_color = v.id_color`;

function aVarianteStock(fila: FilaVariante): VarianteStock {
  return {
    idVariante: fila.id_variante,
    sku: fila.sku,
    codigo: fila.codigo,
    producto: fila.producto,
    categoria: fila.categoria,
    banda: fila.banda,
    imagenUrl: fila.imagen_url,
    codigoUbicacion: fila.codigo_ubicacion,
    talla: fila.talla,
    color: fila.color,
    activo: fila.activo,
    existencias: [
      { ubicacion: 'BODEGA', cantidad: fila.bodega },
      { ubicacion: 'SALA_VENTAS', cantidad: fila.sala },
    ],
    reservado: fila.reservado,
    disponible: fila.bodega + fila.sala - fila.reservado,
  };
}

/**
 * Variantes con su stock, ordenadas por identificador. `condicion` es un `WHERE` sobre
 * los alias de la selección (`v`, `p`, `o`, `c`, `b`, `t`, `co`) con sus parámetros.
 */
export async function variantesConStock(ejecutor: Ejecutor, condicion = '', parametros: unknown[] = []): Promise<VarianteStock[]> {
  const filas = await ejecutor.consultar<FilaVariante>(`${SELECCION_VARIANTE} ${condicion} ORDER BY v.id_variante`, parametros);
  return filas.map(aVarianteStock);
}

/** Las mismas variantes, con el precio y la descripción de su producto, para administrarlas. */
export async function variantesDeGestion(ejecutor: Ejecutor, condicion = '', parametros: unknown[] = []): Promise<VarianteGestion[]> {
  const filas = await ejecutor.consultar<FilaVariante>(`${SELECCION_VARIANTE} ${condicion} ORDER BY v.id_variante`, parametros);
  return filas.map((fila) => ({
    ...aVarianteStock(fila),
    idProducto: fila.id_producto,
    precio: fila.precio,
    precioOferta: fila.precio_oferta,
    descripcion: fila.descripcion,
    tipoEstampado: fila.tipo_estampado,
  }));
}

/**
 * Lo que la tienda web ofrece: variantes activas de productos con precio, por nombre de
 * producto. No incluye ubicaciones ni reservas, que son datos internos. El precio es el
 * que se cobra: el de oferta si el producto está en oferta este mes.
 */
export async function articulosDeCatalogo(ejecutor: Ejecutor): Promise<ArticuloCatalogo[]> {
  const filas = await ejecutor.consultar<FilaVariante>(
    `${SELECCION_VARIANTE} WHERE v.activo AND p.activo AND p.precio IS NOT NULL ORDER BY p.nombre, v.id_variante`,
  );
  return filas.map((fila) => ({
    idVariante: fila.id_variante,
    idProducto: fila.id_producto,
    sku: fila.sku,
    producto: fila.producto,
    categoria: fila.categoria,
    banda: fila.banda,
    talla: fila.talla,
    color: fila.color,
    precio: fila.precio_oferta ?? fila.precio!,
    precioNormal: fila.precio_oferta === null ? null : fila.precio!,
    descripcion: fila.descripcion,
    tipoEstampado: fila.tipo_estampado,
    imagenUrl: fila.imagen_url,
    disponible: Math.max(0, fila.bodega + fila.sala - fila.reservado),
  }));
}

interface FilaMovimiento {
  id_movimiento: number;
  id_variante: number;
  tipo: TipoMovimiento;
  tipo_merma: TipoMerma | null;
  ubicacion: Ubicacion;
  ubicacion_destino: Ubicacion | null;
  cantidad: number;
  fecha: Date;
  id_usuario: number;
  motivo: string;
}

/** Movimientos que registró una operación, en el orden en que se registraron. */
export function movimientosDeOperacion(ejecutor: Ejecutor, claveIdempotencia: string): Promise<Movimiento[]> {
  return movimientos(ejecutor, 'WHERE m.clave_idempotencia = $1 ORDER BY m.id_movimiento', [claveIdempotencia]);
}

/** Tope del historial que se entrega de una vez. */
const MAXIMO_HISTORIAL = 500;

/** Historial de movimientos, del más reciente al más antiguo; `tipo` lo limita a uno. */
export function historialDeMovimientos(ejecutor: Ejecutor, tipo: string | null): Promise<Movimiento[]> {
  return movimientos(
    ejecutor,
    `WHERE $1::text IS NULL OR tm.codigo = $1 ORDER BY m.id_movimiento DESC LIMIT ${MAXIMO_HISTORIAL}`,
    [tipo],
  );
}

/** `filtro` es el `WHERE` y el orden sobre los alias de la selección (`m`, `tm`), con sus parámetros. */
async function movimientos(ejecutor: Ejecutor, filtro: string, parametros: unknown[]): Promise<Movimiento[]> {
  const filas = await ejecutor.consultar<FilaMovimiento>(
    `SELECT m.id_movimiento, m.id_variante, tm.codigo AS tipo, tme.codigo AS tipo_merma, u.nombre AS ubicacion,
            ud.nombre AS ubicacion_destino, m.cantidad, m.fecha, m.id_usuario, m.motivo
     FROM inventario.movimientos m
     JOIN inventario.tipos_movimiento tm ON tm.id_tipo = m.id_tipo
     LEFT JOIN inventario.tipos_merma tme ON tme.id_tipo_merma = m.id_tipo_merma
     JOIN inventario.ubicaciones u ON u.id_ubicacion = m.id_ubicacion
     LEFT JOIN inventario.ubicaciones ud ON ud.id_ubicacion = m.id_ubicacion_destino
     ${filtro}`,
    parametros,
  );
  return filas.map((fila) => ({
    idMovimiento: fila.id_movimiento,
    idVariante: fila.id_variante,
    tipo: fila.tipo,
    ...(fila.tipo_merma ? { tipoMerma: fila.tipo_merma } : {}),
    ubicacion: fila.ubicacion,
    ...(fila.ubicacion_destino ? { ubicacionDestino: fila.ubicacion_destino } : {}),
    cantidad: fila.cantidad,
    fecha: fila.fecha.toISOString(),
    idUsuario: fila.id_usuario,
    motivo: fila.motivo,
  }));
}
