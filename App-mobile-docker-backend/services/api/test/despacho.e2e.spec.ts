import { randomUUID } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import type { ErrorApi, Pedido, SesionResponse, Ubicacion, VarianteStock } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Pruebas de la generación de despacho (CU-11). Despachan los pedidos de demostración,
 * así que levantan siempre su propia API con base en memoria: nunca tocan la base de
 * `docker compose`, aunque `API_URL` esté definido.
 *
 * Los tres pedidos sin despachar (1001, 1002 y 1003) llevan una Polera Calavera L
 * (variante 2, SKU RS-0002), que parte con 8 unidades en bodega, 2 en sala y 3 reservadas.
 */

const FLETE = 4990;

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let bodega: string;
let vendedor: string;

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as T };
}

async function iniciarSesion(email: string, password: string): Promise<string> {
  return (await llamar<SesionResponse>('POST', '/usuarios/auth/login', { email, password })).cuerpo.accessToken;
}

const despachar = <T = Pedido>(idPedido: number | string, token?: string) =>
  llamar<T>('POST', `/logistica/pedidos/${idPedido}/despacho`, undefined, token);

async function pedido(idPedido: number): Promise<Pedido> {
  return (await llamar<Pedido[]>('GET', '/logistica/pedidos', undefined, bodega)).cuerpo.find((p) => p.idPedido === idPedido)!;
}

async function calaveraL(): Promise<VarianteStock> {
  return (await llamar<VarianteStock>('GET', '/inventario/variantes/por-codigo/RS-0002', undefined, bodega)).cuerpo;
}

const existencia = (variante: VarianteStock, ubicacion: Ubicacion) =>
  variante.existencias.find((e) => e.ubicacion === ubicacion)!.cantidad;

const filas = async <T>(sql: string, parametros: unknown[] = []) => (await db.query<T>(sql, parametros)).rows;

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
});

afterAll(async () => {
  await detener?.();
});

describe('generación de despacho', () => {
  it('deja el pedido despachado, con su código de seguimiento y la fecha', async () => {
    const antes = Date.now();

    const { status, cuerpo } = await despachar(1001, vendedor);

    expect(status).toBe(200);
    expect(cuerpo).toMatchObject({
      idPedido: 1001,
      idVenta: 5001,
      estado: 'DESPACHADO',
      destinatario: 'Camila Rojas',
      trackingStarken: 'STK-901001',
      lineas: [{ idVariante: 2, sku: 'RS-0002', cantidad: 1 }],
    });
    expect(new Date(cuerpo.despachadoEn!).getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(cuerpo).not.toHaveProperty('entregadoEn');
    // La lista de pedidos muestra lo mismo que respondió el despacho.
    expect(await pedido(1001)).toEqual(cuerpo);
  });

  it('descuenta la prenda de la bodega y cierra su reserva, sin cambiar lo disponible', async () => {
    const variante = await calaveraL();
    expect(existencia(variante, 'BODEGA')).toBe(7);
    expect(existencia(variante, 'SALA_VENTAS')).toBe(2);
    expect(variante.reservado).toBe(2);
    expect(variante.disponible).toBe(7);

    expect(await filas('SELECT estado FROM inventario.reservas WHERE id_venta = 5001')).toEqual([{ estado: 'DESPACHADA' }]);
    expect(
      await filas(
        `SELECT tm.codigo AS tipo, u.nombre AS ubicacion, m.id_variante, m.cantidad, m.motivo, m.id_usuario
         FROM inventario.movimientos m
         JOIN inventario.tipos_movimiento tm ON tm.id_tipo = m.id_tipo
         JOIN inventario.ubicaciones u ON u.id_ubicacion = m.id_ubicacion
         WHERE m.id_venta = 5001`,
      ),
    ).toEqual([{ tipo: 'DESPACHO', ubicacion: 'BODEGA', id_variante: 2, cantidad: 1, motivo: 'Despacho del pedido #1001', id_usuario: 2 }]);
  });

  it('guarda el costo del despacho y quién lo generó', async () => {
    expect(await filas('SELECT flete_cobrado, costo_despacho FROM logistica.pedidos WHERE id_pedido = 1001')).toEqual([
      { flete_cobrado: FLETE, costo_despacho: FLETE },
    ]);
    expect(await filas('SELECT costo_despacho FROM ventas.costos_venta WHERE id_venta = 5001')).toEqual([{ costo_despacho: FLETE }]);
    expect(
      await filas(
        `SELECT es.codigo AS estado, h.id_usuario FROM logistica.historial_pedido h
         JOIN logistica.estados_pedido es ON es.id_estado = h.id_estado WHERE h.id_pedido = 1001`,
      ),
    ).toEqual([{ estado: 'DESPACHADO', id_usuario: 2 }]);
  });

  it('repetirlo no genera otro despacho: responde el que ya existe', async () => {
    const primero = await pedido(1001);

    const { status, cuerpo } = await despachar(1001, bodega);

    expect(status).toBe(200);
    expect(cuerpo).toEqual(primero);
    expect((await calaveraL()).existencias).toEqual([
      { ubicacion: 'BODEGA', cantidad: 7 },
      { ubicacion: 'SALA_VENTAS', cantidad: 2 },
    ]);
    expect(await filas('SELECT 1 FROM inventario.movimientos WHERE id_venta = 5001')).toHaveLength(1);
  });

  it('un pedido que ya venía despachado conserva su código de seguimiento', async () => {
    const original = await pedido(1004);

    const { status, cuerpo } = await despachar(1004, vendedor);

    expect(status).toBe(200);
    expect(cuerpo).toEqual(original);
    expect(cuerpo.trackingStarken).toBe('STK-900104');
  });

  it('no despacha si la existencia física no alcanza, y el pedido queda como estaba', async () => {
    await db.query('UPDATE inventario.existencias SET cantidad = 0 WHERE id_variante = 2');

    const respuesta = await despachar<ErrorApi>(1002, vendedor);

    expect(respuesta).toEqual({
      status: 409,
      cuerpo: { codigo: 'STOCK_INSUFICIENTE', mensaje: 'No hay existencia suficiente de RS-0002 para despachar el pedido.' },
    });
    expect(await pedido(1002)).toMatchObject({ estado: 'EN_PREPARACION' });
    expect(await pedido(1002)).not.toHaveProperty('trackingStarken');
    expect(await filas('SELECT estado FROM inventario.reservas WHERE id_venta = 5002')).toEqual([{ estado: 'CONFIRMADA' }]);

    await db.query('UPDATE inventario.existencias SET cantidad = 7 WHERE id_variante = 2 AND id_ubicacion = 1');
    await db.query('UPDATE inventario.existencias SET cantidad = 2 WHERE id_variante = 2 AND id_ubicacion = 2');
  });

  it('rechaza el despacho de un pedido cuya compra no está pagada', async () => {
    const estadoDeVenta = (codigo: string) =>
      db.query(`UPDATE ventas.ventas SET id_estado = (SELECT id_estado FROM ventas.estados_venta WHERE codigo = $1) WHERE id_venta = 5002`, [
        codigo,
      ]);
    await estadoDeVenta('REVERSADA');

    const respuesta = await despachar<ErrorApi>(1002, vendedor);

    expect(respuesta).toEqual({
      status: 409,
      cuerpo: { codigo: 'PEDIDO_NO_PAGADO', mensaje: 'La compra de este pedido no está pagada.' },
    });
    expect(await pedido(1002)).toMatchObject({ estado: 'EN_PREPARACION' });
    expect((await calaveraL()).reservado).toBe(2);

    await estadoDeVenta('PAGADA');
  });

  it('saca la prenda de la sala de ventas cuando en la bodega no queda', async () => {
    // Toda la bodega pasa a la sala: el pedido 1003, que esperaba su despacho, sale de ahí.
    const traspaso = await llamar('POST', '/inventario/movimientos/traspasos', {
      claveIdempotencia: randomUUID(),
      idVariante: 2,
      origen: 'BODEGA',
      destino: 'SALA_VENTAS',
      cantidad: 7,
      motivo: 'Prueba de despacho',
    }, bodega);
    expect(traspaso.status).toBe(201);

    const { status, cuerpo } = await despachar(1003, bodega);

    expect(status).toBe(200);
    expect(cuerpo).toMatchObject({ estado: 'DESPACHADO', trackingStarken: 'STK-901003' });
    expect((await calaveraL()).existencias).toEqual([
      { ubicacion: 'BODEGA', cantidad: 0 },
      { ubicacion: 'SALA_VENTAS', cantidad: 8 },
    ]);
    expect(
      await filas(
        `SELECT u.nombre AS ubicacion, m.cantidad, m.id_usuario FROM inventario.movimientos m
         JOIN inventario.ubicaciones u ON u.id_ubicacion = m.id_ubicacion WHERE m.id_venta = 5003`,
      ),
    ).toEqual([{ ubicacion: 'SALA_VENTAS', cantidad: 1, id_usuario: 1 }]);
  });

  it('cada pedido recibe un código de seguimiento distinto', async () => {
    const codigos = (await llamar<Pedido[]>('GET', '/logistica/pedidos', undefined, bodega)).cuerpo.flatMap((p) => p.trackingStarken ?? []);
    expect(codigos).toHaveLength(6);
    expect(new Set(codigos).size).toBe(6);
  });

  it('solo Vendedor y Bodega generan despachos, y con sesión', async () => {
    const gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
    const cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');

    expect((await despachar<ErrorApi>(1002, gerente)).status).toBe(403);
    expect((await despachar<ErrorApi>(1002, cliente)).status).toBe(403);
    expect((await despachar<ErrorApi>(1002)).status).toBe(401);
    expect(await pedido(1002)).toMatchObject({ estado: 'EN_PREPARACION' });
  });

  it('informa un pedido que no existe o un número que no es válido', async () => {
    expect(await despachar<ErrorApi>(999999, vendedor)).toEqual({
      status: 404,
      cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'El pedido no existe.' },
    });
    expect((await despachar<ErrorApi>('abc', vendedor)).status).toBe(400);
  });
});
