import type { CanalVenta } from './analitica';
import type { Ubicacion } from './inventario';
import type { LineaPedidoCliente } from './logistica';

/** Datos del destino de una compra web. */
export interface DatosDespacho {
  idComuna: number;
  direccion: string;
  destinatario: string;
  telefono: string;
}

/**
 * POST /ventas/checkout (Cliente)
 *
 * Crea la compra, reserva las unidades por 15 minutos e inicia el pago. Los precios y
 * el flete los pone el servicio: del carrito solo se aceptan las variantes y cantidades.
 * Reenviar la misma clave responde la compra ya creada.
 */
export interface CheckoutRequest {
  /** UUID generado por el cliente; reenviar la misma clave no crea otra compra. */
  claveIdempotencia: string;
  lineas: { idVariante: number; cantidad: number }[];
  despacho: DatosDespacho;
}

export interface CheckoutResponse {
  idVenta: number;
  /** Suma de los productos, sin el flete. */
  subtotal: number;
  flete: number;
  /** Lo que se cobra: productos más flete. */
  total: number;
  /** Identifica el pago en la pasarela; con él se informa el retorno. */
  tokenPago: string;
  /** Hasta cuándo quedan reservadas las unidades. Pasado ese momento la compra expira. */
  expiraEn: string;
}

/** Detalle de un rechazo `STOCK_INSUFICIENTE` del checkout: qué línea ajustar y cuánto hay. */
export interface LineaSinDisponibilidad {
  idVariante: number;
  producto: string;
  talla: string;
  disponible: number;
}

/**
 * POST /pagos/webpay/retorno (público)
 *
 * Resuelve el pago al volver de la pasarela. Es idempotente por token: un pago ya
 * resuelto responde el resultado guardado.
 */
export interface RetornoPagoRequest {
  tokenPago: string;
  /**
   * Solo para la pasarela simulada: `false` simula un pago rechazado por el banco.
   * Con la pasarela real el resultado lo informa ella y este campo se ignora.
   */
  aprobar?: boolean;
}

export type EstadoCompra = 'PAGADA' | 'RECHAZADA' | 'EXPIRADA';

export interface ResultadoPago {
  estado: EstadoCompra;
  idVenta: number;
  total: number;
  /** Número del pedido creado; solo en una compra pagada. */
  idPedido?: number;
  codigoAutorizacion?: string;
  /** Por qué no se cobró; solo en una compra rechazada. */
  motivo?: string;
}

/**
 * Compra iniciada que aún no se paga. GET /ventas/pendientes (Cliente)
 *
 * Solo las vigentes: pasados los 15 minutos de reserva la compra expira y deja de
 * aparecer. Con `tokenPago` se puede retomar el pago.
 */
export interface CompraPendiente extends CheckoutResponse {
  fecha: string;
  lineas: LineaPedidoCliente[];
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
}

// --- Venta en tienda (POS) ---

/**
 * Medios con que se cobra en la tienda. La tarjeta se cobra en la máquina de cobro de la
 * caja, que informa el pago (`PagoMaquina`), o en un terminal aparte, y entonces el POS
 * solo registra el medio. La transferencia la confirma el vendedor al verla recibida.
 */
export type MedioPresencial = 'EFECTIVO' | 'DEBITO_PRESENCIAL' | 'CREDITO_PRESENCIAL' | 'TRANSFERENCIA';

/** Pago con tarjeta aprobado en la máquina de cobro. Nunca lleva el número de la tarjeta. */
export interface PagoMaquina {
  /** Identificador del cobro en la máquina. Un cobro paga una sola venta: si ya pagó otra, `COBRO_YA_USADO`. */
  idCobro: string;
  /** Código de autorización del voucher: letras y dígitos, hasta 32. */
  codigoAutorizacion: string;
  /** Últimos cuatro dígitos de la tarjeta, si la máquina los informa. */
  ultimosDigitos?: string | null;
}

export interface LineaVentaPos {
  idVariante: number;
  cantidad: number;
  /**
   * La venta sale de la sala de ventas. Con `true`, lo que falte en sala se retira de
   * bodega; sin él, una línea que la sala no alcanza se rechaza con `EXISTENCIA_EN_BODEGA`.
   */
  permitirBodega?: boolean;
}

/**
 * POST /ventas/pos (Vendedor)
 *
 * Registra la venta, descuenta el stock y emite el comprobante, todo de una vez: el
 * comprador se lleva la prenda. Sin flete ni despacho. Reenviar la misma clave responde
 * el comprobante ya emitido.
 */
export interface VentaPosRequest {
  /** UUID generado por el POS; reenviar la misma clave no crea otra venta. */
  claveIdempotencia: string;
  lineas: LineaVentaPos[];
  medioPago: MedioPresencial;
  /** Cliente identificado en el mostrador, si lo hay. */
  idCliente?: number;
  /** Solo con débito o crédito cobrados en la máquina de cobro: el pago que aprobó. */
  pagoMaquina?: PagoMaquina;
  /** Solo con transferencia: número de operación del comprobante del banco (letras, dígitos y guiones, hasta 40). */
  numeroOperacion?: string;
}

/** Detalle de un rechazo `EXISTENCIA_EN_BODEGA`: líneas que se pueden vender retirándolas de bodega. */
export interface LineaEnBodega {
  idVariante: number;
  producto: string;
  talla: string;
  enSala: number;
  enBodega: number;
}

export interface LineaComprobantePos extends LineaPedidoCliente {
  /** De dónde salieron las unidades. Una línea repartida entre sala y bodega aparece dos veces. */
  ubicacion: Ubicacion;
  subtotal: number;
}

/** Comprobante interno de una venta POS; sin validez tributaria. También GET /ventas/pos (Vendedor: las suyas; Gerente: todas). */
export interface ComprobantePos {
  idVenta: number;
  fecha: string;
  vendedor: string;
  cliente: string | null;
  medioPago: { codigo: MedioPresencial; nombre: string };
  /** Autorización de la máquina de cobro; `null` en efectivo o tarjeta pasada en un terminal aparte. */
  pagoMaquina: { codigoAutorizacion: string; ultimosDigitos: string | null } | null;
  /** Número de operación de una transferencia, si se informó. */
  numeroOperacion: string | null;
  lineas: LineaComprobantePos[];
  total: number;
}

// --- Ventas de todos los canales (Finanzas) ---

/**
 * Venta pagada de cualquier canal. GET /ventas (Gerente)
 *
 * Con `?desde=AAAA-MM-DD` solo las de ese día en adelante (hora de Chile). De la más
 * reciente a la más antigua.
 */
export interface VentaResumen {
  idVenta: number;
  fecha: string;
  canal: CanalVenta;
  /** Lo cobrado, con el flete incluido en las ventas web. */
  total: number;
  /** Parte del total que pagó el cliente por el despacho; 0 en el POS. */
  flete: number;
  unidades: number;
  cliente: string | null;
  /** Quien registró la venta en el POS; `null` en las ventas web. */
  vendedor: string | null;
  /** Nombre del medio de pago, si ya se conoce. */
  medioPago: string | null;
}

/**
 * Ingresos y gastos de un día, en hora de Chile. GET /finanzas/balance (Gerente)
 *
 * Solo los días con ventas o mermas, del más reciente al más antiguo. Con
 * `?desde=AAAA-MM-DD`, solo desde ese día. Ganancia = ingresos − gastos.
 */
export interface BalanceDia {
  /** AAAA-MM-DD. */
  fecha: string;
  /** Ventas web pagadas ese día, con el flete cobrado. */
  ingresoWeb: number;
  /** Ventas del POS ese día. */
  ingresoPos: number;
  /** Lo que costaron las prendas vendidas ese día, a su costo de compra. */
  costoPrendas: number;
  /** Lo que cobró Starken por despachar las ventas de ese día; 0 mientras no se despachan. */
  despacho: number;
  /** Comisiones de los medios de pago de las ventas de ese día. */
  comisiones: number;
  /** Prendas dadas de baja ese día, a su costo de compra. */
  mermas: number;
}

// --- Cierre de caja (POS) ---

/** Ventas y monto de un medio de pago en una caja. */
export interface TotalMedio {
  codigo: MedioPresencial;
  nombre: string;
  ventas: number;
  total: number;
}

/**
 * GET /ventas/pos/caja (Vendedor)
 *
 * La caja abierta de quien consulta: sus ventas POS que aún no entran en un cierre.
 */
export interface CajaAbierta {
  /** Fecha de la primera venta sin cerrar; `null` si no hay ventas. */
  desde: string | null;
  ventas: number;
  total: number;
  /** Siempre los cuatro medios presenciales, aunque no tengan ventas. */
  porMedio: TotalMedio[];
  ultimoCierre: { idCierre: number; fecha: string; fondoInicial: number } | null;
}

/**
 * POST /ventas/pos/cierres (Vendedor)
 *
 * Cierra la caja: toma todas las ventas sin cerrar del vendedor y compara el efectivo
 * contado con el esperado (fondo inicial + ventas en efectivo). Con diferencia, la
 * observación es obligatoria. Reenviar la misma clave responde el mismo cierre.
 */
export interface CierreCajaRequest {
  claveIdempotencia: string;
  /** Efectivo con que partió la caja, en pesos. */
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
  /** Fondo inicial + ventas en efectivo. */
  efectivoEsperado: number;
  efectivoContado: number;
  /** Contado − esperado: positivo sobra, negativo falta. */
  diferencia: number;
  observacion: string | null;
}

/**
 * GET /ventas/cierres?dias=30 (Gerente)
 *
 * Los cierres de los últimos días (1 a 365) y las cajas que siguen abiertas.
 */
export interface CierresCaja {
  cierres: CierreCaja[];
  abiertas: { vendedor: string; desde: string; ventas: number; total: number; efectivo: number }[];
}
