import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { EstadoAsesor, Recomendaciones, RespuestaAsesor } from '@rockstar/contracts';

import { Roles } from '../auth/decoradores.js';
import { AsesorService } from './asesor.service.js';

/**
 * Asesor de inversión. Es del Gerente, porque lee las ventas y los costos de la tienda.
 * Las recomendaciones se calculan con reglas y son gratuitas; el chat es opcional y usa
 * un servicio de IA que se paga por uso.
 */
@Controller('asesor')
export class AsesorController {
  constructor(private readonly asesor: AsesorService) {}

  /** En qué bandas y tipos de producto conviene invertir, con los datos del momento. */
  @Get('recomendaciones')
  @Roles('GERENTE')
  recomendaciones(): Promise<Recomendaciones> {
    return this.asesor.recomendaciones();
  }

  /** Indica si el chat con IA tiene su credencial; sin ella, el panel no lo muestra. */
  @Get('estado')
  @Roles('GERENTE')
  estado(): EstadoAsesor {
    return this.asesor.estado();
  }

  /** Recibe la conversación completa y responde el turno siguiente del asesor. */
  @Post('consultas')
  @Roles('GERENTE')
  @HttpCode(200)
  consultar(@Body() cuerpo: unknown): Promise<RespuestaAsesor> {
    return this.asesor.consultar(cuerpo);
  }
}
