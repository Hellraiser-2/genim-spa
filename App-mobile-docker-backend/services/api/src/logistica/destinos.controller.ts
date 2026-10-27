import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { Comuna, CotizacionFlete, CotizacionFleteRequest, Region } from '@rockstar/contracts';

import { Publica } from '../auth/decoradores.js';
import { cuerpoComo } from '../comun/errores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { FletesService } from './fletes.service.js';

/** Destinos de despacho y valor del flete. Son públicos: la tienda los muestra antes de pedir sesión. */
@Publica()
@Controller('logistica')
export class DestinosController {
  constructor(
    private readonly db: BaseDeDatos,
    private readonly fletes: FletesService,
  ) {}

  /** Las regiones de norte a sur, que es el orden de su identificador. */
  @Get('regiones')
  regiones(): Promise<Region[]> {
    return this.db.consultar<Region>('SELECT id_region AS "idRegion", nombre FROM logistica.regiones ORDER BY id_region');
  }

  /** Comunas de una región, en orden alfabético. */
  @Get('comunas')
  async comunas(@Query('region') region?: string): Promise<Comuna[]> {
    const idRegion = Number(region);
    const comunas = await this.db.consultar<Comuna>('SELECT id_comuna AS "idComuna", nombre FROM logistica.comunas WHERE id_region = $1', [
      Number.isInteger(idRegion) ? idRegion : null,
    ]);
    // El orden de la base depende de su configuración regional; en español la Ñ va después de la N.
    return comunas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  @Post('fletes/cotizar')
  @HttpCode(200)
  cotizar(@Body() cuerpo: unknown): Promise<CotizacionFlete> {
    return this.fletes.cotizar(this.db, cuerpoComo<CotizacionFleteRequest>(cuerpo).idComuna);
  }
}
