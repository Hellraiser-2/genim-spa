import { fileURLToPath } from 'node:url';

/** Token de inyección de la configuración. */
export const CONFIGURACION = Symbol('CONFIGURACION');

export interface Configuracion {
  puerto: number;
  /** Cadena de conexión a PostgreSQL, por ejemplo `postgres://usuario:clave@db:5432/rockstar`. */
  databaseUrl: string;
  /** Conexiones simultáneas a la base. */
  poolMax: number;
  /** Carpeta con los archivos `.sql` de migración, aplicados en orden alfabético. */
  directorioMigraciones: string;
  /** Carpeta donde se guarda el par de claves con que se firman los tokens. */
  directorioClaves: string;
  /** Claves en formato PEM entregadas por variables de entorno; tienen prioridad sobre la carpeta. */
  clavePrivada?: string;
  clavePublica?: string;
  /** Orígenes que pueden llamar a la API desde un navegador; `true` acepta cualquiera. */
  origenesCors: string[] | true;
  /** Carga cuentas, productos y pedidos de demostración si la base está vacía. */
  sembrarDemo: boolean;
  /**
   * Hay una credencial del servicio de IA para el asesor de inversión. La credencial
   * misma no se guarda aquí: el SDK la lee de `ANTHROPIC_API_KEY` o `ANTHROPIC_AUTH_TOKEN`.
   */
  asesorConfigurado: boolean;
  /** Dirección de la API pública de Deezer, de donde sale la popularidad de las bandas. */
  deezerUrl: string;
}

const VERDADERO = new Set(['1', 'true', 'si', 'sí', 'yes']);

function entero(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim() === '') {
    return porDefecto;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`La variable ${nombre} debe ser un entero mayor que cero.`);
  }
  return numero;
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  const databaseUrl = env['DATABASE_URL']?.trim();
  if (!databaseUrl) {
    throw new Error('Falta la variable DATABASE_URL con la conexión a PostgreSQL.');
  }
  const origenes = (env['CORS_ORIGENES'] ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');

  return {
    puerto: entero(env['PUERTO'], 3000, 'PUERTO'),
    databaseUrl,
    poolMax: entero(env['DB_POOL_MAX'], 10, 'DB_POOL_MAX'),
    // Por defecto, la carpeta `db/migrations` de la raíz del repositorio, vista desde `dist/services/api/src`.
    directorioMigraciones:
      env['MIGRACIONES_DIR']?.trim() || fileURLToPath(new URL('../../../../../../db/migrations', import.meta.url)),
    directorioClaves: env['JWT_CLAVES_DIR']?.trim() || 'claves',
    clavePrivada: env['JWT_CLAVE_PRIVADA']?.trim() || undefined,
    clavePublica: env['JWT_CLAVE_PUBLICA']?.trim() || undefined,
    origenesCors: origenes.length === 0 || origenes.includes('*') ? true : origenes,
    sembrarDemo: VERDADERO.has((env['SEMBRAR_DEMO'] ?? '').trim().toLowerCase()),
    asesorConfigurado: Boolean(env['ANTHROPIC_API_KEY']?.trim() || env['ANTHROPIC_AUTH_TOKEN']?.trim()),
    deezerUrl: (env['DEEZER_API_URL']?.trim() || 'https://api.deezer.com').replace(/\/+$/, ''),
  };
}
