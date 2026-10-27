export type Rol = 'CLIENTE' | 'VENDEDOR' | 'BODEGA' | 'GERENTE' | 'RRHH';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

/** POST /usuarios/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Respuesta de login y de refresh. */
export interface SesionResponse {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

/** POST /usuarios/auth/refresh y /logout */
export interface RefreshRequest {
  refreshToken: string;
}

/**
 * POST /usuarios/auth/registro (público)
 *
 * Crea una cuenta de Cliente y responde su sesión ya iniciada. La contraseña debe tener
 * al menos 8 caracteres. Un correo ya registrado responde `409 EMAIL_EN_USO`.
 */
export interface RegistroRequest {
  nombre: string;
  email: string;
  password: string;
  /**
   * Teléfono chileno: el prefijo +56 y nueve dígitos. Se aceptan espacios y guiones, y el
   * prefijo puede omitirse; se guarda siempre como `+56912345678`.
   */
  telefono: string;
  direccion: string;
}

/** Cuenta del personal. GET /usuarios/internos (Gerente, RRHH) */
export interface CuentaInterna extends Usuario {
  activo: boolean;
}

/** Datos de la cuenta de quien consulta. GET /usuarios/yo (cualquier sesión) */
export interface PerfilUsuario extends Usuario {
  /** Cuándo se creó la cuenta. */
  creadoEn: string;
  /** Teléfono con su prefijo, por ejemplo `+56912345678`; `null` en las cuentas que no lo registraron. */
  telefono: string | null;
  direccion: string | null;
}
