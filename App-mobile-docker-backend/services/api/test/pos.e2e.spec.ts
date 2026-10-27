import { randomUUID } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import type {
  BalanceDia,
  CheckoutResponse,
  Comuna,
  ComprobantePos,
  ErrorApi,
  LineaEnBodega,
  SesionResponse,
  VentaPosRequest,
  VentaResumen,
} from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Pruebas de la venta en tienda (POS). Venden productos de demostración, así que levantan
 * siempre su propia API con base en memoria y nunca tocan la base de `docker compose`.
 *
 * La Polera Eddie M (variante 7, $15.990) parte con 9 unidades en bodega y 2 en sala.
 * La Polera Rayo L (variante 8, $14.990), con 5 y 1.
 */

const EDDIE = 7;
const RAYO = 8;

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let vendedor: string;
let gerente: string;
let bodega: string;
let cliente: string;

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

function vender<T = ComprobantePos>(datos: Partial<VentaPosRequest>, token = vendedor) {
  return llamar<T>('POST', '/ventas/pos', { claveIdempotencia: randomUUID(), medioPago: 'EFECTIVO', ...datos }, token);
}

const filas = async <T>(sql: string, parametros: unknown[] = []) => (await db.query<T>(sql, parametros)).rows;

async function existencias(idVariante: number): Promise<{ BODEGA: number; SALA_VENTAS: number }> {
  const resultado = await filas<{ nombre: 'BODEGA' | 'SALA_VENTAS'; cantidad: number }>(
    `SELECT u.nombre, e.cantidad FROM inventario.existencias e JOIN inventario.ubicaciones u USING (id_ubicacion)
     WHERE e.id_variante = $1`,
    [idVariante],
  );
  return Object.fromEntries(resultado.map((fila) => [fila.nombre, fila.cantidad])) as { BODEGA: number; SALA_VENTAS: number };
}

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
  gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
});

afterAll(async () => {
  await detener?.();
});

describe('venta POS', () => {
  it('se registra pagada, sale de la sala de ventas y no cobra flete ni crea pedido', async () => {
    const antes = await existencias(EDDIE);

    const { status, cuerpo } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1 }], medioPago: 'DEBITO_PRESENCIAL' });

    expect(status).toBe(201);
    expect(cuerpo).toMatchObject({
      vendedor: 'Vendedor Demo',
      cliente: null,
      medioPago: { codigo: 'DEBITO_PRESENCIAL', nombre: 'Tarjeta de débito' },
      total: 15990,
      lineas: [{ idVariante: EDDIE, sku: 'RS-0007', cantidad: 1, precioUnitario: 15990, subtotal: 15990, ubicacion: 'SALA_VENTAS' }],
    });
    expect(await existencias(EDDIE)).toEqual({ BODEGA: antes.BODEGA, SALA_VENTAS: antes.SALA_VENTAS - 1 });

    const [venta] = await filas<{ canal: string; estado: string; flete: number; pedidos: number; movimiento: string }>(
      `SELECT v.canal, e.codigo AS estado, c.flete_cobrado AS flete,
              (SELECT count(*)::int FROM logistica.pedidos p WHERE p.id_venta = v.id_venta) AS pedidos,
              (SELECT t.codigo FROM inventario.movimientos m JOIN inventario.tipos_movimiento t USING (id_tipo)
               WHERE m.id_venta = v.id_venta) AS movimiento
       FROM ventas.ventas v JOIN ventas.estados_venta e USING (id_estado) JOIN ventas.costos_venta c USING (id_venta)
       WHERE v.id_venta = $1`,
      [cuerpo.idVenta],
    );
    expect(venta).toEqual({ canal: 'POS', estado: 'PAGADA', flete: 0, pedidos: 0, movimiento: 'VENTA' });
  });

  it('pide permiso para retirar de bodega lo que no alcanza en sala, y con él reparte la línea', async () => {
    const antes = await existencias(RAYO);
    const cantidad = antes.SALA_VENTAS + 1;

    const sinPermiso = await vender<ErrorApi>({ lineas: [{ idVariante: RAYO, cantidad }] });
    expect(sinPermiso.status).toBe(409);
    expect(sinPermiso.cuerpo.codigo).toBe('EXISTENCIA_EN_BODEGA');
    expect(sinPermiso.cuerpo.detalle as LineaEnBodega[]).toEqual([
      { idVariante: RAYO, producto: 'Polera Rayo', talla: 'L', enSala: antes.SALA_VENTAS, enBodega: antes.BODEGA },
    ]);
    expect(await existencias(RAYO)).toEqual(antes);

    const conPermiso = await vender({ lineas: [{ idVariante: RAYO, cantidad, permitirBodega: true }] });
    expect(conPermiso.status).toBe(201);
    expect(conPermiso.cuerpo.lineas.map((l) => [l.ubicacion, l.cantidad])).toEqual([
      ['SALA_VENTAS', antes.SALA_VENTAS],
      ['BODEGA', 1],
    ]);
    expect(conPermiso.cuerpo.total).toBe(14990 * cantidad);
    expect(await existencias(RAYO)).toEqual({ BODEGA: antes.BODEGA - 1, SALA_VENTAS: 0 });
  });

  it('rechaza lo que no tiene stock sin vender nada', async () => {
    const antes = await existencias(EDDIE);

    const { status, cuerpo } = await vender<ErrorApi>({ lineas: [{ idVariante: EDDIE, cantidad: 999, permitirBodega: true }] });

    expect(status).toBe(409);
    expect(cuerpo.codigo).toBe('STOCK_INSUFICIENTE');
    expect(await existencias(EDDIE)).toEqual(antes);
  });

  it('se registra una sola vez aunque se confirme dos veces', async () => {
    const antes = await existencias(EDDIE);
    const datos = { claveIdempotencia: randomUUID(), lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }] };

    const [primera, segunda] = await Promise.all([vender(datos), vender(datos)]);

    expect(primera.cuerpo.idVenta).toBe(segunda.cuerpo.idVenta);
    const total = (await existencias(EDDIE));
    expect(total.BODEGA + total.SALA_VENTAS).toBe(antes.BODEGA + antes.SALA_VENTAS - 1);
  });

  it('anota al cliente identificado en el mostrador', async () => {
    const [{ id_usuario: idCliente }] = await filas<{ id_usuario: number }>(
      "SELECT id_usuario FROM usuarios.usuarios WHERE email = 'cliente@rockstar.cl'",
    );

    const { status, cuerpo } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }], idCliente });

    expect(status).toBe(201);
    expect(cuerpo.cliente).toBe('Cliente Demo');
  });

  it('exige productos, un medio de pago presencial y un cliente válido', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1 }];
    expect((await vender<ErrorApi>({ lineas: [] })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, medioPago: undefined })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, medioPago: 'WEBPAY_DEBITO' as never })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, idCliente: 1 })).status).toBe(400);
  });

  it('guarda la autorización de la máquina de cobro con la venta', async () => {
    const pagoMaquina = { idCobro: randomUUID(), codigoAutorizacion: '123456', ultimosDigitos: '4242' };

    const { status, cuerpo } = await vender({
      lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }],
      medioPago: 'DEBITO_PRESENCIAL',
      pagoMaquina,
    });

    expect(status).toBe(201);
    expect(cuerpo.pagoMaquina).toEqual({ codigoAutorizacion: '123456', ultimosDigitos: '4242' });
    const [transaccion] = await filas<{ codigo_autorizacion: string; ultimos_digitos: string; id_cobro_maquina: string; estado: string }>(
      'SELECT codigo_autorizacion, ultimos_digitos, id_cobro_maquina, estado FROM pagos.transacciones WHERE id_venta = $1',
      [cuerpo.idVenta],
    );
    expect(transaccion).toEqual({ codigo_autorizacion: '123456', ultimos_digitos: '4242', id_cobro_maquina: pagoMaquina.idCobro, estado: 'AUTORIZADA' });
  });

  it('sin máquina de cobro la venta no lleva autorización', async () => {
    const { cuerpo } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }], medioPago: 'CREDITO_PRESENCIAL' });
    expect(cuerpo.pagoMaquina).toBeNull();
  });

  it('un cobro de la máquina paga una sola venta, aunque se reintente la misma', async () => {
    const pagoMaquina = { idCobro: randomUUID(), codigoAutorizacion: 'A1B2C3' };
    const datos = {
      claveIdempotencia: randomUUID(),
      lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }],
      medioPago: 'CREDITO_PRESENCIAL' as const,
      pagoMaquina,
    };

    const primera = await vender(datos);
    const reintento = await vender(datos);
    expect(reintento.cuerpo.idVenta).toBe(primera.cuerpo.idVenta);
    expect(primera.cuerpo.pagoMaquina).toEqual({ codigoAutorizacion: 'A1B2C3', ultimosDigitos: null });

    const otra = await vender<ErrorApi>({ ...datos, claveIdempotencia: randomUUID() });
    expect(otra.status).toBe(409);
    expect(otra.cuerpo.codigo).toBe('COBRO_YA_USADO');
    expect(otra.cuerpo.detalle).toEqual({ idVenta: primera.cuerpo.idVenta });
  });

  it('valida el pago de la máquina y no lo acepta en efectivo', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }];
    const valido = { idCobro: randomUUID(), codigoAutorizacion: '123456' };
    const antes = await existencias(EDDIE);

    expect((await vender<ErrorApi>({ lineas, medioPago: 'EFECTIVO', pagoMaquina: valido })).status).toBe(400);
    for (const pagoMaquina of [
      { ...valido, codigoAutorizacion: '' },
      { ...valido, codigoAutorizacion: '12 34' },
      { ...valido, idCobro: '' },
      { ...valido, ultimosDigitos: '42' },
      { ...valido, ultimosDigitos: '4111111111111111' },
    ]) {
      const { status } = await vender<ErrorApi>({ lineas, medioPago: 'DEBITO_PRESENCIAL', pagoMaquina });
      expect(status, JSON.stringify(pagoMaquina)).toBe(400);
    }
    expect(await existencias(EDDIE)).toEqual(antes);
  });

  it('acepta transferencia y guarda su número de operación', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }];
    const { status, cuerpo } = await vender({ lineas, medioPago: 'TRANSFERENCIA', numeroOperacion: ' 12345-AB ' });
    expect(status).toBe(201);
    expect(cuerpo).toMatchObject({ medioPago: { codigo: 'TRANSFERENCIA', nombre: 'Transferencia bancaria' }, numeroOperacion: '12345-AB', pagoMaquina: null });

    const sinNumero = await vender({ lineas, medioPago: 'TRANSFERENCIA' });
    expect(sinNumero.cuerpo.numeroOperacion).toBeNull();
  });

  it('el número de operación es solo de transferencias y la máquina solo de tarjetas', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }];
    expect((await vender<ErrorApi>({ lineas, medioPago: 'EFECTIVO', numeroOperacion: '123' })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, medioPago: 'TRANSFERENCIA', numeroOperacion: 'no válido!' })).status).toBe(400);
    const pagoMaquina = { idCobro: randomUUID(), codigoAutorizacion: '123456' };
    expect((await vender<ErrorApi>({ lineas, medioPago: 'TRANSFERENCIA', pagoMaquina })).status).toBe(400);
  });

  it('solo la registra un Vendedor', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1 }];
    expect((await vender<ErrorApi>({ lineas }, cliente)).status).toBe(403);
    expect((await vender<ErrorApi>({ lineas }, bodega)).status).toBe(403);
    expect((await vender<ErrorApi>({ lineas }, gerente)).status).toBe(403);
  });
});

describe('ventas POS del día', () => {
  it('el Vendedor ve las suyas con su comprobante, el Gerente todas y nadie más las consulta', async () => {
    const { cuerpo: venta } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }], medioPago: 'CREDITO_PRESENCIAL' });

    const delVendedor = await llamar<ComprobantePos[]>('GET', '/ventas/pos', undefined, vendedor);
    expect(delVendedor.status).toBe(200);
    expect(delVendedor.cuerpo[0]).toEqual(venta);

    const delGerente = await llamar<ComprobantePos[]>('GET', '/ventas/pos', undefined, gerente);
    expect(delGerente.cuerpo.map((v) => v.idVenta)).toEqual(delVendedor.cuerpo.map((v) => v.idVenta));

    expect((await llamar<ErrorApi>('GET', '/ventas/pos', undefined, bodega)).status).toBe(403);
    expect((await llamar<ErrorApi>('GET', '/ventas/pos', undefined, cliente)).status).toBe(403);
  });
});

describe('ventas de todos los canales (Finanzas)', () => {
  it('el Gerente ve juntas las ventas pagadas de la tienda web y del POS, y nadie más las consulta', async () => {
    const { cuerpo: enTienda } = await vender({ lineas: [{ idVariante: RAYO, cantidad: 1, permitirBodega: true }] });

    const comunas = (await llamar<Comuna[]>('GET', '/logistica/comunas?region=7')).cuerpo;
    const providencia = comunas.find((c) => c.nombre === 'Providencia')!.idComuna;
    const despacho = { idComuna: providencia, direccion: 'Av. Siempre Viva 742', destinatario: 'Cliente Demo', telefono: '+56 9 1234 5678' };
    const { cuerpo: web } = await llamar<CheckoutResponse>(
      'POST',
      '/ventas/checkout',
      { claveIdempotencia: randomUUID(), lineas: [{ idVariante: EDDIE, cantidad: 2 }], despacho },
      cliente,
    );
    // Hasta que se paga, la compra web no es una venta.
    const antesDelPago = (await llamar<VentaResumen[]>('GET', '/ventas', undefined, gerente)).cuerpo;
    expect(antesDelPago.some((v) => v.idVenta === web.idVenta)).toBe(false);
    await llamar('POST', '/pagos/webpay/retorno', { tokenPago: web.tokenPago, aprobar: true });

    const { status, cuerpo: ventas } = await llamar<VentaResumen[]>('GET', '/ventas', undefined, gerente);
    expect(status).toBe(200);
    expect(ventas.find((v) => v.idVenta === enTienda.idVenta)).toMatchObject({
      canal: 'POS',
      total: 14990,
      flete: 0,
      unidades: 1,
      vendedor: 'Vendedor Demo',
      medioPago: 'Efectivo',
    });
    expect(ventas.find((v) => v.idVenta === web.idVenta)).toMatchObject({
      canal: 'ECOMMERCE',
      total: web.total,
      flete: web.flete,
      unidades: 2,
      cliente: 'Cliente Demo',
      vendedor: null,
    });
    expect(ventas.map((v) => v.fecha)).toEqual([...ventas.map((v) => v.fecha)].sort().reverse());

    // Solo desde una fecha: hoy las incluye, mañana no.
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
    const manana = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
    expect((await llamar<VentaResumen[]>('GET', `/ventas?desde=${hoy}`, undefined, gerente)).cuerpo.map((v) => v.idVenta)).toContain(web.idVenta);
    expect((await llamar<VentaResumen[]>('GET', `/ventas?desde=${manana}`, undefined, gerente)).cuerpo).toEqual([]);
    expect((await llamar<ErrorApi>('GET', '/ventas?desde=ayer', undefined, gerente)).status).toBe(400);

    for (const token of [vendedor, bodega, cliente]) {
      expect((await llamar<ErrorApi>('GET', '/ventas', undefined, token)).status).toBe(403);
    }
  });
});

describe('balance diario (Finanzas)', () => {
  it('suma al día las ventas por canal, el costo de sus prendas y las mermas a su costo', async () => {
    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
    const delDia = async () =>
      (await llamar<BalanceDia[]>('GET', `/finanzas/balance?desde=${hoy}`, undefined, gerente)).cuerpo.find((d) => d.fecha === hoy) ?? {
        fecha: hoy, ingresoWeb: 0, ingresoPos: 0, costoPrendas: 0, despacho: 0, comisiones: 0, mermas: 0,
      };
    const [{ costo }] = await filas<{ costo: number }>(
      'SELECT p.costo_compra AS costo FROM inventario.variantes v JOIN inventario.productos p USING (id_producto) WHERE v.id_variante = $1',
      [RAYO],
    );
    const antes = await delDia();

    await vender({ lineas: [{ idVariante: RAYO, cantidad: 1, permitirBodega: true }] });
    const merma = await llamar(
      'POST',
      '/inventario/movimientos/mermas',
      { claveIdempotencia: randomUUID(), idVariante: RAYO, ubicacion: 'BODEGA', cantidad: 2, tipoMerma: 'DANADO', motivo: 'Prueba de balance' },
      bodega,
    );
    expect(merma.status).toBe(201);

    const despues = await delDia();
    expect(despues.ingresoPos - antes.ingresoPos).toBe(14990);
    expect(despues.ingresoWeb).toBe(antes.ingresoWeb);
    expect(despues.costoPrendas - antes.costoPrendas).toBe(costo);
    expect(despues.mermas - antes.mermas).toBe(2 * costo);

    expect((await llamar<ErrorApi>('GET', '/finanzas/balance?desde=hoy', undefined, gerente)).status).toBe(400);
    for (const token of [vendedor, bodega, cliente]) {
      expect((await llamar<ErrorApi>('GET', '/finanzas/balance', undefined, token)).status).toBe(403);
    }
  });
});
