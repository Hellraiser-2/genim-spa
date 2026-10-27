import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Rol, Usuario } from '@rockstar/contracts';

export const RUTA_PUBLICA = 'rutaPublica';
export const ROLES_PERMITIDOS = 'rolesPermitidos';

/** Solicitud con el usuario que el guard de sesión dejó autenticado. */
export interface SolicitudConUsuario {
  headers: Record<string, string | string[] | undefined>;
  usuario?: Usuario;
}

/** Ruta que no exige sesión, como el inicio de sesión. */
export const Publica = () => SetMetadata(RUTA_PUBLICA, true);

/** Roles que pueden usar la ruta o el controlador, según la matriz de permisos del diseño. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_PERMITIDOS, roles);

/** El usuario autenticado de la solicitud. */
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext): Usuario => {
  return contexto.switchToHttp().getRequest<SolicitudConUsuario>().usuario!;
});
