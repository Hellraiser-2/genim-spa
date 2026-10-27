import { Injectable } from '@nestjs/common';
import type { CajaAbierta, CierreCaja, CierreCajaRequest, CierresCaja, MedioPresencial, TotalMedio, Usuario } from '@rockstar/contracts';

import { cuerpoComo, exigir } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';

/** Las ventas POS pagadas de un vendedor que aún no entran en un cierre. */
const SIN_CERRAR = `
  ve.canal = 'POS' AND ve.id_vendedor = $1 AND ve.id_cierre IS NULL
  AND ve.id_estado = (SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA')`;

/** Los cuatro medios presenciales con sus ventas en un conjunto de ventas (condición sobre `ve`). */
const POR_MEDIO = (condicion: string) => `
  SELECT mp.codigo, mp.nombre, count(x.id_venta)::int AS ventas, COALESCE(sum(x.monto), 0)::int AS total
  FROM pagos.medios_pago mp
  LEFT JOIN (
    SELECT t.id_medio, t.monto, ve.id_venta
    FROM ventas.ventas ve JOIN pagos.transacciones t ON t.id_venta = ve.id_venta
    WHERE ${condicion}
  ) x ON x.id_medio = mp.id_medio
  WHERE mp.presencial
  GROUP BY mp.id_medio, mp.codigo, mp.nombre
  ORDER BY mp.id_medio`;

const CIERRES = `
  SELECT c.id_cierre, u.nombre AS vendedor, c.fecha, c.desde, c.hasta, c.ventas, c.total,
         c.fondo_inicial, c.efectivo_ventas, c.efectivo_contado, c.diferencia, c.observacion
  FROM ventas.cierres_caja c JOIN usuarios.usuarios u ON u.id_usuario = c.id_vendedor`;

interface FilaCierre {
  id_cierre: number;
  vendedor: string;
  fecha: Date;
  desde: Date | null;
  hasta: Date | null;
  ventas: number;
  total: number;
  fondo_inicial: number;
  efectivo_ventas: number;
  efectivo_contado: number;
  diferencia: number;
  observacion: string | null;
}

const MAXIMO_PESOS = 1_000_000_000;

function pesos(valor: unknown, nombre: string): number {
  exigir(Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) <= MAXIMO_PESOS, `${nombre} debe ser un monto en pesos, sin decimales.`);
  return valor as number;
}

/**
 * Caja del POS. Cada vendedor tiene su caja: sus ventas se acumulan hasta que la cierra
 * contando el efectivo, y cada venta queda en un solo cierre. El Gerente revisa los
 * cierres y las cajas abiertas desde el panel de finanzas.
 */
@Injectable()
export class CajaService {
  constructor(private readonly db: BaseDeDatos) {}

  async abierta(vendedor: Usuario): Promise<CajaAbierta> {
    const [[resumen], porMedio, [ultimo]] = await Promise.all([
      this.db.consultar<{ ventas: number; total: number; desde: Date | null }>(
        `SELECT count(*)::int AS ventas, COALESCE(sum(ve.total), 0)::int AS total, min(ve.fecha) AS desde
         FROM ventas.ventas ve WHERE ${SIN_CERRAR}`,
        [vendedor.id],
      ),
      this.db.consultar<TotalMedio>(POR_MEDIO(SIN_CERRAR), [vendedor.id]),
      this.db.consultar<{ id_cierre: number; fecha: Date; fondo_inicial: number }>(
        'SELECT id_cierre, fecha, fondo_inicial FROM ventas.cierres_caja WHERE id_vendedor = $1 ORDER BY fecha DESC LIMIT 1',
        [vendedor.id],
      ),
    ]);
    return {
      desde: resumen?.desde?.toISOString() ?? null,
      ventas: resumen?.ventas ?? 0,
      total: resumen?.total ?? 0,
      porMedio,
      ultimoCierre: ultimo ? { idCierre: ultimo.id_cierre, fecha: ultimo.fecha.toISOString(), fondoInicial: ultimo.fondo_inicial } : null,
    };
  }

  async cerrar(cuerpo: unknown, vendedor: Usuario): Promise<CierreCaja> {
    const datos = cuerpoComo<CierreCajaRequest>(cuerpo);
    exigir(typeof datos.claveIdempotencia === 'string' && datos.claveIdempotencia !== '', 'Falta la clave de idempotencia.');
    const fondoInicial = pesos(datos.fondoInicial, 'El fondo inicial');
    const efectivoContado = pesos(datos.efectivoContado, 'El efectivo contado');
    exigir(datos.observacion === undefined || datos.observacion === null || typeof datos.observacion === 'string', 'La observación no es válida.');
    const observacion = datos.observacion?.trim() ? datos.observacion.trim().slice(0, 500) : null;
    const clave = `cierre:${vendedor.id}:${datos.claveIdempotencia}`;

    return this.db.transaccion(async (tx) => {
      const [previo] = await tx.consultar<{ id_cierre: number }>('SELECT id_cierre FROM ventas.cierres_caja WHERE clave_idempotencia = $1', [clave]);
      if (previo) return this.cierre(tx, previo.id_cierre);

      // Bloquea las ventas que entran en el cierre: un cierre simultáneo espera y no las repite.
      const ventas = await tx.consultar<{ id_venta: number; fecha: Date; total: number; medio: MedioPresencial }>(
        `SELECT ve.id_venta, ve.fecha, ve.total, mp.codigo AS medio
         FROM ventas.ventas ve
         JOIN pagos.transacciones t ON t.id_venta = ve.id_venta
         JOIN pagos.medios_pago mp ON mp.id_medio = t.id_medio
         WHERE ${SIN_CERRAR}
         FOR UPDATE OF ve`,
        [vendedor.id],
      );
      const efectivoVentas = ventas.filter((v) => v.medio === 'EFECTIVO').reduce((s, v) => s + v.total, 0);
      const diferencia = efectivoContado - fondoInicial - efectivoVentas;
      exigir(diferencia === 0 || observacion !== null, 'El efectivo no cuadra: explica la diferencia en la observación.');

      const fechas = ventas.map((v) => v.fecha.getTime());
      const [{ id_cierre: idCierre }] = (await tx.consultar<{ id_cierre: number }>(
        `INSERT INTO ventas.cierres_caja
           (id_vendedor, desde, hasta, ventas, total, fondo_inicial, efectivo_ventas, efectivo_contado, observacion, clave_idempotencia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_cierre`,
        [
          vendedor.id,
          fechas.length ? new Date(Math.min(...fechas)) : null,
          fechas.length ? new Date(Math.max(...fechas)) : null,
          ventas.length,
          ventas.reduce((s, v) => s + v.total, 0),
          fondoInicial,
          efectivoVentas,
          efectivoContado,
          observacion,
          clave,
        ],
      )) as [{ id_cierre: number }];
      if (ventas.length > 0) {
        await tx.consultar('UPDATE ventas.ventas SET id_cierre = $1 WHERE id_venta = ANY($2::bigint[])', [idCierre, ventas.map((v) => v.id_venta)]);
      }
      return this.cierre(tx, idCierre);
    });
  }

  /** Cierres de los últimos `dias` días y las cajas abiertas de todos los vendedores. */
  async listar(consulta: Record<string, string | undefined>): Promise<CierresCaja> {
    const texto = consulta['dias'];
    const dias = texto === undefined || texto === '' ? 30 : Number(texto);
    exigir(Number.isInteger(dias) && dias >= 1 && dias <= 365, 'Los días deben ser un entero entre 1 y 365.');

    const [filas, abiertas] = await Promise.all([
      this.db.consultar<FilaCierre>(`${CIERRES} WHERE c.fecha >= now() - make_interval(days => $1) ORDER BY c.fecha DESC`, [dias]),
      this.db.consultar<{ vendedor: string; desde: Date; ventas: number; total: number; efectivo: number }>(
        `SELECT u.nombre AS vendedor, min(ve.fecha) AS desde, count(*)::int AS ventas, sum(ve.total)::int AS total,
                COALESCE(sum(ve.total) FILTER (WHERE mp.codigo = 'EFECTIVO'), 0)::int AS efectivo
         FROM ventas.ventas ve
         JOIN usuarios.usuarios u ON u.id_usuario = ve.id_vendedor
         JOIN pagos.transacciones t ON t.id_venta = ve.id_venta
         JOIN pagos.medios_pago mp ON mp.id_medio = t.id_medio
         WHERE ve.canal = 'POS' AND ve.id_cierre IS NULL
           AND ve.id_estado = (SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA')
         GROUP BY u.id_usuario, u.nombre
         ORDER BY min(ve.fecha)`,
      ),
    ]);
    const porMedio = await this.porMedioDe(this.db, filas.map((f) => f.id_cierre));
    return {
      cierres: filas.map((f) => this.aCierre(f, porMedio.get(f.id_cierre) ?? [])),
      abiertas: abiertas.map((a) => ({ ...a, desde: a.desde.toISOString() })),
    };
  }

  private async cierre(tx: Ejecutor, idCierre: number): Promise<CierreCaja> {
    const [fila] = await tx.consultar<FilaCierre>(`${CIERRES} WHERE c.id_cierre = $1`, [idCierre]);
    const porMedio = await this.porMedioDe(tx, [idCierre]);
    return this.aCierre(fila!, porMedio.get(idCierre) ?? []);
  }

  /** Los cuatro medios presenciales de cada cierre, con sus ventas. */
  private async porMedioDe(tx: Ejecutor, ids: number[]): Promise<Map<number, TotalMedio[]>> {
    const resultado = new Map<number, TotalMedio[]>();
    if (ids.length === 0) return resultado;
    const filas = await tx.consultar<TotalMedio & { id_cierre: number }>(
      `SELECT c.id_cierre, mp.codigo, mp.nombre,
              count(t.id_transaccion)::int AS ventas, COALESCE(sum(t.monto), 0)::int AS total
       FROM unnest($1::bigint[]) AS c(id_cierre)
       CROSS JOIN pagos.medios_pago mp
       LEFT JOIN ventas.ventas ve ON ve.id_cierre = c.id_cierre
       LEFT JOIN pagos.transacciones t ON t.id_venta = ve.id_venta AND t.id_medio = mp.id_medio
       WHERE mp.presencial
       GROUP BY c.id_cierre, mp.id_medio, mp.codigo, mp.nombre
       ORDER BY c.id_cierre, mp.id_medio`,
      [ids],
    );
    for (const { id_cierre: id, ...medio } of filas) {
      resultado.set(id, [...(resultado.get(id) ?? []), medio]);
    }
    return resultado;
  }

  private aCierre(f: FilaCierre, porMedio: TotalMedio[]): CierreCaja {
    return {
      idCierre: f.id_cierre,
      vendedor: f.vendedor,
      fecha: f.fecha.toISOString(),
      desde: f.desde?.toISOString() ?? null,
      hasta: f.hasta?.toISOString() ?? null,
      ventas: f.ventas,
      total: f.total,
      porMedio,
      fondoInicial: f.fondo_inicial,
      efectivoVentas: f.efectivo_ventas,
      efectivoEsperado: f.fondo_inicial + f.efectivo_ventas,
      efectivoContado: f.efectivo_contado,
      diferencia: f.diferencia,
      observacion: f.observacion,
    };
  }
}
