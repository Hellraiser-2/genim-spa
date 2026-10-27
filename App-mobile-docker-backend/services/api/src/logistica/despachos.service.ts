import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EstadoPedido, Pedido, Ubicacion, Usuario } from '@rockstar/contracts';

import { ErrorDeNegocio, noEncontrado } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { StockService, totalDe } from '../inventario/stock.service.js';
import { pedidosConLineas } from './consultas.js';
import { type DespachoEmitido, type OrdenDeDespacho, TRANSPORTISTA, type Transportista } from './transportista.js';

interface PedidoPorDespachar extends Omit<OrdenDeDespacho, 'referencia' | 'fleteCotizado'> {
  id_venta: number;
  estado: EstadoPedido;
  venta_pagada: boolean;
  flete_cobrado: number;
}

interface LineaPorDespachar {
  id_variante: number;
  sku: string;
  cantidad: number;
}

/** De dónde salen las prendas de un pedido: primero de la bodega y, si no alcanza, de la sala de ventas. */
const ORDEN_DE_SALIDA: readonly Ubicacion[] = ['BODEGA', 'SALA_VENTAS'];

const ID_ESTADO_DESPACHADO = `(SELECT id_estado FROM logistica.estados_pedido WHERE codigo = 'DESPACHADO')`;

/**
 * Genera el despacho de un pedido (CU-11): emite la orden con el transportista, guarda el
 * código de seguimiento y el costo, descuenta las prendas del stock y deja el pedido
 * despachado. Todo ocurre en una transacción: si algo falla, el pedido queda como estaba.
 */
@Injectable()
export class DespachosService {
  private readonly log = new Logger('Despachos');

  constructor(
    private readonly db: BaseDeDatos,
    private readonly stock: StockService,
    @Inject(TRANSPORTISTA) private readonly transportista: Transportista,
  ) {}

  generar(idPedido: number, usuario: Usuario): Promise<Pedido> {
    return this.db.transaccion(async (tx) => {
      // El bloqueo del pedido hace esperar a una segunda solicitud, que al entrar lo encuentra ya despachado.
      const [bloqueado] = await tx.consultar('SELECT id_pedido FROM logistica.pedidos WHERE id_pedido = $1 FOR UPDATE', [idPedido]);
      if (!bloqueado) {
        throw noEncontrado('El pedido no existe.');
      }
      const [pedido] = await tx.consultar<PedidoPorDespachar>(
        `SELECT pe.id_venta, es.codigo AS estado, ev.codigo = 'PAGADA' AS venta_pagada, pe.destinatario, pe.direccion,
                pe.telefono, co.nombre AS comuna, re.nombre AS region, pe.flete_cobrado
         FROM logistica.pedidos pe
         JOIN logistica.estados_pedido es ON es.id_estado = pe.id_estado
         JOIN logistica.comunas co ON co.id_comuna = pe.id_comuna
         JOIN logistica.regiones re ON re.id_region = co.id_region
         JOIN ventas.ventas ve ON ve.id_venta = pe.id_venta
         JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado
         WHERE pe.id_pedido = $1`,
        [idPedido],
      );
      // Un pedido que ya tiene despacho no genera otro: se responde el que existe.
      if (pedido!.estado !== 'DESPACHADO' && pedido!.estado !== 'ENTREGADO') {
        await this.despachar(tx, idPedido, pedido!, usuario);
      }
      return (await pedidosConLineas(tx, 'WHERE pe.id_pedido = $1', [idPedido]))[0]!;
    });
  }

  private async despachar(tx: Ejecutor, idPedido: number, pedido: PedidoPorDespachar, usuario: Usuario): Promise<void> {
    if (!pedido.venta_pagada) {
      throw new ErrorDeNegocio(409, 'PEDIDO_NO_PAGADO', 'La compra de este pedido no está pagada.');
    }
    await this.descontarStock(tx, idPedido, pedido.id_venta, usuario);

    // La orden se emite al final, cuando ya se sabe que el pedido se puede despachar.
    const orden: OrdenDeDespacho = {
      referencia: idPedido,
      destinatario: pedido.destinatario,
      direccion: pedido.direccion,
      comuna: pedido.comuna,
      region: pedido.region,
      telefono: pedido.telefono,
      fleteCotizado: pedido.flete_cobrado,
    };
    let despacho: DespachoEmitido;
    try {
      despacho = await this.transportista.emitirDespacho(orden);
    } catch (error) {
      this.log.warn(`No se pudo emitir el despacho del pedido ${idPedido}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ErrorDeNegocio(
        503,
        'TRANSPORTISTA_NO_DISPONIBLE',
        'Starken no respondió y el despacho no se generó. Reintenta en unos minutos.',
      );
    }

    await tx.consultar(
      `UPDATE logistica.pedidos
       SET id_estado = ${ID_ESTADO_DESPACHADO}, tracking_starken = $2, costo_despacho = $3, despachado_en = now()
       WHERE id_pedido = $1`,
      [idPedido, despacho.seguimiento, despacho.costo],
    );
    await tx.consultar(
      `INSERT INTO logistica.historial_pedido (id_pedido, id_estado, id_usuario) VALUES ($1, ${ID_ESTADO_DESPACHADO}, $2)`,
      [idPedido, usuario.id],
    );
    // Si el pedido esperaba un reintento de emisión, ya no hace falta.
    await tx.consultar('DELETE FROM logistica.despachos_pendientes WHERE id_pedido = $1', [idPedido]);
    // El costo real del despacho entra en la rentabilidad de la venta.
    await tx.consultar(
      `INSERT INTO ventas.costos_venta (id_venta, flete_cobrado, costo_despacho) VALUES ($1, $2, $3)
       ON CONFLICT (id_venta) DO UPDATE SET costo_despacho = EXCLUDED.costo_despacho`,
      [pedido.id_venta, pedido.flete_cobrado, despacho.costo],
    );
  }

  /**
   * Saca del stock las prendas del pedido: cierra su reserva, descuenta la existencia
   * física y deja un movimiento `DESPACHO` por cada ubicación de la que salieron unidades.
   */
  private async descontarStock(tx: Ejecutor, idPedido: number, idVenta: number, usuario: Usuario): Promise<void> {
    const lineas = await tx.consultar<LineaPorDespachar>(
      `SELECT d.id_variante, v.sku, sum(d.cantidad)::int AS cantidad
       FROM ventas.detalle_venta d JOIN inventario.variantes v ON v.id_variante = d.id_variante
       WHERE d.id_venta = $1 GROUP BY d.id_variante, v.sku ORDER BY d.id_variante`,
      [idVenta],
    );
    await tx.consultar(
      `UPDATE inventario.reservas SET estado = 'DESPACHADA', expira_en = NULL
       WHERE id_venta = $1 AND estado IN ('ACTIVA', 'CONFIRMADA')`,
      [idVenta],
    );
    const saldos = await this.stock.bloquear(
      tx,
      lineas.map((linea) => linea.id_variante),
      { admitirInactivas: true },
    );
    for (const linea of lineas) {
      const saldo = saldos.get(linea.id_variante)!;
      // Con la reserva del pedido ya cerrada, lo que sigue reservado pertenece a otras compras.
      if (totalDe(saldo) - linea.cantidad < saldo.reservado) {
        throw new ErrorDeNegocio(409, 'STOCK_INSUFICIENTE', `No hay existencia suficiente de ${linea.sku} para despachar el pedido.`);
      }
      let pendiente = linea.cantidad;
      for (const ubicacion of ORDEN_DE_SALIDA) {
        const unidades = Math.min(pendiente, saldo.existencias[ubicacion]);
        if (unidades === 0) {
          continue;
        }
        await this.stock.sumar(tx, linea.id_variante, ubicacion, -unidades);
        await this.stock.registrar(tx, null, usuario, {
          idVariante: linea.id_variante,
          tipo: 'DESPACHO',
          ubicacion,
          cantidad: unidades,
          motivo: `Despacho del pedido #${idPedido}`,
          idVenta,
        });
        pendiente -= unidades;
      }
    }
  }
}
