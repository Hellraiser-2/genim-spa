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
