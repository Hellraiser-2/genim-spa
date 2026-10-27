import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  BalanceDia,
  CierresCaja,
  ConciertoBandaRequest,
  ConsultaAsesorRequest,
  CuentaInterna,
  EstadoAsesor,
  GuiaDeTallas,
  IngresoRequest,
  MedidaDeTalla,
  MedidasDeCategoriaRequest,
  MensajeAsesor,
  MermaRequest,
  Movimiento,
  Pedido,
  ProductoEdicionRequest,
  Recomendaciones,
  RespuestaAsesor,
  Ubicacion,
  VarianteGestion,
  VentaResumen,
} from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/api';
import { PLACEHOLDER_IMAGE } from '../data/models';

/** Fila de la tabla de bodega: una variante con su stock físico y los datos comerciales de su producto. */
export interface StockRow {
  id: number;
  productId: number;
  sku: string;
  name: string;
  category: string;
  size: string;
  color: string;
  /** `null` mientras el Gerente no define el precio; sin precio no se publica en la tienda. */
  price: number | null;
  /** Precio de oferta de este mes; `null` si el producto no está en oferta. */
  offerPrice: number | null;
  description: string;
  /** Técnica del estampado; vacío si no está registrada. */
  printType: string;
  image: string;
  location: string;
  active: boolean;
  warehouse: number;
  salesFloor: number;
  /** Unidades físicas: bodega más sala de ventas. */
  stock: number;
  reserved: number;
  available: number;
}

/** Períodos con que se filtran las ventas en Finanzas. */
export type SalesPeriod = 'today' | 'week' | 'month' | 'all';

/** Primer día del período, en la fecha de Chile (AAAA-MM-DD); `null` para todas las ventas. */
export function periodStart(period: SalesPeriod, now = new Date()): string | null {
  const days = { today: 0, week: 6, month: 29, all: null }[period];
  if (days === null) {
    return null;
  }
  const start = new Date(now.getTime() - days * 86_400_000);
  return start.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
}

/** Total y cantidad de ventas de un canal. */
export interface ChannelTotals {
  total: number;
  count: number;
}

function totalsOf(sales: VentaResumen[]): ChannelTotals {
  return { total: sales.reduce((sum, s) => sum + s.total, 0), count: sales.length };
}

function toRow(variante: VarianteGestion): StockRow {
  const units = (ubicacion: Ubicacion) => variante.existencias.find((e) => e.ubicacion === ubicacion)?.cantidad ?? 0;
  return {
    id: variante.idVariante,
    productId: variante.idProducto,
    sku: variante.sku,
    name: variante.producto,
    category: variante.categoria,
    size: variante.talla,
    color: variante.color,
    price: variante.precio,
    offerPrice: variante.precioOferta,
    description: variante.descripcion ?? '',
    printType: variante.tipoEstampado ?? '',
    image: variante.imagenUrl ?? PLACEHOLDER_IMAGE,
    location: variante.codigoUbicacion,
    active: variante.activo,
    warehouse: units('BODEGA'),
    salesFloor: units('SALA_VENTAS'),
    stock: units('BODEGA') + units('SALA_VENTAS'),
    reserved: variante.reservado,
    available: variante.disponible,
  };
}

/**
 * Datos del personal: inventario completo, mermas, pedidos y cuentas internas, y las
 * operaciones de bodega. El backend decide qué puede hacer cada rol.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  readonly inventory = signal<StockRow[]>([]);
  readonly losses = signal<Movimiento[]>([]);
  readonly orders = signal<Pedido[]>([]);
  readonly staff = signal<CuentaInterna[]>([]);
  /** Ventas pagadas de la tienda web y del POS en el período elegido, de la más reciente a la más antigua. */
  readonly sales = signal<VentaResumen[]>([]);

  readonly webSales = computed(() => totalsOf(this.sales().filter((s) => s.canal === 'ECOMMERCE')));
  readonly storeSales = computed(() => totalsOf(this.sales().filter((s) => s.canal === 'POS')));
  readonly allSales = computed(() => totalsOf(this.sales()));
  /** Lo que pagaron los clientes por el despacho; es parte del total de las ventas web. */
  readonly shippingCharged = computed(() => this.sales().reduce((sum, s) => sum + s.flete, 0));

  /** Ingresos y gastos de cada día del período, del más reciente al más antiguo. */
  readonly balance = signal<BalanceDia[]>([]);
  /** Totales del período: ingresos por canal, gastos por tipo y ganancia. */
  readonly balanceTotals = computed(() => {
    const sum = (pick: (d: BalanceDia) => number) => this.balance().reduce((total, d) => total + pick(d), 0);
    const web = sum((d) => d.ingresoWeb);
    const pos = sum((d) => d.ingresoPos);
    const expenses = { garments: sum((d) => d.costoPrendas), shipping: sum((d) => d.despacho), fees: sum((d) => d.comisiones), losses: sum((d) => d.mermas) };
    const income = web + pos;
    const spent = expenses.garments + expenses.shipping + expenses.fees + expenses.losses;
    return { web, pos, income, expenses, spent, profit: income - spent, margin: income ? ((income - spent) / income) * 100 : 0 };
  });
  /** Cierres de caja del POS de los últimos 30 días y cajas aún abiertas. */
  readonly cierres = signal<CierresCaja | null>(null);

  readonly totalUnits = computed(() => this.inventory().reduce((sum, p) => sum + p.stock, 0));
  readonly lowStockCount = computed(() => this.inventory().filter((p) => p.active && p.stock <= 3).length);
  readonly locationsCount = computed(() => new Set(this.inventory().map((p) => p.location)).size);
  readonly unpricedCount = computed(() => new Set(this.inventory().filter((p) => p.price === null).map((p) => p.productId)).size);

  /** Valor de venta del stock físico de los productos que ya tienen precio. */
  readonly projectedSales = computed(() => this.inventory().reduce((sum, p) => sum + (p.price ?? 0) * p.stock, 0));

  /** Valor de venta de las unidades dadas de baja como merma, al precio actual de cada producto. */
  readonly lossValue = computed(() => {
    const prices = new Map(this.inventory().map((p) => [p.id, p.price ?? 0]));
    return this.losses().reduce((sum, m) => sum + m.cantidad * (prices.get(m.idVariante) ?? 0), 0);
  });

  readonly efficiency = computed(() => {
    const projected = this.projectedSales();
    const base = projected + this.lossValue();
    return base ? (projected / base) * 100 : 100;
  });

  /** Porcentaje de variantes activas con unidades disponibles para vender. */
  readonly availability = computed(() => {
    const active = this.inventory().filter((p) => p.active);
    return active.length ? (active.filter((p) => p.available > 0).length / active.length) * 100 : 0;
  });

  /** Porcentaje de pedidos pagados que ya salieron de la tienda. */
  readonly fulfilment = computed(() => {
    const orders = this.orders();
    const shipped = orders.filter((o) => o.estado === 'DESPACHADO' || o.estado === 'ENTREGADO').length;
    return orders.length ? (shipped / orders.length) * 100 : 100;
  });

  async loadInventory(): Promise<void> {
    const variantes = await firstValueFrom(this.http.get<VarianteGestion[]>(`${API_URL}/inventario/productos`));
    this.inventory.set(variantes.map(toRow));
  }

  /** Ventas de ambos canales y balance diario, desde el inicio del período. */
  async loadSales(period: SalesPeriod): Promise<void> {
    const desde = periodStart(period);
    const params: Record<string, string> = desde ? { desde } : {};
    const [sales, balance] = await Promise.all([
      firstValueFrom(this.http.get<VentaResumen[]>(`${API_URL}/ventas`, { params })),
      firstValueFrom(this.http.get<BalanceDia[]>(`${API_URL}/finanzas/balance`, { params })),
    ]);
    this.sales.set(sales);
    this.balance.set(balance);
  }

  /** Lo que muestra la vista de finanzas, que es del Gerente. */
  async loadFinance(period: SalesPeriod): Promise<void> {
    const [, , losses, orders, staff, cierres] = await Promise.all([
      this.loadInventory(),
      this.loadSales(period),
      firstValueFrom(this.http.get<Movimiento[]>(`${API_URL}/inventario/movimientos`, { params: { tipo: 'MERMA' } })),
      firstValueFrom(this.http.get<Pedido[]>(`${API_URL}/logistica/pedidos`)),
      firstValueFrom(this.http.get<CuentaInterna[]>(`${API_URL}/usuarios/internos`)),
      firstValueFrom(this.http.get<CierresCaja>(`${API_URL}/ventas/cierres`, { params: { dias: 30 } })),
    ]);
    this.cierres.set(cierres);
    this.losses.set(losses);
    this.orders.set(orders);
    this.staff.set(staff);
  }

  /** Ingreso de unidades a la bodega. `key` identifica la operación: reintentarla no la duplica. */
  async addStock(key: string, variantId: number, amount: number): Promise<void> {
    const body: IngresoRequest = {
      claveIdempotencia: key,
      ubicacion: 'BODEGA',
      motivo: 'Ingreso desde el panel de la tienda',
      lineas: [{ idVariante: variantId, cantidad: amount }],
    };
    await firstValueFrom(this.http.post(`${API_URL}/inventario/movimientos/ingresos`, body));
    await this.loadInventory();
  }

  async registerDamage(key: string, variantId: number, location: Ubicacion, amount: number, reason: string): Promise<void> {
    const body: MermaRequest = {
      claveIdempotencia: key,
      idVariante: variantId,
      ubicacion: location,
      cantidad: amount,
      tipoMerma: 'DANADO',
      motivo: reason,
    };
    await firstValueFrom(this.http.post(`${API_URL}/inventario/movimientos/mermas`, body));
    await this.loadInventory();
  }

  /** Recomendaciones de inversión calculadas con reglas: bandas, tipos de producto y qué reponer. */
  investmentAdvice(): Promise<Recomendaciones> {
    return firstValueFrom(this.http.get<Recomendaciones>(`${API_URL}/asesor/recomendaciones`));
  }

  /** Indica si el chat con IA tiene la clave del servicio que necesita. */
  async advisorReady(): Promise<boolean> {
    return (await firstValueFrom(this.http.get<EstadoAsesor>(`${API_URL}/asesor/estado`))).configurado;
  }

  /**
   * Le pregunta al asesor de inversión. Va la conversación completa: el backend no la
   * guarda. La respuesta puede tardar más de un minuto, porque busca en internet.
   */
  askAdvisor(messages: MensajeAsesor[]): Promise<RespuestaAsesor> {
    const body: ConsultaAsesorRequest = { mensajes: messages };
    return firstValueFrom(this.http.post<RespuestaAsesor>(`${API_URL}/asesor/consultas`, body));
  }

  /** La guía de tallas de todas las categorías, con las tallas que aún no tienen medidas. */
  sizeGuides(): Promise<GuiaDeTallas[]> {
    return firstValueFrom(this.http.get<GuiaDeTallas[]>(`${API_URL}/inventario/catalogo/guias-tallas`));
  }

  /** Guarda las medidas de las tallas de una categoría. */
  async saveSizeGuide(category: string, sizes: MedidaDeTalla[]): Promise<void> {
    const body: MedidasDeCategoriaRequest = { categoria: category, tallas: sizes };
    await firstValueFrom(this.http.put(`${API_URL}/inventario/categorias/medidas`, body));
  }

  /** Registra el próximo concierto de una banda en Chile; sin fecha, lo quita. */
  async saveConcert(band: string, date: string | null, place: string | null): Promise<void> {
    const body: ConciertoBandaRequest = { banda: band, fecha: date, lugar: place };
    await firstValueFrom(this.http.put(`${API_URL}/inventario/bandas/concierto`, body));
  }

  /** Cambia el precio, la oferta del mes, la descripción y el tipo de estampado del producto; aplica a todas sus tallas. */
  async updateProduct(productId: number, changes: ProductoEdicionRequest): Promise<void> {
    await firstValueFrom(this.http.patch(`${API_URL}/inventario/productos/${productId}`, changes));
    await this.loadInventory();
  }
}
