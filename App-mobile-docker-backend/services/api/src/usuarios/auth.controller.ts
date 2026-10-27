import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { SesionResponse } from '@rockstar/contracts';

import { Publica } from '../auth/decoradores.js';
import { AuthService } from './auth.service.js';

/** Sesión de las cuentas. Estas rutas no exigen token de acceso: son las que lo entregan. */
@Publica()
@Controller('usuarios/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Crea una cuenta de Cliente y la deja con la sesión iniciada. */
  @Post('registro')
  registrar(@Body() cuerpo: unknown): Promise<SesionResponse> {
    return this.auth.registrar(cuerpo);
  }

  @Post('login')
  @HttpCode(200)
  iniciar(@Body() cuerpo: unknown): Promise<SesionResponse> {
    return this.auth.iniciar(cuerpo);
  }

  @Post('refresh')
  @HttpCode(200)
  refrescar(@Body() cuerpo: unknown): Promise<SesionResponse> {
    return this.auth.refrescar(cuerpo);
  }

  @Post('logout')
  @HttpCode(200)
  async cerrar(@Body() cuerpo: unknown): Promise<Record<string, never>> {
    await this.auth.cerrar(cuerpo);
    return {};
  }
}
