import { Injectable } from '@nestjs/common';
import type {
  AjusteRequest,
  IngresoRequest,
  MermaRequest,
  ResultadoMovimientos,
  TipoMerma,
  TraspasoRequest,
  Ubicacion,
  Usuario,
} from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, esEnteroPositivo, exigir, texto } from '../comun/errores.js';
import { type Saldo, StockService, totalDe } from './stock.service.js';
import { esUbicacion } from './ubicaciones.js';

const TIPOS_MERMA: readonly unknown[] = ['DANADO', 'MUESTRA', 'CAMBIO'] satisfies TipoMerma[];

function validarUbicacion(ubicacion: unknown): asserts ubicacion is Ubicacion {
  exigir(esUbicacion(ubicacion), 'La ubicación no es válida.');
}

function motivoObligatorio(motivo: unknown): string {
  const limpio = texto(motivo);
  exigir(limpio !== '', 'El motivo es obligatorio.');
  return limpio;
}

function exigirExistencia(saldo: Saldo, ubicacion: Ubicacion, cantidad: number): void {
  if (saldo.existencias[ubicacion] < cantidad) {
    throw new ErrorDeNegocio(409, 'STOCK_INSUFICIENTE', 'No hay existencia suficiente en la ubicación.');
  }
}

/** Las unidades comprometidas en pedidos no se pueden dar de baja: el total no puede quedar bajo lo reservado. */
function exigirSinTocarReservas(saldo: Saldo, totalResultante: number): void {
  if (totalResultante < saldo.reservado) {
    throw new ErrorDeNegocio(409, 'UNIDADES_RESERVADAS', 'Hay unidades comprometidas en pedidos.');
  }
}

/** Ingresos, mermas, traspasos y ajustes por conteo. Cada uno deja su movimiento con motivo y usuario. */
@Injectable()
export class MovimientosService {
  constructor(private readonly stock: StockService) {}

  ingreso(cuerpo: unknown, usuario: Usuario): Promise<ResultadoMovimientos> {
    const datos = cuerpoComo<IngresoRequest>(cuerpo);
    return this.stock.unaVez(
      'INGRESO',
      datos.claveIdempotencia,
      usuario,
      async (tx, clave) => {
        const { ubicacion, lineas } = datos;
        validarUbicacion(ubicacion);
        exigir(Array.isArray(lineas) && lineas.length > 0, 'El ingreso no tiene productos.');
        // Se valida todo antes de aplicar nada: el ingreso se registra completo o no se registra.
        for (const linea of lineas as unknown[]) {
          exigir(
            typeof linea === 'object' && linea !== null && esEnteroPositivo((linea as { cantidad?: unknown }).cantidad),
            'La cantidad debe ser un entero mayor que cero.',
          );
        }
        await this.stock.bloquear(tx, lineas.map((linea) => linea.idVariante));
        const motivo = texto(datos.motivo) || 'Ingreso de mercadería';
        for (const { idVariante, cantidad } of lineas) {
          await this.stock.sumar(tx, idVariante, ubicacion, cantidad);
          await this.stock.registrar(tx, clave, usuario, { idVariante, tipo: 'INGRESO', ubicacion, cantidad, motivo });
        }
      },
      (tx, clave) => this.stock.resultadoDeOperacion(tx, clave),
    );
  }

  merma(cuerpo: unknown, usuario: Usuario): Promise<ResultadoMovimientos> {
    const datos = cuerpoComo<MermaRequest>(cuerpo);
    return this.stock.unaVez(
      'MERMA',
      datos.claveIdempotencia,
      usuario,
      async (tx, clave) => {
        const { ubicacion, tipoMerma, cantidad } = datos;
        validarUbicacion(ubicacion);
        exigir(TIPOS_MERMA.includes(tipoMerma), 'El tipo de merma no es válido.');
        exigir(esEnteroPositivo(cantidad), 'La cantidad debe ser un entero mayor que cero.');
        const motivo = motivoObligatorio(datos.motivo);
        const idVariante = datos.idVariante as number;
        const saldo = (await this.stock.bloquear(tx, [idVariante])).get(idVariante)!;
        exigirExistencia(saldo, ubicacion, cantidad);
        exigirSinTocarReservas(saldo, totalDe(saldo) - cantidad);

        await this.stock.sumar(tx, idVariante, ubicacion, -cantidad);
        await this.stock.registrar(tx, clave, usuario, { idVariante, tipo: 'MERMA', tipoMerma, ubicacion, cantidad, motivo });
      },
      (tx, clave) => this.stock.resultadoDeOperacion(tx, clave),
    );
  }

  traspaso(cuerpo: unknown, usuario: Usuario): Promise<ResultadoMovimientos> {
    const datos = cuerpoComo<TraspasoRequest>(cuerpo);
    return this.stock.unaVez(
      'TRASPASO',
      datos.claveIdempotencia,
      usuario,
      async (tx, clave) => {
        const { origen, destino, cantidad } = datos;
        validarUbicacion(origen);
        validarUbicacion(destino);
        exigir(origen !== destino, 'El origen y el destino deben ser distintos.');
        exigir(esEnteroPositivo(cantidad), 'La cantidad debe ser un entero mayor que cero.');
        const motivo = motivoObligatorio(datos.motivo);
        const idVariante = datos.idVariante as number;
        const saldo = (await this.stock.bloquear(tx, [idVariante])).get(idVariante)!;
        exigirExistencia(saldo, origen, cantidad);

        await this.stock.sumar(tx, idVariante, origen, -cantidad);
        await this.stock.sumar(tx, idVariante, destino, cantidad);
        await this.stock.registrar(tx, clave, usuario, {
          idVariante,
          tipo: 'TRASPASO',
          ubicacion: origen,
          ubicacionDestino: destino,
          cantidad,
          motivo,
        });
      },
      (tx, clave) => this.stock.resultadoDeOperacion(tx, clave),
    );
  }

  /** Deja la existencia de la ubicación en lo contado y registra la diferencia, que puede ser negativa o cero. */
  ajuste(cuerpo: unknown, usuario: Usuario): Promise<ResultadoMovimientos> {
    const datos = cuerpoComo<AjusteRequest>(cuerpo);
    return this.stock.unaVez(
      'AJUSTE',
      datos.claveIdempotencia,
      usuario,
      async (tx, clave) => {
        const { ubicacion, cantidadContada } = datos;
        validarUbicacion(ubicacion);
        exigir(
          typeof cantidadContada === 'number' && Number.isInteger(cantidadContada) && cantidadContada >= 0,
          'La cantidad contada debe ser un entero mayor o igual a cero.',
        );
        const motivo = motivoObligatorio(datos.motivo);
        const idVariante = datos.idVariante as number;
        const saldo = (await this.stock.bloquear(tx, [idVariante])).get(idVariante)!;
        const enSistema = saldo.existencias[ubicacion];
        const diferencia = cantidadContada - enSistema;
        exigirSinTocarReservas(saldo, totalDe(saldo) + diferencia);

        await this.stock.sumar(tx, idVariante, ubicacion, diferencia);
        await this.stock.registrar(tx, clave, usuario, { idVariante, tipo: 'AJUSTE', ubicacion, cantidad: diferencia, motivo });
        // El conteo queda guardado con lo que decía el sistema, para medir la exactitud del inventario.
        await tx.consultar(
          `INSERT INTO inventario.conteos (id_variante, id_ubicacion, cantidad_sistema, cantidad_contada, id_usuario)
           VALUES ($1, (SELECT id_ubicacion FROM inventario.ubicaciones WHERE nombre = $2), $3, $4, $5)`,
          [idVariante, ubicacion, enSistema, cantidadContada, usuario.id],
        );
      },
      (tx, clave) => this.stock.resultadoDeOperacion(tx, clave),
    );
  }
}
