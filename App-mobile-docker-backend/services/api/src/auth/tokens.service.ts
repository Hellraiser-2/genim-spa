import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Rol, Usuario } from '@rockstar/contracts';
import jwt from 'jsonwebtoken';

import { CONFIGURACION, type Configuracion } from '../config.js';

const ROLES: readonly Rol[] = ['CLIENTE', 'VENDEDOR', 'BODEGA', 'GERENTE', 'RRHH'];
const EMISOR = 'rockstar';

/** Vigencia del token de acceso. Es corta porque no se puede revocar; lo que se revoca es el de refresco. */
export const SEGUNDOS_ACCESO = 15 * 60;
export const DIAS_REFRESCO = 7;

interface ParDeClaves {
  privada: string;
  publica: string;
}

/**
 * Par de claves RS256. Se toma de las variables de entorno o de la carpeta de claves; si
 * no existe, se genera y se guarda ahí, de modo que las sesiones sobrevivan a un reinicio.
 */
function cargarClaves(configuracion: Configuracion, log: Logger): ParDeClaves {
  if (configuracion.clavePrivada && configuracion.clavePublica) {
    return { privada: configuracion.clavePrivada, publica: configuracion.clavePublica };
  }
  const rutaPrivada = join(configuracion.directorioClaves, 'jwt-privada.pem');
  const rutaPublica = join(configuracion.directorioClaves, 'jwt-publica.pem');
  if (existsSync(rutaPrivada) && existsSync(rutaPublica)) {
    return { privada: readFileSync(rutaPrivada, 'utf8'), publica: readFileSync(rutaPublica, 'utf8') };
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  mkdirSync(configuracion.directorioClaves, { recursive: true });
  writeFileSync(rutaPrivada, privateKey, { mode: 0o600 });
  writeFileSync(rutaPublica, publicKey);
  log.log(`Se generó un par de claves nuevo en ${configuracion.directorioClaves}`);
  return { privada: privateKey, publica: publicKey };
}

@Injectable()
export class TokensService {
  private readonly claves: ParDeClaves;

  constructor(@Inject(CONFIGURACION) configuracion: Configuracion) {
    this.claves = cargarClaves(configuracion, new Logger('Tokens'));
  }

  /** Token de acceso JWT firmado con RS256, con los datos del usuario que necesitan los guards. */
  emitirAcceso(usuario: Usuario): string {
    const { id, ...datos } = usuario;
    return jwt.sign(datos, this.claves.privada, {
      algorithm: 'RS256',
      subject: String(id),
      issuer: EMISOR,
      expiresIn: SEGUNDOS_ACCESO,
    });
  }

  /** Usuario de un token de acceso vigente y bien firmado, o `null` en cualquier otro caso. */
  verificarAcceso(token: string): Usuario | null {
    try {
      // Fijar el algoritmo impide que un token firmado de otra forma sea aceptado.
      const datos = jwt.verify(token, this.claves.publica, { algorithms: ['RS256'], issuer: EMISOR });
      if (typeof datos === 'string') {
        return null;
      }
      const id = Number(datos.sub);
      const { nombre, email, rol } = datos as { nombre?: unknown; email?: unknown; rol?: unknown };
      if (!Number.isInteger(id) || typeof nombre !== 'string' || typeof email !== 'string' || !ROLES.includes(rol as Rol)) {
        return null;
      }
      return { id, nombre, email, rol: rol as Rol };
    } catch {
      return null;
    }
  }

  /** Token de refresco: un valor aleatorio sin significado, que solo sirve contra la tabla de sesiones. */
  nuevoRefresco(): string {
    return randomBytes(48).toString('base64url');
  }

  /** Huella con que se guarda y se busca un token de refresco. */
  huella(tokenDeRefresco: string): string {
    return createHash('sha256').update(tokenDeRefresco).digest('hex');
  }
}
