import { randomUUID } from 'node:crypto';

import type { CajaAbierta, CierreCaja, CierresCaja, ComprobantePos, ErrorApi, SesionResponse, VentaPosRequest } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Cierre de caja del POS. Levanta su propia API con base en memoria.
 * La Polera Eddie M (variante 7) cuesta $15.990 y tiene 11 unidades entre bodega y sala.
 */

const EDDIE = 7;
const PRECIO = 15990;

let apiUrl: string;
let detener: () => Promise<void>;
let vendedor: string;
let gerente: string;
let bodega: string;
let cliente: string;

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<{ status: number; cuerpo: T }> {
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

const vender = (datos: Partial<VentaPosRequest>) =>
  llamar<ComprobantePos>(
    'POST',
    '/ventas/pos',
    { claveIdempotencia: randomUUID(), lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }], medioPago: 'EFECTIVO', ...datos },
    vendedor,
  );

const caja = async () => (await llamar<CajaAbierta>('GET', '/ventas/pos/caja', undefined, vendedor)).cuerpo;
const cerrar = (datos: Record<string, unknown>) =>
  llamar<CierreCaja>('POST', '/ventas/pos/cierres', { claveIdempotencia: randomUUID(), ...datos }, vendedor);
const totalDe = (c: { porMedio: { codigo: string; total: number; ventas: number }[] }, codigo: string) => c.porMedio.find((m) => m.codigo === codigo);

beforeAll(async () => {
  ({ apiUrl, detener } = await iniciarEntornoLocal({ silencioso: true }));
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
  gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
});

afterAll(async () => {
  await detener?.();
});

describe('cierre de caja', () => {
  it('la caja y el cierre son del Vendedor; el listado, del Gerente', async () => {
    for (const token of [cliente, bodega, gerente]) {
      expect((await llamar<ErrorApi>('GET', '/ventas/pos/caja', undefined, token)).status).toBe(403);
      expect((await llamar<ErrorApi>('POST', '/ventas/pos/cierres', { claveIdempotencia: 'x', fondoInicial: 0, efectivoContado: 0 }, token)).status).toBe(403);
    }
    expect((await llamar<ErrorApi>('GET', '/ventas/cierres', undefined, vendedor)).status).toBe(403);
    expect((await llamar<CierresCaja>('GET', '/ventas/cierres', undefined, gerente)).status).toBe(200);
  });

  it('sin ventas, la caja está vacía y muestra los cuatro medios', async () => {
    const abierta = await caja();
    expect(abierta).toMatchObject({ desde: null, ventas: 0, total: 0, ultimoCierre: null });
    expect(abierta.porMedio.map((m) => m.codigo)).toEqual(['EFECTIVO', 'DEBITO_PRESENCIAL', 'CREDITO_PRESENCIAL', 'TRANSFERENCIA']);
  });

  it('suma las ventas sin cerrar por medio de pago', async () => {
    await vender({ medioPago: 'EFECTIVO' });
    await vender({ medioPago: 'EFECTIVO' });
    await vender({ medioPago: 'DEBITO_PRESENCIAL' });
    const transferencia = await vender({ medioPago: 'TRANSFERENCIA', numeroOperacion: 'OP-778899' });
    expect(transferencia.status).toBe(201);
    expect(transferencia.cuerpo).toMatchObject({ medioPago: { codigo: 'TRANSFERENCIA' }, numeroOperacion: 'OP-778899' });

    const abierta = await caja();
    expect(abierta.ventas).toBe(4);
    expect(abierta.total).toBe(4 * PRECIO);
    expect(abierta.desde).not.toBeNull();
    expect(totalDe(abierta, 'EFECTIVO')).toMatchObject({ ventas: 2, total: 2 * PRECIO });
    expect(totalDe(abierta, 'DEBITO_PRESENCIAL')).toMatchObject({ ventas: 1, total: PRECIO });
    expect(totalDe(abierta, 'CREDITO_PRESENCIAL')).toMatchObject({ ventas: 0, total: 0 });
    expect(totalDe(abierta, 'TRANSFERENCIA')).toMatchObject({ ventas: 1, total: PRECIO });
  });

  it('valida los montos y exige explicar una diferencia', async () => {
    expect((await cerrar({ fondoInicial: -1, efectivoContado: 0 })).status).toBe(400);
    expect((await cerrar({ fondoInicial: 0, efectivoContado: 100.5 })).status).toBe(400);
    const sinExplicar = await cerrar({ fondoInicial: 20000, efectivoContado: 20000 });
    expect(sinExplicar.status).toBe(400);
    expect((sinExplicar.cuerpo as unknown as ErrorApi).mensaje).toContain('explica la diferencia');
    // Nada se cerró.
    expect((await caja()).ventas).toBe(4);
  });

  it('cierra cuadrada, deja la caja vacía y no se repite con la misma clave', async () => {
    const clave = randomUUID();
    const datos = { claveIdempotencia: clave, fondoInicial: 20000, efectivoContado: 20000 + 2 * PRECIO };
    const { status, cuerpo } = await cerrar(datos);

    expect(status).toBe(201);
    expect(cuerpo).toMatchObject({
      vendedor: 'Vendedor Demo',
      ventas: 4,
      total: 4 * PRECIO,
      fondoInicial: 20000,
      efectivoVentas: 2 * PRECIO,
      efectivoEsperado: 20000 + 2 * PRECIO,
      diferencia: 0,
      observacion: null,
    });
    expect(totalDe(cuerpo, 'TRANSFERENCIA')).toMatchObject({ ventas: 1, total: PRECIO });

    const repetido = await cerrar(datos);
    expect(repetido.cuerpo.idCierre).toBe(cuerpo.idCierre);

    const abierta = await caja();
    expect(abierta).toMatchObject({ ventas: 0, total: 0, desde: null });
    expect(abierta.ultimoCierre).toMatchObject({ idCierre: cuerpo.idCierre, fondoInicial: 20000 });
  });

  it('con un faltante explicado registra la diferencia', async () => {
    await vender({ medioPago: 'EFECTIVO' });
    const { status, cuerpo } = await cerrar({ fondoInicial: 20000, efectivoContado: 20000 + PRECIO - 1000, observacion: '  Vuelto mal entregado  ' });
    expect(status).toBe(201);
    expect(cuerpo).toMatchObject({ ventas: 1, diferencia: -1000, observacion: 'Vuelto mal entregado' });
  });

  it('el Gerente ve los cierres y las cajas abiertas', async () => {
    await vender({ medioPago: 'CREDITO_PRESENCIAL' });
    const { cuerpo } = await llamar<CierresCaja>('GET', '/ventas/cierres?dias=7', undefined, gerente);

    expect(cuerpo.cierres).toHaveLength(2);
    const [ultimo, primero] = cuerpo.cierres;
    expect(ultimo!.diferencia).toBe(-1000);
    expect(primero!.diferencia).toBe(0);
    expect(totalDe(primero!, 'EFECTIVO')).toMatchObject({ ventas: 2, total: 2 * PRECIO });

    expect(cuerpo.abiertas).toEqual([expect.objectContaining({ vendedor: 'Vendedor Demo', ventas: 1, total: PRECIO, efectivo: 0 })]);
    expect((await llamar<ErrorApi>('GET', '/ventas/cierres?dias=0', undefined, gerente)).status).toBe(400);
  });
});
