import { Module } from '@nestjs/common';

import { AnaliticaController } from './analitica.controller.js';
import { RecomendacionesService } from './recomendaciones.service.js';

/** Analítica para el Gerente: el modelo predictivo de inversión. */
@Module({
  controllers: [AnaliticaController],
  providers: [RecomendacionesService],
})
export class AnaliticaModule {}
