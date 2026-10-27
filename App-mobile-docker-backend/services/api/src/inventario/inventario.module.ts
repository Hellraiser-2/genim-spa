import { Module } from '@nestjs/common';

import { BandasService } from './bandas.service.js';
import { BusquedasService } from './busquedas.service.js';
import { CatalogosService } from './catalogos.service.js';
import { InventarioController } from './inventario.controller.js';
import { MovimientosService } from './movimientos.service.js';
import { ProductosService } from './productos.service.js';
import { StockService } from './stock.service.js';

@Module({
  controllers: [InventarioController],
  providers: [BandasService, BusquedasService, CatalogosService, MovimientosService, ProductosService, StockService],
  // Logística descuenta el stock al despachar un pedido.
  exports: [StockService],
})
export class InventarioModule {}
