import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CotizacionFlete } from '@rockstar/contracts';

import { ErrorDeNegocio, datosInvalidos } from '../comun/errores.js';
import type { Ejecutor } from '../db/base-de-datos.js';
import { type DestinoDeFlete, TRANSPORTISTA, type Transportista } from './transportista.js';

/** Cotización del flete a una comuna. La usan la tienda, para mostrarlo, y el checkout, para cobrarlo. */
@Injectable()
export class FletesService {
  private readonly log = new Logger('Fletes');

  constructor(@Inject(TRANSPORTISTA) private readonly transportista: Transportista) {}

  async cotizar(ejecutor: Ejecutor, idComuna: unknown): Promise<CotizacionFlete> {
    const [destino] = Number.isInteger(idComuna)
      ? await ejecutor.consultar<DestinoDeFlete>(
          `SELECT co.nombre AS comuna, re.nombre AS region, co.zona
           FROM logistica.comunas co JOIN logistica.regiones re ON re.id_region = co.id_region
           WHERE co.id_comuna = $1`,
          [idComuna],
        )
      : [];
    if (!destino) {
      throw datosInvalidos('La comuna no existe.');
    }
    try {
      return { idComuna: idComuna as number, valor: await this.transportista.cotizar(destino) };
    } catch (error) {
      this.log.warn(`No se pudo cotizar el flete a ${destino.comuna}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ErrorDeNegocio(503, 'TRANSPORTISTA_NO_DISPONIBLE', 'No se pudo calcular el despacho. Reintenta en unos minutos.');
    }
  }
}
