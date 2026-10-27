import { Module } from '@nestjs/common';

import { AsesorController } from './asesor.controller.js';
import { AsesorService } from './asesor.service.js';
import { PopularidadService } from './popularidad.service.js';

@Module({
  controllers: [AsesorController],
  providers: [AsesorService, PopularidadService],
})
export class AsesorModule {}
