import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { LoginRequest, RefreshRequest, RegistroRequest, Rol, SesionResponse, Usuario } from '@rockstar/contracts';

import { DIAS_REFRESCO, TokensService } from '../auth/tokens.service.js';
import { ErrorDeNegocio, cuerpoComo, exigir, sesionInvalida, texto } from '../comun/errores.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';

interface FilaUsuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  hash_contrasena: string;
}

const SELECCION_USUARIO = `
  SELECT u.id_usuario AS id, u.nombre, u.email, r.nombre AS rol, u.activo, u.hash_contrasena
  FROM usuarios.usuarios u
  JOIN usuarios.roles r USING (id_rol)`;

const credencialesInvalidas = () => new ErrorDeNegocio(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña no válidos.');

const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LARGO_MINIMO_CONTRASENA = 8;
const LARGO_MAXIMO_DIRECCION = 200;
const PREFIJO_CHILE = '+56';

/**
 * Deja un teléfono chileno como `+56912345678`: los números de Chile, fijos y móviles,
 * tienen nueve dígitos después del prefijo. Acepta espacios, guiones y paréntesis, con o
 * sin el prefijo. Devuelve `null` si lo escrito no es un número chileno completo.
 */
function telefonoChileno(valor: unknown): string | null {
  const escrito = texto(valor).replace(/[\s\-()]/g, '');
  const digitos = escrito.replace(/^\+?56(?=\d{9}$)/, '');
  return /^\d{9}$/.test(digitos) ? `${PREFIJO_CHILE}${digitos}` : null;
}

@Injectable()
export class AuthService {
  /** Hash de una contraseña cualquiera, para gastar el mismo tiempo cuando el correo no existe. */
  private readonly hashDeRelleno = hash('contraseña-inexistente');

  constructor(
    private readonly db: BaseDeDatos,
    private readonly tokens: TokensService,
  ) {}

  async iniciar(cuerpo: unknown): Promise<SesionResponse> {
    const { email, password } = cuerpoComo<LoginRequest>(cuerpo);
    const correo = texto(email).toLowerCase();
    const [cuenta] = await this.db.consultar<FilaUsuario>(`${SELECCION_USUARIO} WHERE u.email = $1`, [correo]);

    // La contraseña se verifica siempre, exista o no la cuenta, para que el tiempo de
    // respuesta no revele qué correos están registrados.
    const coincide = await verify(cuenta?.hash_contrasena ?? (await this.hashDeRelleno), typeof password === 'string' ? password : '');
    if (!cuenta || !coincide || !cuenta.activo) {
      throw credencialesInvalidas();
    }
    return this.emitirSesion(this.db, cuenta);
  }

  /** Registro público: la cuenta creada siempre es de Cliente. Las del personal las crea el Gerente. */
  async registrar(cuerpo: unknown): Promise<SesionResponse> {
    const datos = cuerpoComo<RegistroRequest>(cuerpo);
    const nombre = texto(datos.nombre);
    const correo = texto(datos.email).toLowerCase();
    const password = typeof datos.password === 'string' ? datos.password : '';
    exigir(nombre !== '', 'El nombre es obligatorio.');
    exigir(FORMA_DE_CORREO.test(correo), 'El correo no es válido.');
    exigir(password.length >= LARGO_MINIMO_CONTRASENA, `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`);
    const telefono = telefonoChileno(datos.telefono);
    exigir(telefono !== null, `El teléfono debe ser un número chileno: ${PREFIJO_CHILE} y 9 dígitos.`);
    const direccion = texto(datos.direccion);
    exigir(direccion !== '', 'La dirección es obligatoria.');
    exigir(direccion.length <= LARGO_MAXIMO_DIRECCION, `La dirección puede tener hasta ${LARGO_MAXIMO_DIRECCION} caracteres.`);

    const hashContrasena = await hash(password);
    return this.db.transaccion(async (tx) => {
      const [creada] = await tx.consultar<{ id: number }>(
        `INSERT INTO usuarios.usuarios (nombre, email, hash_contrasena, id_rol, telefono, direccion)
         VALUES ($1, $2, $3, (SELECT id_rol FROM usuarios.roles WHERE nombre = 'CLIENTE'), $4, $5)
         ON CONFLICT (email) DO NOTHING RETURNING id_usuario AS id`,
        [nombre, correo, hashContrasena, telefono, direccion],
      );
      if (!creada) {
        throw new ErrorDeNegocio(409, 'EMAIL_EN_USO', 'Ya existe una cuenta con ese correo.');
      }
      const [cuenta] = await tx.consultar<FilaUsuario>(`${SELECCION_USUARIO} WHERE u.id_usuario = $1`, [creada.id]);
      return this.emitirSesion(tx, cuenta!);
    });
  }

  /** Cambia un token de refresco vigente por una sesión nueva. El token usado deja de servir. */
  async refrescar(cuerpo: unknown): Promise<SesionResponse> {
    const huella = this.huellaDe(cuerpo);
    return this.db.transaccion(async (tx) => {
      const [sesion] = await tx.consultar<{ id_usuario: number }>(
        `UPDATE usuarios.sesiones SET revocada = true
         WHERE hash_token_refresco = $1 AND NOT revocada AND expira_en > now()
         RETURNING id_usuario`,
        [huella],
      );
      const [cuenta] = sesion
        ? await tx.consultar<FilaUsuario>(`${SELECCION_USUARIO} WHERE u.id_usuario = $1 AND u.activo`, [sesion.id_usuario])
        : [];
      if (!cuenta) {
        throw sesionInvalida();
      }
      return this.emitirSesion(tx, cuenta);
    });
  }

  async cerrar(cuerpo: unknown): Promise<void> {
    await this.db.consultar('UPDATE usuarios.sesiones SET revocada = true WHERE hash_token_refresco = $1', [
      this.huellaDe(cuerpo),
    ]);
  }

  private huellaDe(cuerpo: unknown): string {
    return this.tokens.huella(texto(cuerpoComo<RefreshRequest>(cuerpo).refreshToken));
  }

  private async emitirSesion(ejecutor: Ejecutor, cuenta: FilaUsuario): Promise<SesionResponse> {
    const usuario: Usuario = { id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, rol: cuenta.rol };
    const refreshToken = this.tokens.nuevoRefresco();
    await ejecutor.consultar(
      `INSERT INTO usuarios.sesiones (id_usuario, hash_token_refresco, expira_en)
       VALUES ($1, $2, now() + make_interval(days => $3))`,
      [usuario.id, this.tokens.huella(refreshToken), DIAS_REFRESCO],
    );
    return { accessToken: this.tokens.emitirAcceso(usuario), refreshToken, usuario };
  }
}
