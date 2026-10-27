import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Rol } from '@rockstar/contracts';

import { accesoDenegado, sesionInvalida } from '../comun/errores.js';
import { ROLES_PERMITIDOS, RUTA_PUBLICA, type SolicitudConUsuario } from './decoradores.js';
import { TokensService } from './tokens.service.js';

/**
 * Exige en toda ruta no pública un token de acceso vigente y, si la ruta declara
 * roles, que el del usuario esté entre ellos. Se registra como guard global, de modo
 * que una ruta nueva queda protegida aunque nadie se acuerde de pedirlo.
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const destinos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(RUTA_PUBLICA, destinos)) {
      return true;
    }
    const solicitud = contexto.switchToHttp().getRequest<SolicitudConUsuario>();
    const cabecera = solicitud.headers['authorization'];
    const token = typeof cabecera === 'string' ? /^Bearer (.+)$/.exec(cabecera)?.[1] : undefined;
    const usuario = token ? this.tokens.verificarAcceso(token) : null;
    if (!usuario) {
      throw sesionInvalida();
    }
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_PERMITIDOS, destinos);
    if (roles && !roles.includes(usuario.rol)) {
      throw accesoDenegado();
    }
    solicitud.usuario = usuario;
    return true;
  }
}
