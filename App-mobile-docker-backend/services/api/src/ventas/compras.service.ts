import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type {
  CheckoutRequest,
  CheckoutResponse,
  CompraPendiente,
  DatosDespacho,
  LineaPedidoCliente,
  LineaSinDisponibilidad,
  ResultadoPago,
  RetornoPagoRequest,
  Usuario,
} from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, esEnteroPositivo, exigir, noEncontrado, texto } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { OFERTA_DEL_MES } from '../inventario/consultas.js';
import { StockService, totalDe } from '../inventario/stock.service.js';
import { FletesService } from '../logistica/fletes.service.js';
import { PASARELA, type PagoResuelto, type Pasarela } from '../pagos/pasarela.js';

/** Tiempo que las unidades quedan reservadas mientras se paga (decisión 6 del diseño). */
const MINUTOS_PARA_PAGAR = 15;
const MS_ENTRE_LIMPIEZAS = 60_000;

interface LineaDeCompra {
  idVariante: number;
  cantidad: number;
}

interface DatosDeVariante {
  id_variante: number;
  producto: string;
  talla: string;
  precio: number | null;
  costo_compra: number | null;
}

interface PagoPendiente {
  id_transaccion: number;
  id_venta: number;
  estado: string;
  monto: number;
  vencido: boolean;
}

const idEstadoVenta = (codigo: string) => `(SELECT id_estado FROM ventas.estados_venta WHERE codigo = '${codigo}')`;

/**
 * Compra web en dos pasos. El checkout crea la venta pendiente, reserva las unidades por
 * 15 minutos e inicia el pago; el retorno de la pasarela la confirma y crea el pedido, o
 * la rechaza y libera la reserva. Cada paso es una transacción: nunca queda a medias.
 */
@Injectable()
export class ComprasService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Compras');
  private limpieza?: NodeJS.Timeout;

  constructor(
    private readonly db: BaseDeDatos,
    private readonly stock: StockService,
    private readonly fletes: FletesService,
    @Inject(PASARELA) private readonly pasarela: Pasarela,
  ) {}

  /** Las compras abandonadas se cierran solas, para que no queden pendientes para siempre. */
  onModuleInit(): void {
    this.limpieza = setInterval(() => {
      this.expirarVencidas().catch((error) => this.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    }, MS_ENTRE_LIMPIEZAS);
    this.limpieza.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.limpieza);
  }

  // --- Checkout ---

  async iniciar(cuerpo: unknown, cliente: Usuario): Promise<CheckoutResponse> {
    const datos = cuerpoComo<CheckoutRequest>(cuerpo);
    exigir(typeof datos.claveIdempotencia === 'string' && datos.claveIdempotencia !== '', 'Falta la clave de idempotencia.');
    const lineas = this.lineasValidas(datos.lineas);
    const despacho = this.despachoValido(datos.despacho);
    // La clave se guarda junto al cliente: la de una persona nunca coincide con la de otra.
    const clave = `web:${cliente.id}:${datos.claveIdempotencia}`;

    // Antes de vender se cierran las compras abandonadas, además de la limpieza periódica.
    await this.expirarVencidas();
    return this.db.transaccion(async (tx) => {
      const [previa] = await tx.consultar<{ id_venta: number }>('SELECT id_venta FROM ventas.ventas WHERE clave_idempotencia = $1', [clave]);
      if (previa) {
        return this.respuestaDeCheckout(tx, previa.id_venta);
      }

      const flete = (await this.fletes.cotizar(tx, despacho.idComuna)).valor;
      const variantes = await this.reservables(tx, lineas);
      const subtotal = lineas.reduce((suma, linea) => suma + variantes.get(linea.idVariante)!.precio! * linea.cantidad, 0);
      const total = subtotal + flete;

      const [venta] = await tx.consultar<{ id_venta: number }>(
        `INSERT INTO ventas.ventas (canal, id_cliente, id_estado, total, clave_idempotencia)
         VALUES ('ECOMMERCE', $1, ${idEstadoVenta('PENDIENTE_PAGO')}, $2, $3)
         ON CONFLICT (clave_idempotencia) DO NOTHING RETURNING id_venta`,
        [cliente.id, total, clave],
      );
      if (!venta) {
        // La misma solicitud llegó dos veces a la vez y la otra ganó: se responde la suya.
        const [otra] = await tx.consultar<{ id_venta: number }>('SELECT id_venta FROM ventas.ventas WHERE clave_idempotencia = $1', [clave]);
        return this.respuestaDeCheckout(tx, otra!.id_venta);
      }
      const idVenta = venta.id_venta;

      for (const { idVariante, cantidad } of lineas) {
        const { precio, costo_compra: costo } = variantes.get(idVariante)!;
        // El precio y el costo se guardan como estaban al comprar: no cambian si después cambia el producto.
        await tx.consultar(
          'INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario, costo_unitario) VALUES ($1, $2, $3, $4, $5)',
          [idVenta, idVariante, cantidad, precio, costo],
        );
        await tx.consultar(
          `INSERT INTO inventario.reservas (id_venta, id_variante, cantidad, estado, expira_en)
           VALUES ($1, $2, $3, 'ACTIVA', now() + make_interval(mins => $4))`,
          [idVenta, idVariante, cantidad, MINUTOS_PARA_PAGAR],
        );
      }
      await tx.consultar(
        `INSERT INTO logistica.solicitudes_despacho (id_venta, id_comuna, direccion, destinatario, telefono, flete_cotizado)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idVenta, despacho.idComuna, despacho.direccion, despacho.destinatario, despacho.telefono, flete],
      );
      await tx.consultar('INSERT INTO ventas.costos_venta (id_venta, flete_cobrado) VALUES ($1, $2)', [idVenta, flete]);

      const { token } = await this.pasarela.crear({ idVenta, monto: total });
      await tx.consultar(`INSERT INTO pagos.transacciones (id_venta, monto, estado, token_webpay) VALUES ($1, $2, 'PENDIENTE', $3)`, [
        idVenta,
        total,
        token,
      ]);
      return this.respuestaDeCheckout(tx, idVenta);
    });
  }

  /** Junta las líneas repetidas de una misma variante y valida sus cantidades. */
  private lineasValidas(lineas: unknown): LineaDeCompra[] {
    exigir(Array.isArray(lineas) && lineas.length > 0, 'El carrito está vacío.');
    const cantidades = new Map<number, number>();
    for (const linea of lineas as Partial<LineaDeCompra>[]) {
      exigir(
        typeof linea === 'object' && linea !== null && Number.isInteger(linea.idVariante) && esEnteroPositivo(linea.cantidad),
        'Cada línea del carrito necesita una variante y una cantidad mayor que cero.',
      );
      cantidades.set(linea.idVariante!, (cantidades.get(linea.idVariante!) ?? 0) + linea.cantidad);
    }
    return [...cantidades].map(([idVariante, cantidad]) => ({ idVariante, cantidad }));
  }

  private despachoValido(despacho: unknown): DatosDespacho {
    const datos = cuerpoComo<DatosDespacho>(despacho);
    const limpio = {
      idComuna: datos.idComuna as number,
      destinatario: texto(datos.destinatario),
      telefono: texto(datos.telefono),
      direccion: texto(datos.direccion),
    };
    exigir(limpio.destinatario !== '', 'Falta el nombre de quien recibe.');
    exigir(limpio.telefono !== '', 'Falta el teléfono de contacto.');
    exigir(Number.isInteger(limpio.idComuna), 'Falta la comuna de despacho.');
    exigir(limpio.direccion !== '', 'Falta la dirección de despacho.');
    return limpio;
  }

  /**
   * Bloquea el stock de las variantes y verifica que todo el carrito se pueda vender:
   * con precio y con disponibilidad suficiente. Si algo falta, no se reserva nada y el
   * rechazo detalla qué líneas ajustar.
   */
  private async reservables(tx: Ejecutor, lineas: LineaDeCompra[]): Promise<Map<number, DatosDeVariante>> {
    const ids = lineas.map((linea) => linea.idVariante);
    const saldos = await this.stock.bloquear(tx, ids);
    const filas = await tx.consultar<DatosDeVariante>(
      // Se cobra el precio de oferta si el producto está en oferta este mes; sin precio normal no se vende.
      `SELECT v.id_variante, p.nombre AS producto, t.nombre AS talla,
              CASE WHEN p.precio IS NOT NULL THEN COALESCE(o.precio_oferta, p.precio) END AS precio, p.costo_compra
       FROM inventario.variantes v
       JOIN inventario.productos p ON p.id_producto = v.id_producto
       ${OFERTA_DEL_MES}
       JOIN inventario.tallas t ON t.id_talla = v.id_talla
       WHERE v.id_variante = ANY($1::int[])`,
      [ids],
    );
    const variantes = new Map(filas.map((fila) => [fila.id_variante, fila]));

    const faltantes: LineaSinDisponibilidad[] = [];
    for (const { idVariante, cantidad } of lineas) {
      const variante = variantes.get(idVariante)!;
      const saldo = saldos.get(idVariante)!;
      // Un producto sin precio no está a la venta, tenga o no existencias.
      const disponible = variante.precio === null ? 0 : Math.max(0, totalDe(saldo) - saldo.reservado);
      if (disponible < cantidad) {
        faltantes.push({ idVariante, producto: variante.producto, talla: variante.talla, disponible });
      }
    }
    if (faltantes.length > 0) {
      const [primera] = faltantes;
      const mensaje =
        faltantes.length > 1
          ? 'Algunos productos del carrito ya no tienen disponibilidad suficiente.'
          : primera!.disponible === 0
            ? `${primera!.producto} talla ${primera!.talla} ya no está disponible.`
            : `Solo quedan ${primera!.disponible} unidades de ${primera!.producto} talla ${primera!.talla}.`;
      throw new ErrorDeNegocio(409, 'STOCK_INSUFICIENTE', mensaje, faltantes);
    }
    return variantes;
  }

  private async respuestaDeCheckout(tx: Ejecutor, idVenta: number): Promise<CheckoutResponse> {
    const [compra] = await tx.consultar<{ total: number; flete: number; token: string; expira_en: Date }>(
      `SELECT ve.total, cv.flete_cobrado AS flete, t.token_webpay AS token,
              t.creado_en + make_interval(mins => $2) AS expira_en
       FROM ventas.ventas ve
       JOIN ventas.costos_venta cv ON cv.id_venta = ve.id_venta
       JOIN pagos.transacciones t ON t.id_venta = ve.id_venta
       WHERE ve.id_venta = $1`,
      [idVenta, MINUTOS_PARA_PAGAR],
    );
    return {
      idVenta,
      subtotal: compra!.total - compra!.flete,
      flete: compra!.flete,
      total: compra!.total,
      tokenPago: compra!.token,
      expiraEn: compra!.expira_en.toISOString(),
    };
  }

  // --- Retorno del pago ---

  /** Resuelve el pago al volver de la pasarela. Un pago ya resuelto responde lo que quedó guardado. */
  async resolverPago(cuerpo: unknown): Promise<ResultadoPago> {
    const retorno = cuerpoComo<RetornoPagoRequest>(cuerpo);
    const token = texto(retorno.tokenPago);
    exigir(token !== '', 'Falta el token del pago.');

    return this.db.transaccion(async (tx) => {
      // El bloqueo hace esperar a un segundo retorno del mismo pago, que al entrar lo encuentra resuelto.
      const [pago] = await tx.consultar<PagoPendiente>(
        `SELECT id_transaccion, id_venta, estado, monto,
                creado_en + make_interval(mins => $2) <= now() AS vencido
         FROM pagos.transacciones WHERE token_webpay = $1 FOR UPDATE`,
        [token, MINUTOS_PARA_PAGAR],
      );
      if (!pago) {
        throw noEncontrado('El pago no existe.');
      }
      if (pago.estado === 'PENDIENTE') {
        if (pago.vencido) {
          // La reserva ya venció y las unidades pudieron venderse: no se cobra.
          await this.cerrarSinPago(tx, pago, 'EXPIRADA', null);
        } else {
          const resuelto = await this.pasarela.confirmar(token, retorno);
          if (resuelto.autorizado) {
            await this.confirmar(tx, pago, resuelto);
          } else {
            await this.cerrarSinPago(tx, pago, 'RECHAZADA', resuelto.motivoRechazo ?? 'Pago rechazado.');
          }
        }
      }
      return this.resultadoDe(tx, pago.id_transaccion);
    });
  }

  /** Pago autorizado: la reserva queda firme, la venta pagada y nace el pedido con el destino indicado. */
  private async confirmar(tx: Ejecutor, pago: PagoPendiente, resuelto: PagoResuelto): Promise<void> {
    const [medio] = await tx.consultar<{ id_medio: number; comision: number }>(
      'SELECT id_medio, round($2 * tasa_comision)::int AS comision FROM pagos.medios_pago WHERE codigo = $1',
      [resuelto.medio, pago.monto],
    );
    await tx.consultar(
      `UPDATE pagos.transacciones
       SET estado = 'AUTORIZADA', id_medio = $2, codigo_autorizacion = $3, comision = $4, resuelto_en = now()
       WHERE id_transaccion = $1`,
      [pago.id_transaccion, medio!.id_medio, resuelto.codigoAutorizacion ?? null, medio!.comision],
    );
    await tx.consultar(`UPDATE inventario.reservas SET estado = 'CONFIRMADA', expira_en = NULL WHERE id_venta = $1 AND estado = 'ACTIVA'`, [
      pago.id_venta,
    ]);
    await tx.consultar(`UPDATE ventas.ventas SET id_estado = ${idEstadoVenta('PAGADA')} WHERE id_venta = $1`, [pago.id_venta]);
    await tx.consultar('UPDATE ventas.costos_venta SET comision_pago = $2 WHERE id_venta = $1', [pago.id_venta, medio!.comision]);

    // El destino pasa de la solicitud al pedido y la solicitud se elimina: no queda en dos lugares.
    const [pedido] = await tx.consultar<{ id_pedido: number }>(
      `INSERT INTO logistica.pedidos (id_venta, id_estado, id_comuna, direccion, destinatario, telefono, flete_cobrado, pagado_en)
       SELECT id_venta, (SELECT id_estado FROM logistica.estados_pedido WHERE codigo = 'PAGADO'),
              id_comuna, direccion, destinatario, telefono, flete_cotizado, now()
       FROM logistica.solicitudes_despacho WHERE id_venta = $1
       RETURNING id_pedido`,
      [pago.id_venta],
    );
    await tx.consultar('DELETE FROM logistica.solicitudes_despacho WHERE id_venta = $1', [pago.id_venta]);
    await tx.consultar(
      `INSERT INTO logistica.historial_pedido (id_pedido, id_estado)
       VALUES ($1, (SELECT id_estado FROM logistica.estados_pedido WHERE codigo = 'PAGADO'))`,
      [pedido!.id_pedido],
    );
  }

  /** Pago rechazado o vencido: se libera la reserva y la venta queda cerrada sin pedido. */
  private async cerrarSinPago(
    tx: Ejecutor,
    pago: Pick<PagoPendiente, 'id_transaccion' | 'id_venta'>,
    estado: 'RECHAZADA' | 'EXPIRADA',
    motivo: string | null,
  ): Promise<void> {
    await tx.consultar('UPDATE pagos.transacciones SET estado = $2, motivo_rechazo = $3, resuelto_en = now() WHERE id_transaccion = $1', [
      pago.id_transaccion,
      estado,
      motivo,
    ]);
    await tx.consultar(`UPDATE inventario.reservas SET estado = 'LIBERADA', expira_en = NULL WHERE id_venta = $1 AND estado = 'ACTIVA'`, [
      pago.id_venta,
    ]);
    await tx.consultar(`UPDATE ventas.ventas SET id_estado = ${idEstadoVenta(estado)} WHERE id_venta = $1`, [pago.id_venta]);
    await tx.consultar('DELETE FROM logistica.solicitudes_despacho WHERE id_venta = $1', [pago.id_venta]);
  }

  private async resultadoDe(tx: Ejecutor, idTransaccion: number): Promise<ResultadoPago> {
    const [pago] = await tx.consultar<{
      estado: string;
      id_venta: number;
      monto: number;
      codigo_autorizacion: string | null;
      motivo_rechazo: string | null;
      id_pedido: number | null;
    }>(
      `SELECT t.estado, t.id_venta, t.monto, t.codigo_autorizacion, t.motivo_rechazo, pe.id_pedido
       FROM pagos.transacciones t LEFT JOIN logistica.pedidos pe ON pe.id_venta = t.id_venta
       WHERE t.id_transaccion = $1`,
      [idTransaccion],
    );
    const base = { idVenta: pago!.id_venta, total: pago!.monto };
    switch (pago!.estado) {
      case 'AUTORIZADA':
        return {
          ...base,
          estado: 'PAGADA',
          idPedido: pago!.id_pedido!,
          ...(pago!.codigo_autorizacion ? { codigoAutorizacion: pago!.codigo_autorizacion } : {}),
        };
      case 'EXPIRADA':
        return { ...base, estado: 'EXPIRADA' };
      default:
        return { ...base, estado: 'RECHAZADA', motivo: pago!.motivo_rechazo ?? 'El pago no se completó.' };
    }
  }

  // --- Compras por pagar ---

  /**
   * Compras del cliente que esperan su pago y aún tienen las unidades reservadas, de la
   * más reciente a la más antigua. Las que ya vencieron no se listan: no se pueden pagar.
   */
  async pendientesDe(cliente: Usuario): Promise<CompraPendiente[]> {
    const filas = await this.db.consultar<{
      id_venta: number;
      fecha: Date;
      total: number;
      flete: number;
      token: string;
      expira_en: Date;
      destinatario: string;
      direccion: string;
      comuna: string;
      region: string;
      lineas: LineaPedidoCliente[];
    }>(
      `SELECT ve.id_venta, ve.fecha, ve.total, cv.flete_cobrado AS flete, t.token_webpay AS token,
              t.creado_en + make_interval(mins => $2) AS expira_en,
              sd.destinatario, sd.direccion, co.nombre AS comuna, re.nombre AS region,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'idVariante', v.id_variante, 'sku', v.sku, 'producto', p.nombre, 'talla', ta.nombre,
                         'color', c.nombre, 'cantidad', d.cantidad, 'precioUnitario', d.precio_unitario) ORDER BY d.id_detalle)
                FROM ventas.detalle_venta d
                JOIN inventario.variantes v ON v.id_variante = d.id_variante
                JOIN inventario.productos p ON p.id_producto = v.id_producto
                JOIN inventario.tallas ta ON ta.id_talla = v.id_talla
                JOIN inventario.colores c ON c.id_color = v.id_color
                WHERE d.id_venta = ve.id_venta), '[]'::json) AS lineas
       FROM ventas.ventas ve
       JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado AND ev.codigo = 'PENDIENTE_PAGO'
       JOIN ventas.costos_venta cv ON cv.id_venta = ve.id_venta
       JOIN pagos.transacciones t ON t.id_venta = ve.id_venta AND t.estado = 'PENDIENTE'
       JOIN logistica.solicitudes_despacho sd ON sd.id_venta = ve.id_venta
       JOIN logistica.comunas co ON co.id_comuna = sd.id_comuna
       JOIN logistica.regiones re ON re.id_region = co.id_region
       WHERE ve.id_cliente = $1 AND t.creado_en + make_interval(mins => $2) > now()
       ORDER BY ve.id_venta DESC`,
      [cliente.id, MINUTOS_PARA_PAGAR],
    );
    return filas.map((fila) => ({
      idVenta: fila.id_venta,
      subtotal: fila.total - fila.flete,
      flete: fila.flete,
      total: fila.total,
      tokenPago: fila.token,
      expiraEn: fila.expira_en.toISOString(),
      fecha: fila.fecha.toISOString(),
      lineas: fila.lineas,
      destinatario: fila.destinatario,
      direccion: fila.direccion,
      comuna: fila.comuna,
      region: fila.region,
    }));
  }

  // --- Compras abandonadas ---

  /** Cierra como expiradas las compras cuyo plazo para pagar venció. Devuelve cuántas cerró. */
  async expirarVencidas(): Promise<number> {
    return this.db.transaccion(async (tx) => {
      // Las que otro proceso está resolviendo en este momento se dejan para la próxima vuelta.
      const vencidas = await tx.consultar<Pick<PagoPendiente, 'id_transaccion' | 'id_venta'>>(
        `SELECT id_transaccion, id_venta FROM pagos.transacciones
         WHERE estado = 'PENDIENTE' AND token_webpay IS NOT NULL AND creado_en + make_interval(mins => $1) <= now()
         FOR UPDATE SKIP LOCKED`,
        [MINUTOS_PARA_PAGAR],
      );
      for (const pago of vencidas) {
        await this.cerrarSinPago(tx, pago, 'EXPIRADA', null);
      }
      return vencidas.length;
    });
  }
}
