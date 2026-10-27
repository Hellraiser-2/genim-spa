/**
 * Maquina de cobro (terminal de tarjetas) en la red de la tienda.
 *
 * El navegador de la caja le habla directo por HTTP a su IP. Hoy responde la maquina
 * simulada (`terminal-simulada/`); una maquina real se conecta con otro cliente que
 * cumpla `MaquinaDeCobro`, sin tocar el flujo de venta.
 */

import type { MedioPresencial, PagoMaquina } from './api';

export type TipoTarjeta = 'DEBITO' | 'CREDITO';
export type EstadoCobro = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'CANCELADO' | 'ANULADO';

export interface CobroMaquina {
  id: string;
  monto: number;
  tipo: TipoTarjeta;
  referencia: string | null;
  estado: EstadoCobro;
  codigoAutorizacion: string | null;
  /** Ultimos digitos, por ejemplo "•••• 4242". */
  tarjeta: string | null;
  motivo: string | null;
}

export interface InfoMaquina {
  nombre: string;
  modelo: string;
  serie: string;
}

export interface MaquinaDeCobro {
  info(): Promise<InfoMaquina>;
  cobrar(monto: number, tipo: TipoTarjeta, referencia: string): Promise<CobroMaquina>;
  consultar(id: string): Promise<CobroMaquina>;
  /** Desiste de un cobro que aun no se paga. Si ya se pago, responde el cobro aprobado. */
  cancelar(id: string): Promise<CobroMaquina>;
  /** Reversa un cobro aprobado. */
  anular(id: string): Promise<CobroMaquina>;
}

export class ErrorMaquina extends Error {
  constructor(
    mensaje: string,
    readonly codigo: 'SIN_CONEXION' | 'OCUPADA' | 'ESTADO_INVALIDO' | 'RESPUESTA_INVALIDA' | string,
    readonly cobro?: CobroMaquina,
  ) {
    super(mensaje);
  }
}

/** Configuracion de esta caja: cada caja tiene su maquina al lado. */
export interface ConfigMaquina {
  activa: boolean;
  /** IP y puerto en la red, por ejemplo "192.168.1.50:8090". */
  direccion: string;
}

const CONFIG_KEY = 'pos_maquina_cobro';
export const CONFIG_MAQUINA_INICIAL: ConfigMaquina = { activa: false, direccion: 'localhost:8090' };

export function leerConfigMaquina(): ConfigMaquina {
  try {
    const guardada = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as Partial<ConfigMaquina> | null;
    return {
      activa: guardada?.activa === true,
      direccion: typeof guardada?.direccion === 'string' && guardada.direccion.trim() ? guardada.direccion : CONFIG_MAQUINA_INICIAL.direccion,
    };
  } catch {
    return CONFIG_MAQUINA_INICIAL;
  }
}

export function guardarConfigMaquina(config: ConfigMaquina): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Sin almacenamiento la configuracion dura lo que dure la pestana.
  }
}

/** "192.168.1.50:8090", "http://192.168.1.50:8090/" o "maquina.local" -> URL base sin barra final. */
export function urlBase(direccion: string): string {
  const limpia = direccion.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(limpia) ? limpia : `http://${limpia}`;
}

/** La tarjeta de debito o credito que se pasa por la maquina; el efectivo no la usa. */
export function tipoTarjeta(medio: MedioPresencial): TipoTarjeta | null {
  if (medio === 'DEBITO_PRESENCIAL') return 'DEBITO';
  if (medio === 'CREDITO_PRESENCIAL') return 'CREDITO';
  return null;
}

/** "•••• 4242" -> "4242". La maquina muestra la tarjeta enmascarada; se guardan solo los ultimos digitos. */
export function ultimosDigitos(tarjeta: string | null): string | null {
  return tarjeta?.match(/(\d{4})\s*$/)?.[1] ?? null;
}

/** El pago aprobado tal como se envia al backend junto a la venta. */
export function pagoParaVenta(cobro: CobroMaquina): PagoMaquina {
  return { idCobro: cobro.id, codigoAutorizacion: cobro.codigoAutorizacion ?? '', ultimosDigitos: ultimosDigitos(cobro.tarjeta) };
}

const ESPERA_RESPUESTA_MS = 5000;

/** Cliente HTTP de la maquina (protocolo de `terminal-simulada/servidor.mjs`). */
export function maquinaHttp(direccion: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): MaquinaDeCobro {
  const base = urlBase(direccion);

  const pedir = async <T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> => {
    const control = new AbortController();
    const plazo = setTimeout(() => control.abort(), ESPERA_RESPUESTA_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${base}${ruta}`, {
        method: metodo,
        headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: control.signal,
        cache: 'no-store',
      });
    } catch {
      throw new ErrorMaquina(
        `No se pudo conectar con la máquina de cobro en ${base}. Revisa que esté encendida y en la misma red.`,
        'SIN_CONEXION',
      );
    } finally {
      clearTimeout(plazo);
    }
    let datos: unknown = null;
    try {
      datos = await res.json();
    } catch {
      throw new ErrorMaquina('La máquina de cobro respondió algo inesperado.', 'RESPUESTA_INVALIDA');
    }
    if (!res.ok) {
      const error = (datos ?? {}) as { codigo?: string; mensaje?: string; detalle?: CobroMaquina };
      throw new ErrorMaquina(error.mensaje ?? `La máquina respondió ${res.status}.`, error.codigo ?? String(res.status), error.detalle);
    }
    return datos as T;
  };

  return {
    info: () => pedir<InfoMaquina>('GET', '/api/estado'),
    cobrar: (monto, tipo, referencia) => pedir<CobroMaquina>('POST', '/api/cobros', { monto, tipo, referencia }),
    consultar: (id) => pedir<CobroMaquina>('GET', `/api/cobros/${encodeURIComponent(id)}`),
    cancelar: async (id) => {
      try {
        return await pedir<CobroMaquina>('POST', `/api/cobros/${encodeURIComponent(id)}/cancelar`);
      } catch (error) {
        // Se pago justo antes de cancelar: la maquina devuelve el cobro como quedo.
        if (error instanceof ErrorMaquina && error.codigo === 'ESTADO_INVALIDO' && error.cobro) return error.cobro;
        throw error;
      }
    },
    anular: (id) => pedir<CobroMaquina>('POST', `/api/cobros/${encodeURIComponent(id)}/anular`),
  };
}

/** Fallas de red seguidas que se toleran mientras se espera el pago. */
const FALLAS_TOLERADAS = 5;

/**
 * Consulta el cobro hasta que deje de estar pendiente. Un corte de red pasajero no lo
 * interrumpe; `senal` permite dejar de esperar (por ejemplo, al cancelar desde la caja).
 */
export async function esperarResultado(
  maquina: MaquinaDeCobro,
  id: string,
  { intervaloMs = 1000, senal }: { intervaloMs?: number; senal?: AbortSignal } = {},
): Promise<CobroMaquina> {
  let fallas = 0;
  for (;;) {
    if (senal?.aborted) throw new DOMException('Espera cancelada', 'AbortError');
    try {
      const cobro = await maquina.consultar(id);
      fallas = 0;
      if (cobro.estado !== 'PENDIENTE') return cobro;
    } catch (error) {
      if (!(error instanceof ErrorMaquina && error.codigo === 'SIN_CONEXION') || ++fallas > FALLAS_TOLERADAS) throw error;
    }
    await new Promise((listo) => setTimeout(listo, intervaloMs));
  }
}
