import { Injectable } from '@nestjs/common';
import type {
  ComprobantePos,
  LineaEnBodega,
  LineaSinDisponibilidad,
  LineaVentaPos,
  MedioPresencial,
  PagoMaquina,
  Ubicacion,
  Usuario,
  VentaPosRequest,
} from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, esEnteroPositivo, exigir } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { StockService, totalDe } from '../inventario/stock.service.js';
import { ID_UBICACION } from '../inventario/ubicaciones.js';

const MEDIOS_PRESENCIALES: readonly MedioPresencial[] = ['EFECTIVO', 'DEBITO_PRESENCIAL', 'CREDITO_PRESENCIAL', 'TRANSFERENCIA'];

interface LineaDeVenta {
  idVariante: number;
  cantidad: number;
  permitirBodega: boolean;
}

interface DatosDeVariante {
  id_variante: number;
  producto: string;
  talla: string;
  precio: number | null;
  costo_compra: number | null;
}

/** Comprobantes de las ventas POS; quien la usa agrega a continuación qué ventas quiere. */
const COMPROBANTES = `
  SELECT ve.id_venta, ve.fecha, ve.total, vd.nombre AS vendedor, cl.nombre AS cliente,
         mp.codigo AS medio_codigo, mp.nombre AS medio_nombre,
         t.codigo_autorizacion, t.ultimos_digitos, t.numero_operacion,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'idVariante', v.id_variante, 'sku', v.sku, 'producto', p.nombre, 'talla', ta.nombre,
                    'color', c.nombre, 'cantidad', d.cantidad, 'precioUnitario', d.precio_unitario,
                    'subtotal', d.subtotal, 'ubicacion', u.nombre) ORDER BY d.id_detalle)
           FROM ventas.detalle_venta d
           JOIN inventario.variantes v ON v.id_variante = d.id_variante
           JOIN inventario.productos p ON p.id_producto = v.id_producto
           JOIN inventario.tallas ta ON ta.id_talla = v.id_talla
           JOIN inventario.colores c ON c.id_color = v.id_color
           JOIN inventario.ubicaciones u ON u.id_ubicacion = d.id_ubicacion
           WHERE d.id_venta = ve.id_venta), '[]'::json) AS lineas
  FROM ventas.ventas ve
  JOIN usuarios.usuarios vd ON vd.id_usuario = ve.id_vendedor
  LEFT JOIN usuarios.usuarios cl ON cl.id_usuario = ve.id_cliente
  JOIN pagos.transacciones t ON t.id_venta = ve.id_venta
  JOIN pagos.medios_pago mp ON mp.id_medio = t.id_medio
  WHERE ve.canal = 'POS'`;

interface FilaComprobante {
  id_venta: number;
  fecha: Date;
  total: number;
  vendedor: string;
  cliente: string | null;
  medio_codigo: MedioPresencial;
  medio_nombre: string;
  codigo_autorizacion: string | null;
  ultimos_digitos: string | null;
  numero_operacion: string | null;
  lineas: ComprobantePos['lineas'];
}

const comprobanteDe = (fila: FilaComprobante): ComprobantePos => ({
  idVenta: fila.id_venta,
  fecha: fila.fecha.toISOString(),
  vendedor: fila.vendedor,
  cliente: fila.cliente,
  medioPago: { codigo: fila.medio_codigo, nombre: fila.medio_nombre },
  pagoMaquina: fila.codigo_autorizacion === null ? null : { codigoAutorizacion: fila.codigo_autorizacion, ultimosDigitos: fila.ultimos_digitos },
  numeroOperacion: fila.numero_operacion,
  lineas: fila.lineas,
  total: fila.total,
});

/**
 * Venta en la tienda física. A diferencia de la compra web no hay reserva, pasarela ni
 * despacho: el comprador paga en el mostrador y se lleva la prenda, así que en una sola
 * transacción se registra la venta pagada, se descuenta el stock y se emite el comprobante.
 * La tarjeta se cobra en la máquina de cobro de la caja, cuya autorización se guarda con
 * la venta, o en un terminal aparte, y entonces solo se anota el medio.
 */
@Injectable()
export class VentasPosService {
  constructor(
    private readonly db: BaseDeDatos,
    private readonly stock: StockService,
  ) {}

  async registrar(cuerpo: unknown, vendedor: Usuario): Promise<ComprobantePos> {
    const datos = cuerpoComo<VentaPosRequest>(cuerpo);
    exigir(typeof datos.claveIdempotencia === 'string' && datos.claveIdempotencia !== '', 'Falta la clave de idempotencia.');
    const lineas = this.lineasValidas(datos.lineas);
    exigir(MEDIOS_PRESENCIALES.includes(datos.medioPago as MedioPresencial), 'Falta el medio de pago.');
    const medioPago = datos.medioPago as MedioPresencial;
    exigir(datos.idCliente === undefined || datos.idCliente === null || Number.isInteger(datos.idCliente), 'El cliente no es válido.');
    const idCliente = datos.idCliente ?? null;
    const pagoMaquina = this.pagoMaquinaValido(datos.pagoMaquina, medioPago);
    const numeroOperacion = this.numeroOperacionValido(datos.numeroOperacion, medioPago);
    // La clave se guarda junto al vendedor: la de uno nunca coincide con la de otro.
    const clave = `pos:${vendedor.id}:${datos.claveIdempotencia}`;

    return this.db.transaccion(async (tx) => {
      const [previa] = await tx.consultar<{ id_venta: number }>('SELECT id_venta FROM ventas.ventas WHERE clave_idempotencia = $1', [clave]);
      if (previa) {
        return this.comprobante(tx, previa.id_venta);
      }
      if (idCliente !== null) {
        const [cliente] = await tx.consultar(
          `SELECT 1 FROM usuarios.usuarios u JOIN usuarios.roles r USING (id_rol)
           WHERE u.id_usuario = $1 AND u.activo AND r.nombre = 'CLIENTE'`,
          [idCliente],
        );
        exigir(cliente !== undefined, 'El cliente no es válido.');
      }
      if (pagoMaquina) {
        const [usado] = await tx.consultar<{ id_venta: number }>(
          'SELECT id_venta FROM pagos.transacciones WHERE id_cobro_maquina = $1',
          [pagoMaquina.idCobro],
        );
        if (usado) {
          throw new ErrorDeNegocio(409, 'COBRO_YA_USADO', `Ese cobro de la máquina ya pagó la venta #${usado.id_venta}.`, { idVenta: usado.id_venta });
        }
      }

      const { variantes, origenes } = await this.vendibles(tx, lineas);
      const total = lineas.reduce((suma, linea) => suma + variantes.get(linea.idVariante)!.precio! * linea.cantidad, 0);

      const [venta] = await tx.consultar<{ id_venta: number }>(
        `INSERT INTO ventas.ventas (canal, id_vendedor, id_cliente, id_estado, total, clave_idempotencia)
         VALUES ('POS', $1, $2, (SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA'), $3, $4)
         ON CONFLICT (clave_idempotencia) DO NOTHING RETURNING id_venta`,
        [vendedor.id, idCliente, total, clave],
      );
      if (!venta) {
        // La misma venta llegó dos veces a la vez y la otra ganó: se responde la suya.
        const [otra] = await tx.consultar<{ id_venta: number }>('SELECT id_venta FROM ventas.ventas WHERE clave_idempotencia = $1', [clave]);
        return this.comprobante(tx, otra!.id_venta);
      }
      const idVenta = venta.id_venta;

      for (const { idVariante, ubicacion, cantidad } of origenes) {
        const { precio, costo_compra: costo } = variantes.get(idVariante)!;
        // El precio y el costo se guardan como estaban al vender: no cambian si después cambia el producto.
        await tx.consultar(
          `INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario, costo_unitario, id_ubicacion)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [idVenta, idVariante, cantidad, precio, costo, ID_UBICACION[ubicacion]],
        );
        await this.stock.sumar(tx, idVariante, ubicacion, -cantidad);
        await this.stock.registrar(tx, null, vendedor, {
          idVariante,
          tipo: 'VENTA',
          ubicacion,
          cantidad,
          motivo: `Venta POS #${idVenta}`,
          idVenta,
        });
      }

      const [medio] = await tx.consultar<{ id_medio: number; comision: number }>(
        'SELECT id_medio, round($2 * tasa_comision)::int AS comision FROM pagos.medios_pago WHERE codigo = $1 AND presencial',
        [medioPago, total],
      );
      await tx.consultar('INSERT INTO ventas.costos_venta (id_venta, comision_pago) VALUES ($1, $2)', [idVenta, medio!.comision]);
      await tx.consultar(
        `INSERT INTO pagos.transacciones
           (id_venta, id_medio, monto, estado, comision, resuelto_en, codigo_autorizacion, ultimos_digitos, id_cobro_maquina, numero_operacion)
         VALUES ($1, $2, $3, 'AUTORIZADA', $4, now(), $5, $6, $7, $8)`,
        [
          idVenta,
          medio!.id_medio,
          total,
          medio!.comision,
          pagoMaquina?.codigoAutorizacion ?? null,
          pagoMaquina?.ultimosDigitos ?? null,
          pagoMaquina?.idCobro ?? null,
          numeroOperacion,
        ],
      );
      return this.comprobante(tx, idVenta);
    });
  }

  /** Ventas POS del día en la tienda, de la más reciente a la más antigua: las del Vendedor, o todas para el Gerente. */
  async delDia(usuario: Usuario): Promise<ComprobantePos[]> {
    const soloSuyas = usuario.rol !== 'GERENTE';
    const filas = await this.db.consultar<FilaComprobante>(
      `${COMPROBANTES}
         AND (ve.fecha AT TIME ZONE 'America/Santiago')::date = (now() AT TIME ZONE 'America/Santiago')::date
         AND ($1::int IS NULL OR ve.id_vendedor = $1)
       ORDER BY ve.id_venta DESC`,
      [soloSuyas ? usuario.id : null],
    );
    return filas.map(comprobanteDe);
  }

  /** Número de operación de una transferencia; opcional, y solo con transferencia. */
  private numeroOperacionValido(numero: unknown, medioPago: MedioPresencial): string | null {
    if (numero === undefined || numero === null || numero === '') return null;
    exigir(medioPago === 'TRANSFERENCIA', 'El número de operación es solo para transferencias.');
    exigir(typeof numero === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(numero.trim()), 'El número de operación no es válido.');
    return numero.trim();
  }

  /** El pago informado por la máquina de cobro, si lo hay. Solo la tarjeta pasa por ella. */
  private pagoMaquinaValido(pago: unknown, medioPago: MedioPresencial): Required<PagoMaquina> | null {
    if (pago === undefined || pago === null) return null;
    exigir(medioPago === 'DEBITO_PRESENCIAL' || medioPago === 'CREDITO_PRESENCIAL', 'Solo la tarjeta pasa por la máquina de cobro.');
    const { idCobro, codigoAutorizacion, ultimosDigitos } = (typeof pago === 'object' ? pago : {}) as Partial<PagoMaquina>;
    exigir(typeof idCobro === 'string' && /^[\w-]{1,100}$/.test(idCobro), 'El cobro de la máquina no es válido.');
    exigir(
      typeof codigoAutorizacion === 'string' && /^[A-Za-z0-9]{1,32}$/.test(codigoAutorizacion),
      'El código de autorización no es válido.',
    );
    exigir(
      ultimosDigitos === undefined || ultimosDigitos === null || (typeof ultimosDigitos === 'string' && /^\d{4}$/.test(ultimosDigitos)),
      'Los últimos dígitos de la tarjeta no son válidos.',
    );
    return { idCobro, codigoAutorizacion, ultimosDigitos: ultimosDigitos ?? null };
  }

  /** Junta las líneas repetidas de una misma variante y valida sus cantidades. */
  private lineasValidas(lineas: unknown): LineaDeVenta[] {
    exigir(Array.isArray(lineas) && lineas.length > 0, 'La venta no tiene productos.');
    const porVariante = new Map<number, LineaDeVenta>();
    for (const linea of lineas as Partial<LineaVentaPos>[]) {
      exigir(
        typeof linea === 'object' && linea !== null && Number.isInteger(linea.idVariante) && esEnteroPositivo(linea.cantidad),
        'Cada línea de la venta necesita una variante y una cantidad mayor que cero.',
      );
      const previa = porVariante.get(linea.idVariante!);
      porVariante.set(linea.idVariante!, {
        idVariante: linea.idVariante!,
        cantidad: (previa?.cantidad ?? 0) + linea.cantidad,
        permitirBodega: (previa?.permitirBodega ?? false) || linea.permitirBodega === true,
      });
    }
    return [...porVariante.values()];
  }

  /**
   * Bloquea el stock de las variantes, verifica que todo se pueda vender y decide de qué
   * ubicación sale cada unidad: primero la sala de ventas y, si la línea lo permite, el
   * resto desde bodega. Las unidades reservadas por compras web no se venden.
   */
  private async vendibles(
    tx: Ejecutor,
    lineas: LineaDeVenta[],
  ): Promise<{ variantes: Map<number, DatosDeVariante>; origenes: { idVariante: number; ubicacion: Ubicacion; cantidad: number }[] }> {
    const ids = lineas.map((linea) => linea.idVariante);
    const saldos = await this.stock.bloquear(tx, ids);
    const filas = await tx.consultar<DatosDeVariante>(
      `SELECT v.id_variante, p.nombre AS producto, t.nombre AS talla, p.precio, p.costo_compra
       FROM inventario.variantes v
       JOIN inventario.productos p ON p.id_producto = v.id_producto
       JOIN inventario.tallas t ON t.id_talla = v.id_talla
       WHERE v.id_variante = ANY($1::int[])`,
      [ids],
    );
    const variantes = new Map(filas.map((fila) => [fila.id_variante, fila]));

    const faltantes: LineaSinDisponibilidad[] = [];
    const enBodega: LineaEnBodega[] = [];
    const origenes: { idVariante: number; ubicacion: Ubicacion; cantidad: number }[] = [];
    for (const { idVariante, cantidad, permitirBodega } of lineas) {
      const variante = variantes.get(idVariante)!;
      const saldo = saldos.get(idVariante)!;
      // Un producto sin precio no está a la venta, tenga o no existencias.
      const disponible = variante.precio === null ? 0 : Math.max(0, totalDe(saldo) - saldo.reservado);
      if (disponible < cantidad) {
        faltantes.push({ idVariante, producto: variante.producto, talla: variante.talla, disponible });
        continue;
      }
      const desdeSala = Math.min(saldo.existencias.SALA_VENTAS, cantidad);
      if (desdeSala < cantidad && !permitirBodega) {
        enBodega.push({
          idVariante,
          producto: variante.producto,
          talla: variante.talla,
          enSala: saldo.existencias.SALA_VENTAS,
          enBodega: saldo.existencias.BODEGA,
        });
        continue;
      }
      if (desdeSala > 0) origenes.push({ idVariante, ubicacion: 'SALA_VENTAS', cantidad: desdeSala });
      if (cantidad > desdeSala) origenes.push({ idVariante, ubicacion: 'BODEGA', cantidad: cantidad - desdeSala });
    }

    if (faltantes.length > 0) {
      const [primera] = faltantes;
      const mensaje =
        faltantes.length > 1
          ? 'Algunos productos de la venta no tienen stock suficiente.'
          : primera!.disponible === 0
            ? `${primera!.producto} talla ${primera!.talla} no tiene stock.`
            : `Solo quedan ${primera!.disponible} unidades de ${primera!.producto} talla ${primera!.talla}.`;
      throw new ErrorDeNegocio(409, 'STOCK_INSUFICIENTE', mensaje, faltantes);
    }
    if (enBodega.length > 0) {
      const mensaje =
        enBodega.length > 1
          ? 'Algunos productos no alcanzan en la sala de ventas: hay que retirarlos de bodega.'
          : `${enBodega[0]!.producto} talla ${enBodega[0]!.talla} no alcanza en la sala de ventas: hay que retirarla de bodega.`;
      throw new ErrorDeNegocio(409, 'EXISTENCIA_EN_BODEGA', mensaje, enBodega);
    }
    return { variantes, origenes };
  }

  private async comprobante(tx: Ejecutor, idVenta: number): Promise<ComprobantePos> {
    const [fila] = await tx.consultar<FilaComprobante>(`${COMPROBANTES} AND ve.id_venta = $1`, [idVenta]);
    return comprobanteDe(fila!);
  }
}
