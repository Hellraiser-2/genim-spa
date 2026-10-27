import { Injectable } from '@nestjs/common';
import type { ResultadoMovimientos, TipoMerma, TipoMovimiento, Ubicacion, Usuario, VarianteStock } from '@rockstar/contracts';

import { ErrorDeNegocio, datosInvalidos, exigir, noEncontrado } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { RESERVA_VIGENTE, movimientosDeOperacion, variantesConStock } from './consultas.js';
import { ID_UBICACION } from './ubicaciones.js';

/** Unidades de una variante en cada ubicación y cuántas están comprometidas en pedidos. */
export interface Saldo {
  existencias: Record<Ubicacion, number>;
  reservado: number;
}

export const totalDe = (saldo: Saldo) => saldo.existencias.BODEGA + saldo.existencias.SALA_VENTAS;

export interface MovimientoNuevo {
  idVariante: number;
  tipo: TipoMovimiento;
  tipoMerma?: TipoMerma;
  ubicacion: Ubicacion;
  ubicacionDestino?: Ubicacion;
  cantidad: number;
  motivo: string;
  /** Venta que origina el movimiento, en una salida por venta o por despacho. */
  idVenta?: number;
}

const UBICACION_DE_ID = new Map(Object.entries(ID_UBICACION).map(([nombre, id]) => [id, nombre as Ubicacion]));

/**
 * Operaciones de stock. Todas corren en una única transacción que bloquea las filas
 * de existencias, de modo que dos operaciones sobre una misma prenda nunca se pisan
 * (decisión 6 del diseño).
 */
@Injectable()
export class StockService {
  constructor(private readonly db: BaseDeDatos) {}

  /**
   * Ejecuta una operación que debe registrarse una sola vez. La clave de idempotencia
   * se anota en la misma transacción: si ya existía, la operación no se repite y
   * `resultado` responde con lo que quedó registrado la primera vez.
   */
  async unaVez<R>(
    tipo: string,
    claveIdempotencia: unknown,
    usuario: Usuario,
    operar: (tx: Ejecutor, clave: string) => Promise<void>,
    resultado: (tx: Ejecutor, clave: string) => Promise<R>,
  ): Promise<R> {
    exigir(typeof claveIdempotencia === 'string' && claveIdempotencia !== '', 'Falta la clave de idempotencia.');
    return this.db.transaccion(async (tx) => {
      // Si otra solicitud con la misma clave está en curso, esta espera a que termine.
      const [nueva] = await tx.consultar(
        `INSERT INTO inventario.operaciones (clave_idempotencia, tipo, id_usuario) VALUES ($1, $2, $3)
         ON CONFLICT (clave_idempotencia) DO NOTHING RETURNING clave_idempotencia`,
        [claveIdempotencia, tipo, usuario.id],
      );
      if (nueva) {
        await operar(tx, claveIdempotencia);
      } else {
        const [previa] = await tx.consultar<{ tipo: string }>(
          'SELECT tipo FROM inventario.operaciones WHERE clave_idempotencia = $1',
          [claveIdempotencia],
        );
        if (previa?.tipo !== tipo) {
          throw datosInvalidos('La clave de idempotencia ya se usó en otra operación.');
        }
      }
      return resultado(tx, claveIdempotencia);
    });
  }

  /** Movimientos de la operación y cómo quedó el stock de las variantes que tocó. */
  async resultadoDeOperacion(tx: Ejecutor, claveIdempotencia: string): Promise<ResultadoMovimientos> {
    const movimientos = await movimientosDeOperacion(tx, claveIdempotencia);
    const ids = [...new Set(movimientos.map((movimiento) => movimiento.idVariante))];
    const variantes = await variantesConStock(tx, 'WHERE v.id_variante = ANY($1::int[])', [ids]);
    // En el orden en que aparecen en la operación, no por identificador.
    return { movimientos, variantes: ids.map((id) => variantes.find((variante) => variante.idVariante === id)!) };
  }

  /** La variante que creó la operación, con su stock. */
  async varianteDeOperacion(tx: Ejecutor, claveIdempotencia: string): Promise<VarianteStock> {
    return (await this.resultadoDeOperacion(tx, claveIdempotencia)).variantes[0]!;
  }

  /**
   * Verifica que las variantes existan y estén activas, y bloquea sus existencias hasta
   * el fin de la transacción. Devuelve el saldo de cada una, leído ya con el bloqueo.
   * `admitirInactivas` es para lo ya vendido: una prenda desactivada después de la
   * venta igual tiene que poder salir.
   */
  async bloquear(
    tx: Ejecutor,
    idsVariante: readonly unknown[],
    { admitirInactivas = false }: { admitirInactivas?: boolean } = {},
  ): Promise<Map<number, Saldo>> {
    const ids = [...new Set(idsVariante)];
    if (!ids.every((id): id is number => Number.isInteger(id))) {
      throw noEncontrado('La variante no existe.');
    }
    const variantes = await tx.consultar<{ id_variante: number; activo: boolean }>(
      `SELECT v.id_variante, (v.activo AND p.activo) AS activo
       FROM inventario.variantes v JOIN inventario.productos p ON p.id_producto = v.id_producto
       WHERE v.id_variante = ANY($1::int[])`,
      [ids],
    );
    // Se informa el primer problema en el orden en que vinieron las variantes.
    for (const id of ids) {
      const variante = variantes.find((fila) => fila.id_variante === id);
      if (!variante) {
        throw noEncontrado('La variante no existe.');
      }
      if (!variante.activo && !admitirInactivas) {
        throw new ErrorDeNegocio(409, 'VARIANTE_INACTIVA', 'El producto está desactivado.');
      }
    }

    await tx.consultar(
      `INSERT INTO inventario.existencias (id_variante, id_ubicacion, cantidad)
       SELECT variante, u.id_ubicacion, 0 FROM unnest($1::int[]) AS variante CROSS JOIN inventario.ubicaciones u
       ON CONFLICT DO NOTHING`,
      [ids],
    );
    // El orden fijo evita interbloqueos entre operaciones que comparten variantes.
    const existencias = await tx.consultar<{ id_variante: number; id_ubicacion: number; cantidad: number }>(
      `SELECT id_variante, id_ubicacion, cantidad FROM inventario.existencias
       WHERE id_variante = ANY($1::int[]) ORDER BY id_variante, id_ubicacion FOR UPDATE`,
      [ids],
    );
    const reservas = await tx.consultar<{ id_variante: number; reservado: number }>(
      `SELECT r.id_variante, sum(r.cantidad)::int AS reservado FROM inventario.reservas r
       WHERE r.id_variante = ANY($1::int[]) AND ${RESERVA_VIGENTE} GROUP BY r.id_variante`,
      [ids],
    );

    const saldos = new Map<number, Saldo>(
      ids.map((id) => [id, { existencias: { BODEGA: 0, SALA_VENTAS: 0 }, reservado: 0 }]),
    );
    for (const fila of existencias) {
      saldos.get(fila.id_variante)!.existencias[UBICACION_DE_ID.get(fila.id_ubicacion)!] = fila.cantidad;
    }
    for (const fila of reservas) {
      saldos.get(fila.id_variante)!.reservado = fila.reservado;
    }
    return saldos;
  }

  /** Suma (o resta, con un valor negativo) unidades a la existencia de una ubicación ya bloqueada. */
  async sumar(tx: Ejecutor, idVariante: number, ubicacion: Ubicacion, unidades: number): Promise<void> {
    await tx.consultar(
      'UPDATE inventario.existencias SET cantidad = cantidad + $3 WHERE id_variante = $1 AND id_ubicacion = $2',
      [idVariante, ID_UBICACION[ubicacion], unidades],
    );
  }

  /** `clave` es la de la operación idempotente que origina el movimiento; `null` si no nace de una. */
  async registrar(tx: Ejecutor, clave: string | null, usuario: Usuario, movimiento: MovimientoNuevo): Promise<void> {
    await tx.consultar(
      `INSERT INTO inventario.movimientos
         (id_variante, id_ubicacion, id_ubicacion_destino, id_tipo, id_tipo_merma, cantidad, id_usuario, motivo,
          clave_idempotencia, id_venta)
       VALUES ($1, $2, $3,
               (SELECT id_tipo FROM inventario.tipos_movimiento WHERE codigo = $4),
               (SELECT id_tipo_merma FROM inventario.tipos_merma WHERE codigo = $5),
               $6, $7, $8, $9, $10)`,
      [
        movimiento.idVariante,
        ID_UBICACION[movimiento.ubicacion],
        movimiento.ubicacionDestino ? ID_UBICACION[movimiento.ubicacionDestino] : null,
        movimiento.tipo,
        movimiento.tipoMerma ?? null,
        movimiento.cantidad,
        usuario.id,
        movimiento.motivo,
        clave,
        movimiento.idVenta ?? null,
      ],
    );
  }
}
