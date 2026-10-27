import { Controller, Get, Query } from '@nestjs/common';
import type { RecomendacionesInversion } from '@rockstar/contracts';

import { Roles } from '../auth/decoradores.js';
import { RecomendacionesService } from './recomendaciones.service.js';

@Controller('analitica')
export class AnaliticaController {
  constructor(private readonly recomendaciones: RecomendacionesService) {}

  /** Modelo predictivo de inversión con las ventas de ambos canales. Solo el Gerente. */
  @Get('recomendaciones')
  @Roles('GERENTE')
  recomendar(@Query() consulta: Record<string, string | undefined>): Promise<RecomendacionesInversion> {
    return this.recomendaciones.calcular(consulta);
  }
}
