import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type {
  BalanceDia,
  CajaAbierta,
  CheckoutResponse,
  CierreCaja,
  CierresCaja,
  CompraPendiente,
  ComprobantePos,
  ResultadoPago,
  Usuario,
  VentaResumen,
} from '@rockstar/contracts';

import { Publica, Roles, UsuarioActual } from '../auth/decoradores.js';
import { CajaService } from './caja.service.js';
import { ComprasService } from './compras.service.js';
import { ResumenVentasService } from './resumen-ventas.service.js';
import { VentasPosService } from './ventas-pos.service.js';

/**
 * Compra web y venta en tienda. En el diseño el checkout es de Ventas y el retorno del pago
 * es de Pagos; aquí comparten controlador porque en este servicio único los resuelve la misma saga.
 */
@Controller()
export class VentasController {
  constructor(
    private readonly compras: ComprasService,
    private readonly pos: VentasPosService,
    private readonly resumen: ResumenVentasService,
    private readonly caja: CajaService,
  ) {}

  /** Ventas pagadas de la tienda web y del POS, juntas. Con `desde` (AAAA-MM-DD), solo las de ese día en adelante. Exige sesión de Gerente. */
  @Get('ventas')
  @Roles('GERENTE')
  ventas(@Query('desde') desde?: string): Promise<VentaResumen[]> {
    return this.resumen.pagadas(desde);
  }

  /** Ingresos y gastos de cada día (costos de las ventas y mermas). Con `desde` (AAAA-MM-DD), desde ese día. Exige sesión de Gerente. */
  @Get('finanzas/balance')
  @Roles('GERENTE')
  balance(@Query('desde') desde?: string): Promise<BalanceDia[]> {
    return this.resumen.balance(desde);
  }

  /** Registra una venta en la tienda, descuenta el stock y devuelve el comprobante. Exige sesión de Vendedor. */
  @Post('ventas/pos')
  @Roles('VENDEDOR')
  registrarPos(@Body() cuerpo: unknown, @UsuarioActual() vendedor: Usuario): Promise<ComprobantePos> {
    return this.pos.registrar(cuerpo, vendedor);
  }

  /** Comprobantes de las ventas POS del día: las propias del Vendedor, o todas para el Gerente. */
  @Get('ventas/pos')
  @Roles('VENDEDOR', 'GERENTE')
  ventasPos(@UsuarioActual() usuario: Usuario): Promise<ComprobantePos[]> {
    return this.pos.delDia(usuario);
  }

  /** Crea la compra, reserva las unidades e inicia el pago. Exige sesión de Cliente. */
  @Post('ventas/checkout')
  @Roles('CLIENTE')
  checkout(@Body() cuerpo: unknown, @UsuarioActual() cliente: Usuario): Promise<CheckoutResponse> {
    return this.compras.iniciar(cuerpo, cliente);
  }

  /** La caja abierta del Vendedor: sus ventas sin cerrar, por medio de pago. */
  @Get('ventas/pos/caja')
  @Roles('VENDEDOR')
  cajaAbierta(@UsuarioActual() vendedor: Usuario): Promise<CajaAbierta> {
    return this.caja.abierta(vendedor);
  }

  /** Cierra la caja del Vendedor con el efectivo contado. */
  @Post('ventas/pos/cierres')
  @Roles('VENDEDOR')
  cerrarCaja(@Body() cuerpo: unknown, @UsuarioActual() vendedor: Usuario): Promise<CierreCaja> {
    return this.caja.cerrar(cuerpo, vendedor);
  }

  /** Cierres de caja recientes y cajas abiertas, para el panel de finanzas del Gerente. */
  @Get('ventas/cierres')
  @Roles('GERENTE')
  cierres(@Query() consulta: Record<string, string | undefined>): Promise<CierresCaja> {
    return this.caja.listar(consulta);
  }

  /** Las compras de quien consulta que aún esperan su pago, de la más reciente a la más antigua. */
  @Get('ventas/pendientes')
  @Roles('CLIENTE')
  pendientes(@UsuarioActual() cliente: Usuario): Promise<CompraPendiente[]> {
    return this.compras.pendientesDe(cliente);
  }

  /**
   * Retorno desde la pasarela. Es público porque quien llega es el navegador redirigido,
   * y lo que identifica el pago es su token.
   */
  @Post('pagos/webpay/retorno')
  @Publica()
  @HttpCode(200)
  retorno(@Body() cuerpo: unknown): Promise<ResultadoPago> {
    return this.compras.resolverPago(cuerpo);
  }
}
