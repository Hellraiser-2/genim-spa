import { Controller, Get } from '@nestjs/common';
import type { CuentaInterna, PerfilUsuario, Rol, Usuario } from '@rockstar/contracts';

import { Roles, UsuarioActual } from '../auth/decoradores.js';
import { sesionInvalida } from '../comun/errores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';

@Controller('usuarios')
export class CuentasController {
  constructor(private readonly db: BaseDeDatos) {}

  /**
   * Los datos de la cuenta de quien consulta, leídos de la base: el token solo dice quién
   * es. Cualquier rol con sesión puede ver los suyos, y nadie los de otra cuenta.
   */
  @Get('yo')
  async yo(@UsuarioActual() usuario: Usuario): Promise<PerfilUsuario> {
    const [cuenta] = await this.db.consultar<Usuario & { creado_en: Date; telefono: string | null; direccion: string | null }>(
      `SELECT u.id_usuario AS id, u.nombre, u.email, r.nombre AS rol, u.creado_en, u.telefono, u.direccion
       FROM usuarios.usuarios u JOIN usuarios.roles r USING (id_rol)
       WHERE u.id_usuario = $1 AND u.activo`,
      [usuario.id],
    );
    if (!cuenta) {
      // La cuenta se desactivó mientras su token seguía vigente.
      throw sesionInvalida();
    }
    const { creado_en: creadoEn, ...datos } = cuenta;
    return { ...datos, creadoEn: creadoEn.toISOString() };
  }

  /** Cuentas del personal, sin las de clientes. */
  @Get('internos')
  @Roles('GERENTE', 'RRHH')
  internos(): Promise<CuentaInterna[]> {
    return this.db.consultar<CuentaInterna>(
      `SELECT u.id_usuario AS id, u.nombre, u.email, r.nombre AS rol, u.activo
       FROM usuarios.usuarios u JOIN usuarios.roles r USING (id_rol)
       WHERE r.nombre <> $1 ORDER BY u.nombre, u.id_usuario`,
      ['CLIENTE' satisfies Rol],
    );
  }
}
