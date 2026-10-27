import type { Ejecutor } from '../db/base-de-datos.js';
import { OFERTA_DEL_MES } from '../inventario/consultas.js';

/**
 * Lo que la tienda sabe de sí misma y el asesor necesita para recomendar: qué hay, qué se
 * vendió y qué bandas vienen a Chile. Se arma de nuevo en cada consulta, con los datos del
 * momento. No lleva datos de clientes ni del personal.
 */
export interface ResumenDeNegocio {
  /** Día en que se armó, con la fecha de Chile. */
  fecha: string;
  moneda: 'CLP';
  ventas: {
    /** Ventas pagadas registradas en total, por web y en tienda. */
    pagadas: number;
    primera: string | null;
    ultima: string | null;
  };
  porCategoria: Agrupado[];
  porBanda: (Agrupado & { conciertoEnChile: Concierto | null })[];
  productos: ProductoResumido[];
}

interface Agrupado {
  nombre: string;
  productos: number;
  unidadesEnStock: number;
  unidadesVendidas: number;
  unidadesVendidasUltimos30Dias: number;
  ingresos: number;
}

interface Concierto {
  fecha: string;
  lugar: string | null;
}

interface ProductoResumido {
  producto: string;
  categoria: string;
  /** `null` en las prendas que no son de una banda. */
  banda: string | null;
  /** `null` si aún no tiene precio y por eso no está a la venta. */
  precio: number | null;
  /** Precio rebajado de este mes, si está en oferta. */
  precioOferta: number | null;
  /** Costo de compra; `null` si no está registrado. */
  costo: number | null;
  unidadesEnStock: number;
  tallasAgotadas: string[];
  unidadesVendidas: number;
  unidadesVendidasUltimos30Dias: number;
  ingresos: number;
  /** Unidades dadas de baja por daño u otra merma. */
  unidadesPerdidas: number;
}

interface FilaProducto {
  producto: string;
  categoria: string;
  banda: string | null;
  precio: number | null;
  precio_oferta: number | null;
  costo_compra: number | null;
  stock: number;
  tallas_agotadas: string[];
  vendidas: number;
  vendidas_30: number;
  ingresos: number;
  mermas: number;
}

const PRODUCTOS = `
  SELECT p.nombre AS producto, c.nombre AS categoria, b.nombre AS banda, p.precio, o.precio_oferta, p.costo_compra,
         COALESCE(s.stock, 0)::int AS stock, COALESCE(s.tallas_agotadas, '{}') AS tallas_agotadas,
         COALESCE(v.vendidas, 0)::int AS vendidas, COALESCE(v.vendidas_30, 0)::int AS vendidas_30,
         COALESCE(v.ingresos, 0)::int AS ingresos, COALESCE(m.mermas, 0)::int AS mermas
  FROM inventario.productos p
  JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
  LEFT JOIN inventario.bandas b ON b.id_banda = p.id_banda
  ${OFERTA_DEL_MES}
  LEFT JOIN LATERAL (
    SELECT sum(x.cantidad) AS stock, array_agg(x.talla ORDER BY x.talla) FILTER (WHERE x.cantidad = 0) AS tallas_agotadas
    FROM (SELECT t.nombre AS talla, COALESCE(sum(e.cantidad), 0) AS cantidad
          FROM inventario.variantes va
          JOIN inventario.tallas t ON t.id_talla = va.id_talla
          LEFT JOIN inventario.existencias e ON e.id_variante = va.id_variante
          WHERE va.id_producto = p.id_producto AND va.activo
          GROUP BY va.id_variante, t.nombre) x
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT sum(d.cantidad) AS vendidas,
           sum(d.cantidad) FILTER (WHERE ve.fecha >= now() - interval '30 days') AS vendidas_30,
           sum(d.cantidad * d.precio_unitario) AS ingresos
    FROM ventas.detalle_venta d
    JOIN ventas.ventas ve ON ve.id_venta = d.id_venta
    JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado AND ev.codigo = 'PAGADA'
    JOIN inventario.variantes va ON va.id_variante = d.id_variante
    WHERE va.id_producto = p.id_producto
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT sum(abs(mo.cantidad)) AS mermas
    FROM inventario.movimientos mo
    JOIN inventario.tipos_movimiento tm ON tm.id_tipo = mo.id_tipo AND tm.codigo = 'MERMA'
    JOIN inventario.variantes va ON va.id_variante = mo.id_variante
    WHERE va.id_producto = p.id_producto
  ) m ON true
  WHERE p.activo
  ORDER BY p.nombre`;

function agrupar(productos: ProductoResumido[], clave: (producto: ProductoResumido) => string | null): Agrupado[] {
  const grupos = new Map<string, Agrupado>();
  for (const producto of productos) {
    const nombre = clave(producto);
    if (nombre === null) {
      continue;
    }
    const grupo = grupos.get(nombre) ?? { nombre, productos: 0, unidadesEnStock: 0, unidadesVendidas: 0, unidadesVendidasUltimos30Dias: 0, ingresos: 0 };
    grupo.productos += 1;
    grupo.unidadesEnStock += producto.unidadesEnStock;
    grupo.unidadesVendidas += producto.unidadesVendidas;
    grupo.unidadesVendidasUltimos30Dias += producto.unidadesVendidasUltimos30Dias;
    grupo.ingresos += producto.ingresos;
    grupos.set(nombre, grupo);
  }
  return [...grupos.values()].sort((a, b) => b.ingresos - a.ingresos || a.nombre.localeCompare(b.nombre, 'es'));
}

export async function resumenDeNegocio(db: Ejecutor): Promise<ResumenDeNegocio> {
  const filas = await db.consultar<FilaProducto>(PRODUCTOS);
  const [ventas] = await db.consultar<{ hoy: string; pagadas: number; primera: string | null; ultima: string | null }>(
    `SELECT to_char(now() AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS hoy, count(*)::int AS pagadas,
            to_char(min(ve.fecha) AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS primera,
            to_char(max(ve.fecha) AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS ultima
     FROM ventas.ventas ve
     JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado AND ev.codigo = 'PAGADA'`,
  );
  const bandas = await db.consultar<{ nombre: string; fecha: string | null; lugar: string | null }>(
    `SELECT nombre, to_char(concierto_fecha, 'YYYY-MM-DD') AS fecha, concierto_lugar AS lugar FROM inventario.bandas`,
  );

  const productos = filas.map<ProductoResumido>((fila) => ({
    producto: fila.producto,
    categoria: fila.categoria,
    banda: fila.banda,
    precio: fila.precio,
    precioOferta: fila.precio_oferta,
    costo: fila.costo_compra,
    unidadesEnStock: fila.stock,
    tallasAgotadas: fila.tallas_agotadas,
    unidadesVendidas: fila.vendidas,
    unidadesVendidasUltimos30Dias: fila.vendidas_30,
    ingresos: fila.ingresos,
    unidadesPerdidas: fila.mermas,
  }));

  // Las bandas registradas sin productos también cuentan: son candidatas a una primera compra.
  const conProductos = agrupar(productos, (producto) => producto.banda);
  const sinProductos = bandas
    .filter((banda) => !conProductos.some((grupo) => grupo.nombre === banda.nombre))
    .map<Agrupado>((banda) => ({ nombre: banda.nombre, productos: 0, unidadesEnStock: 0, unidadesVendidas: 0, unidadesVendidasUltimos30Dias: 0, ingresos: 0 }));
  const concierto = (nombre: string): Concierto | null => {
    const banda = bandas.find((b) => b.nombre === nombre);
    return banda?.fecha ? { fecha: banda.fecha, lugar: banda.lugar } : null;
  };

  return {
    fecha: ventas!.hoy,
    moneda: 'CLP',
    ventas: { pagadas: ventas!.pagadas, primera: ventas!.primera, ultima: ventas!.ultima },
    porCategoria: agrupar(productos, (producto) => producto.categoria),
    porBanda: [...conProductos, ...sinProductos].map((grupo) => ({ ...grupo, conciertoEnChile: concierto(grupo.nombre) })),
    productos,
  };
}
