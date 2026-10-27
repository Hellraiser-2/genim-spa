import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { Pedido, PedidoCliente, Usuario } from '@rockstar/contracts';

import { Roles, UsuarioActual } from '../auth/decoradores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { pedidosConLineas, pedidosDeCliente } from './consultas.js';
import { DespachosService } from './despachos.service.js';

@Controller('logistica')
export class PedidosController {
  constructor(
    private readonly db: BaseDeDatos,
    private readonly despachos: DespachosService,
  ) {}

  /** Pedidos del e-commerce tal como los ve el personal, con sus líneas. `estado` limita la lista a uno. */
  @Get('pedidos')
  @Roles('VENDEDOR', 'BODEGA', 'GERENTE')
  pedidos(@Query('estado') estado?: string): Promise<Pedido[]> {
    return pedidosConLineas(this.db, 'WHERE $1::text IS NULL OR es.codigo = $1', [
      typeof estado === 'string' && estado !== '' ? estado : null,
    ]);
  }

  /** Los pedidos de quien consulta, con su estado y, si ya se despacharon, el código de seguimiento. */
  @Get('pedidos/mios')
  @Roles('CLIENTE')
  mios(@UsuarioActual() usuario: Usuario): Promise<PedidoCliente[]> {
    return pedidosDeCliente(this.db, usuario.id);
  }

  /**
   * Genera el despacho de un pedido y responde el pedido con su código de seguimiento.
   * Repetirlo no crea otro despacho: responde el que ya existe.
   *
   * La matriz del diseño lo reserva al Vendedor. Bodega también puede mientras su app
   * sea la única pantalla donde el personal ve los envíos.
   */
  @Post('pedidos/:id/despacho')
  @HttpCode(200)
  @Roles('VENDEDOR', 'BODEGA')
  generarDespacho(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: Usuario): Promise<Pedido> {
    return this.despachos.generar(id, usuario);
  }
}
