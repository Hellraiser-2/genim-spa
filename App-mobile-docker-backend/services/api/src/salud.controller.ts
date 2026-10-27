import { Controller, Get } from '@nestjs/common';

import { Publica } from './auth/decoradores.js';
import { BaseDeDatos } from './db/base-de-datos.js';

/** Verificación de vida para Docker y para quien despliega: responde solo si la base contesta. */
@Publica()
@Controller('salud')
export class SaludController {
  constructor(private readonly db: BaseDeDatos) {}

  @Get()
  async salud(): Promise<{ estado: 'ok' }> {
    await this.db.consultar('SELECT 1');
    return { estado: 'ok' };
  }
}
