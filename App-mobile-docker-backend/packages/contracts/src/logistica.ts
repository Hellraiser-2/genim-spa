export type EstadoPedido =
  | 'PAGADO'
  | 'EN_PREPARACION'
  | 'DESPACHO_PENDIENTE'
  | 'ATENCION_MANUAL'
  | 'DESPACHADO'
  | 'ENTREGADO';

export interface LineaPedido {
  idVariante: number;
  sku: string;
  producto: string;
  talla: string;
  color: string;
  cantidad: number;
}

/** Pedido del e-commerce tal como lo ve el personal. GET /logistica/pedidos */
export interface Pedido {
  idPedido: number;
  idVenta: number;
  estado: EstadoPedido;
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
  lineas: LineaPedido[];
  pagadoEn: string;
  despachadoEn?: string;
  entregadoEn?: string;
  /** Número de seguimiento de Starken; existe desde que se emite el despacho. */
  trackingStarken?: string;
}

/** GET /logistica/regiones (público) */
export interface Region {
  idRegion: number;
  nombre: string;
}

/** GET /logistica/comunas?region= (público) */
export interface Comuna {
  idComuna: number;
  nombre: string;
}

/** POST /logistica/fletes/cotizar (público) */
export interface CotizacionFleteRequest {
  idComuna: number;
}

export interface CotizacionFlete {
  idComuna: number;
  /** Costo del despacho a esa comuna, en pesos. */
  valor: number;
}

export interface LineaPedidoCliente extends LineaPedido {
  precioUnitario: number;
}

/** Pedido tal como lo ve quien lo compró. GET /logistica/pedidos/mios (Cliente) */
export interface PedidoCliente extends Omit<Pedido, 'lineas'> {
  lineas: LineaPedidoCliente[];
  flete: number;
  /** Lo pagado: productos más flete. */
  total: number;
}

// --- Ruta de reparto (app de bodega) ---

/** Punto en el mapa, en grados decimales (WGS84). */
export interface Coordenada {
  lat: number;
  lon: number;
}

/**
 * DIRECCION: se ubicó la calle y el número. COMUNA: no se encontró la dirección y la
 * parada queda en el centro de su comuna, como referencia aproximada.
 */
export type PrecisionUbicacion = 'DIRECCION' | 'COMUNA';

export interface ParadaReparto {
  /** Lugar en la ruta, desde 1. */
  orden: number;
  idPedido: number;
  estado: EstadoPedido;
  destinatario: string;
  direccion: string;
  comuna: string;
  /** Prendas que se entregan en la parada. */
  unidades: number;
  ubicacion: Coordenada;
  precision: PrecisionUbicacion;
  /** Desde la parada anterior (o la bodega) hasta esta, en metros y segundos. */
  distanciaTramo: number;
  duracionTramo: number;
}

/** Pedido por enviar que no se pudo ubicar en el mapa: queda fuera de la ruta. */
export interface PedidoSinUbicar {
  idPedido: number;
  destinatario: string;
  direccion: string;
  comuna: string;
}

/**
 * GET /logistica/rutas/reparto (Vendedor, Bodega, Gerente)
 *
 * Recorrido para repartir en el día los pedidos por enviar de la Región Metropolitana:
 * sale de la bodega, pasa por cada dirección en el orden que menos maneja y vuelve. Los
 * pedidos de regiones siguen por Starken y no entran.
 */
export interface RutaReparto {
  origen: { nombre: string; direccion: string; ubicacion: Coordenada };
  paradas: ParadaReparto[];
  sinUbicar: PedidoSinUbicar[];
  /** El recorrido por calles, punto a punto y en orden: sale de la bodega y vuelve a ella. */
  trazado: Coordenada[];
  /** Metros y segundos de toda la vuelta, incluido el regreso a la bodega. */
  distanciaTotal: number;
  duracionTotal: number;
  /**
   * CALLES: el orden y las distancias salen del servicio de rutas. LINEA_RECTA: el servicio
   * no respondió; el orden es el del vecino más cercano y las distancias son en línea recta.
   */
  calculo: 'CALLES' | 'LINEA_RECTA';
}
