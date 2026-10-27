/**
 * Cliente HTTP del POS contra la API Rockstar.
 *
 * - En desarrollo (`npm run dev`) usa VITE_API_URL (http://localhost:3000/api/v1).
 * - En Docker usa el mismo origen (`/api/v1/...`): nginx reenvia al backend,
 *   asi no hay CORS que configurar.
 * - En la app instalada, la dirección del equipo servidor (ver `servidor.ts`).
 * - El POS NUNCA se conecta directo a PostgreSQL desde el navegador;
 *   DATABASE_URL es solo para scripts Node (ver .env.example).
 */

import { baseApi } from './servidor';

/** Rechazo de la API: `{ codigo, mensaje, detalle }`. El codigo permite reaccionar a casos puntuales. */
export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
    readonly codigo?: string,
    readonly detalle?: unknown,
  ) {
    super(mensaje);
  }
}

async function leerJson(res: Response) {
  const texto = await res.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = { mensaje: texto };
  }
  if (!res.ok) {
    const error = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as {
      codigo?: unknown;
      mensaje?: unknown;
      detalle?: unknown;
    };
    throw new ErrorApi(
      error.mensaje !== undefined ? String(error.mensaje) : `Error ${res.status}`,
      res.status,
      typeof error.codigo === 'string' ? error.codigo : undefined,
      error.detalle,
    );
  }
  return cuerpo;
}

export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: string;
}

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioSesion;
}

/** Prenda a la venta. GET /inventario/catalogo (publico, sin token). */
export interface ArticuloCatalogo {
  idVariante: number;
  idProducto: number;
  sku: string;
  producto: string;
  categoria: string;
  banda: string | null;
  talla: string;
  color: string;
  precio: number;
  descripcion: string | null;
  imagenUrl: string | null;
  disponible: number;
}

/** Prefijo con que el backend informa las fotos (`assets/prendas/<archivo>`). */
const PRENDAS_BACKEND = 'assets/prendas/';

/** Las fotos se sirven desde el propio contenedor (ver `public/prendas/`). */
const PRENDAS_LOCAL = '/prendas/';

/**
 * URL de imagen lista para `<img>`: las fotos del backend (`assets/prendas/*`)
 * se resuelven al mismo origen del POS (nginx las sirve desde `dist/prendas/`),
 * las absolutas se usan tal cual y `null` mantiene el placeholder.
 */
export function getImageUrl(variante: { imagenUrl: string | null }): string | null {
  const raw = variante.imagenUrl?.trim();
  if (!raw) return null;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const sinBarra = raw.replace(/^\/+/, '');
  if (sinBarra.startsWith(PRENDAS_BACKEND)) {
    return PRENDAS_LOCAL + sinBarra.slice(PRENDAS_BACKEND.length);
  }
  if (sinBarra.startsWith('prendas/')) return '/' + sinBarra;
  return raw.startsWith('/') ? raw : '/' + raw;
}

/** Variante para POS/ventas. GET /inventario/productos (roles VENDEDOR, BODEGA, GERENTE). */
export interface VarianteGestion {
  id: number;
  idProducto: number;
  sku: string;
  codigo: string;
  producto: string;
  categoria: string;
  banda: string | null;
  talla: string;
  color: string;
  precio: number | null;
  descripcion: string | null;
  stockTotal: number;
  disponible: number;
}

/** GET /salud: el backend responde { estado: 'ok' }. */
export async function salud(): Promise<boolean> {
  const res = await fetch(`${baseApi()}/salud`);
  const cuerpo = (await leerJson(res)) as { estado?: string };
  return cuerpo.estado === 'ok';
}

/** POST /usuarios/auth/login con { email, password }. Cuentas demo en README. */
export async function login(email: string, password: string): Promise<Sesion> {
  const res = await fetch(`${baseApi()}/usuarios/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await leerJson(res)) as Sesion;
}

/** GET /inventario/catalogo: lo que ve un cliente (con precio y stock). */
export async function getCatalogo(): Promise<ArticuloCatalogo[]> {
  const res = await fetch(`${baseApi()}/inventario/catalogo`);
  return (await leerJson(res)) as ArticuloCatalogo[];
}

/**
 * GET /inventario/productos: catalogo de gestion para el POS
 * (todas las variantes, tengan precio o no). Requiere token de
 * VENDEDOR, BODEGA o GERENTE. Estos son los productos de las pruebas.
 */
export async function getProductos(accessToken: string): Promise<VarianteGestion[]> {
  const res = await fetch(`${baseApi()}/inventario/productos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as VarianteGestion[];
}

/** GET /inventario/variantes?q=... : busqueda por SKU, producto o banda (mismo token). */
export async function buscarVariantes(
  accessToken: string,
  q: string,
): Promise<VarianteGestion[]> {
  const res = await fetch(`${baseApi()}/inventario/variantes?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as VarianteGestion[];
}

/** Variante leida por escaneo. Solo los campos que usa el POS. */
export interface VarianteEscaneada {
  idVariante: number;
  sku: string;
  codigo: string;
  producto: string;
  talla: string;
  color: string;
  disponible: number;
}

/**
 * GET /inventario/variantes/por-codigo/:codigo (VENDEDOR, BODEGA, GERENTE): acepta el
 * codigo de barras de la etiqueta o el SKU que lleva su QR. Responde 404 si no existe.
 */
export async function buscarPorCodigo(accessToken: string, codigo: string): Promise<VarianteEscaneada> {
  const res = await fetch(`${baseApi()}/inventario/variantes/por-codigo/${encodeURIComponent(codigo)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as VarianteEscaneada;
}

/**
 * Medios con que se cobra en la tienda. La tarjeta se pasa por el terminal fisico:
 * el POS solo registra el medio, no hay pasarela (Webpay es solo de la tienda web).
 */
export type MedioPresencial = 'EFECTIVO' | 'DEBITO_PRESENCIAL' | 'CREDITO_PRESENCIAL' | 'TRANSFERENCIA';

export interface LineaVentaPos {
  idVariante: number;
  cantidad: number;
  /** Lo que falte en la sala de ventas se retira de bodega. */
  permitirBodega?: boolean;
}

/** Pago con tarjeta aprobado en la maquina de cobro. Nunca lleva el numero de la tarjeta. */
export interface PagoMaquina {
  /** Un cobro paga una sola venta: si ya pago otra, el backend responde COBRO_YA_USADO. */
  idCobro: string;
  codigoAutorizacion: string;
  ultimosDigitos?: string | null;
}

export interface VentaPosRequest {
  /** UUID por venta: reenviarlo no crea otra venta. */
  claveIdempotencia: string;
  lineas: LineaVentaPos[];
  medioPago: MedioPresencial;
  idCliente?: number;
  /** Solo si la tarjeta se cobro en la maquina: el backend guarda la autorizacion con la venta. */
  pagoMaquina?: PagoMaquina;
  /** Solo con transferencia: numero de operacion del comprobante del banco. */
  numeroOperacion?: string;
}

/** Detalle del rechazo EXISTENCIA_EN_BODEGA: lineas que la sala no alcanza. */
export interface LineaEnBodega {
  idVariante: number;
  producto: string;
  talla: string;
  enSala: number;
  enBodega: number;
}

export interface LineaComprobantePos {
  idVariante: number;
  sku: string;
  producto: string;
  talla: string;
  color: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  ubicacion: 'BODEGA' | 'SALA_VENTAS';
}

/** Comprobante interno de una venta POS (sin validez tributaria). */
export interface ComprobantePos {
  idVenta: number;
  fecha: string;
  vendedor: string;
  cliente: string | null;
  medioPago: { codigo: MedioPresencial; nombre: string };
  /** Autorizacion guardada de la maquina de cobro; null en efectivo o terminal aparte. */
  pagoMaquina: { codigoAutorizacion: string; ultimosDigitos: string | null } | null;
  /** Numero de operacion de una transferencia, si se informo. */
  numeroOperacion: string | null;
  lineas: LineaComprobantePos[];
  total: number;
}

/** POST /ventas/pos (VENDEDOR): registra la venta, descuenta stock y devuelve el comprobante. */
export async function registrarVentaPos(accessToken: string, datos: VentaPosRequest): Promise<ComprobantePos> {
  const res = await fetch(`${baseApi()}/ventas/pos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(datos),
  });
  return (await leerJson(res)) as ComprobantePos;
}

/** GET /ventas/pos: ventas POS del dia del vendedor, de la mas reciente a la mas antigua. */
export async function getVentasPos(accessToken: string): Promise<ComprobantePos[]> {
  const res = await fetch(`${baseApi()}/ventas/pos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as ComprobantePos[];
}

// --- Cierre de caja ---

/** Ventas y monto de un medio de pago en una caja. */
export interface TotalMedio {
  codigo: MedioPresencial;
  nombre: string;
  ventas: number;
  total: number;
}

/** GET /ventas/pos/caja: las ventas del vendedor que aun no entran en un cierre. */
export interface CajaAbierta {
  desde: string | null;
  ventas: number;
  total: number;
  porMedio: TotalMedio[];
  ultimoCierre: { idCierre: number; fecha: string; fondoInicial: number } | null;
}

export interface CierreCajaRequest {
  claveIdempotencia: string;
  fondoInicial: number;
  efectivoContado: number;
  observacion?: string;
}

export interface CierreCaja {
  idCierre: number;
  vendedor: string;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  ventas: number;
  total: number;
  porMedio: TotalMedio[];
  fondoInicial: number;
  efectivoVentas: number;
  efectivoEsperado: number;
  efectivoContado: number;
  /** Contado - esperado: positivo sobra, negativo falta. */
  diferencia: number;
  observacion: string | null;
}

export async function getCajaAbierta(accessToken: string): Promise<CajaAbierta> {
  const res = await fetch(`${baseApi()}/ventas/pos/caja`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return (await leerJson(res)) as CajaAbierta;
}

/** POST /ventas/pos/cierres: cierra la caja; reenviar la misma clave responde el mismo cierre. */
export async function cerrarCaja(accessToken: string, datos: CierreCajaRequest): Promise<CierreCaja> {
  const res = await fetch(`${baseApi()}/ventas/pos/cierres`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(datos),
  });
  return (await leerJson(res)) as CierreCaja;
}
