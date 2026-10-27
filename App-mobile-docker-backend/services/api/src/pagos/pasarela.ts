import { randomInt, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { RetornoPagoRequest } from '@rockstar/contracts';

/** Token de inyección de la pasarela de pago: el resto del sistema no conoce la API de Webpay. */
export const PASARELA = Symbol('PASARELA');

/** Medios con que se puede pagar en línea; coinciden con los códigos de `pagos.medios_pago`. */
export type MedioEnLinea = 'WEBPAY_DEBITO' | 'WEBPAY_CREDITO' | 'WEBPAY_PREPAGO';

export interface PagoResuelto {
  autorizado: boolean;
  medio: MedioEnLinea;
  codigoAutorizacion?: string;
  motivoRechazo?: string;
}

export interface Pasarela {
  /** Abre un pago por ese monto y entrega el token que lo identifica. */
  crear(pago: { idVenta: number; monto: number }): Promise<{ token: string }>;
  /** Pregunta cómo terminó el pago cuando el comprador vuelve de la pasarela. */
  confirmar(token: string, retorno: Partial<RetornoPagoRequest>): Promise<PagoResuelto>;
}

/**
 * Doble de Webpay para desarrollar sin credenciales de Transbank. No cobra nada: el
 * resultado lo elige quien prueba, en la pantalla de pago simulado de la tienda. Nunca
 * recibe ni guarda datos de tarjeta.
 */
@Injectable()
export class PasarelaSimulada implements Pasarela {
  async crear(): Promise<{ token: string }> {
    return { token: `SIM-${randomUUID()}` };
  }

  async confirmar(_token: string, retorno: Partial<RetornoPagoRequest>): Promise<PagoResuelto> {
    if (retorno.aprobar === false) {
      return { autorizado: false, medio: 'WEBPAY_DEBITO', motivoRechazo: 'Pago rechazado por el banco (simulado).' };
    }
    return { autorizado: true, medio: 'WEBPAY_DEBITO', codigoAutorizacion: String(randomInt(100_000, 1_000_000)) };
  }
}
