import { Injectable } from '@nestjs/common';
import type { BalanceDia, CanalVenta, VentaResumen } from '@rockstar/contracts';

import { exigir } from '../comun/errores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';

/** Valida el filtro `desde` (AAAA-MM-DD); vacío es sin filtro. */
function fechaDesde(desde?: string): string | null {
  exigir(desde === undefined || desde === '' || /^\d{4}-\d{2}-\d{2}$/.test(desde), 'La fecha debe tener el formato AAAA-MM-DD.');
  return desde ? desde : null;
}

interface FilaBalanceVentas {
  dia: string;
  ingreso_web: number;
  ingreso_pos: number;
  costo_prendas: number;
  despacho: number;
  comisiones: number;
}

interface FilaVenta {
  id_venta: number;
  fecha: Date;
  canal: CanalVenta;
  total: number;
  flete: number;
  unidades: number;
  cliente: string | null;
  vendedor: string | null;
  medio_pago: string | null;
}

/** Ventas pagadas de la tienda web y del POS, juntas, para la vista de Finanzas del Gerente. */
@Injectable()
export class ResumenVentasService {
  constructor(private readonly db: BaseDeDatos) {}

  /**
   * Ingresos y gastos de cada día. Los gastos son los costos de las ventas de ese día
   * (prendas, despacho y comisión) y las mermas registradas ese día, al costo de compra.
   */
  async balance(desde?: string): Promise<BalanceDia[]> {
    const inicio = fechaDesde(desde);
    const [ventas, mermas] = await Promise.all([
      this.db.consultar<FilaBalanceVentas>(
        `SELECT to_char((ve.fecha AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS dia,
                COALESCE(sum(ve.total) FILTER (WHERE ve.canal = 'ECOMMERCE'), 0)::int AS ingreso_web,
                COALESCE(sum(ve.total) FILTER (WHERE ve.canal = 'POS'), 0)::int AS ingreso_pos,
                COALESCE(sum((SELECT sum(d.cantidad * COALESCE(d.costo_unitario, 0))
                              FROM ventas.detalle_venta d WHERE d.id_venta = ve.id_venta)), 0)::int AS costo_prendas,
                COALESCE(sum(cv.costo_despacho), 0)::int AS despacho,
                COALESCE(sum(cv.comision_pago), 0)::int AS comisiones
         FROM ventas.ventas ve
         JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado AND ev.codigo = 'PAGADA'
         LEFT JOIN ventas.costos_venta cv ON cv.id_venta = ve.id_venta
         WHERE $1::date IS NULL OR (ve.fecha AT TIME ZONE 'America/Santiago')::date >= $1::date
         GROUP BY 1`,
        [inicio],
      ),
      this.db.consultar<{ dia: string; mermas: number }>(
        `SELECT to_char((m.fecha AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM-DD') AS dia,
                COALESCE(sum(abs(m.cantidad) * COALESCE(p.costo_compra, 0)), 0)::int AS mermas
         FROM inventario.movimientos m
         JOIN inventario.tipos_movimiento t ON t.id_tipo = m.id_tipo AND t.codigo = 'MERMA'
         JOIN inventario.variantes v ON v.id_variante = m.id_variante
         JOIN inventario.productos p ON p.id_producto = v.id_producto
         WHERE $1::date IS NULL OR (m.fecha AT TIME ZONE 'America/Santiago')::date >= $1::date
         GROUP BY 1`,
        [inicio],
      ),
    ]);
    const dias = new Map<string, BalanceDia>();
    const dia = (fecha: string) => {
      let d = dias.get(fecha);
      if (!d) {
        d = { fecha, ingresoWeb: 0, ingresoPos: 0, costoPrendas: 0, despacho: 0, comisiones: 0, mermas: 0 };
        dias.set(fecha, d);
      }
      return d;
    };
    for (const v of ventas) {
      Object.assign(dia(v.dia), {
        ingresoWeb: v.ingreso_web,
        ingresoPos: v.ingreso_pos,
        costoPrendas: v.costo_prendas,
        despacho: v.despacho,
        comisiones: v.comisiones,
      });
    }
    for (const m of mermas) {
      dia(m.dia).mermas = m.mermas;
    }
    return [...dias.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async pagadas(desde?: string): Promise<VentaResumen[]> {
    fechaDesde(desde);
    const filas = await this.db.consultar<FilaVenta>(
      `SELECT ve.id_venta, ve.fecha, ve.canal, ve.total,
              COALESCE(cv.flete_cobrado, 0) AS flete,
              COALESCE((SELECT sum(d.cantidad) FROM ventas.detalle_venta d WHERE d.id_venta = ve.id_venta), 0)::int AS unidades,
              cl.nombre AS cliente, vd.nombre AS vendedor,
              (SELECT mp.nombre FROM pagos.transacciones t JOIN pagos.medios_pago mp ON mp.id_medio = t.id_medio
               WHERE t.id_venta = ve.id_venta AND t.estado = 'AUTORIZADA'
               ORDER BY t.id_transaccion DESC LIMIT 1) AS medio_pago
       FROM ventas.ventas ve
       JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado AND ev.codigo = 'PAGADA'
       LEFT JOIN ventas.costos_venta cv ON cv.id_venta = ve.id_venta
       LEFT JOIN usuarios.usuarios cl ON cl.id_usuario = ve.id_cliente
       LEFT JOIN usuarios.usuarios vd ON vd.id_usuario = ve.id_vendedor
       WHERE $1::date IS NULL OR (ve.fecha AT TIME ZONE 'America/Santiago')::date >= $1::date
       ORDER BY ve.fecha DESC, ve.id_venta DESC`,
      [desde ? desde : null],
    );
    return filas.map((fila) => ({
      idVenta: fila.id_venta,
      fecha: fila.fecha.toISOString(),
      canal: fila.canal,
      total: fila.total,
      flete: fila.flete,
      unidades: fila.unidades,
      cliente: fila.cliente,
      vendedor: fila.vendedor,
      medioPago: fila.medio_pago,
    }));
  }
}
