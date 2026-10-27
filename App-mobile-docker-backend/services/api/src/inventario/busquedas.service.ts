import { Injectable } from '@nestjs/common';
import type { Busqueda, BusquedaRequest, CierreBusquedaRequest, Usuario } from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, exigir, noEncontrado } from '../comun/errores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';

interface FilaBusqueda {
  id_busqueda: number;
  id_variante: number;
  inicio: Date;
  fin: Date | null;
}

function aBusqueda(fila: FilaBusqueda): Busqueda {
  return {
    idBusqueda: fila.id_busqueda,
    idVariante: fila.id_variante,
    inicio: fila.inicio.toISOString(),
    ...(fila.fin
      ? { fin: fila.fin.toISOString(), duracionSegundos: Math.round((fila.fin.getTime() - fila.inicio.getTime()) / 1000) }
      : {}),
  };
}

/** Mide cuánto toma ubicar una prenda en la bodega: el indicador de tiempo de búsqueda. */
@Injectable()
export class BusquedasService {
  constructor(private readonly db: BaseDeDatos) {}

  async iniciar(cuerpo: unknown, usuario: Usuario): Promise<Busqueda> {
    const { idVariante } = cuerpoComo<BusquedaRequest>(cuerpo);
    const [variante] = Number.isInteger(idVariante)
      ? await this.db.consultar<{ activo: boolean }>(
          `SELECT (v.activo AND p.activo) AS activo
           FROM inventario.variantes v JOIN inventario.productos p ON p.id_producto = v.id_producto
           WHERE v.id_variante = $1`,
          [idVariante],
        )
      : [];
    if (!variante) {
      throw noEncontrado('La variante no existe.');
    }
    if (!variante.activo) {
      throw new ErrorDeNegocio(409, 'VARIANTE_INACTIVA', 'El producto está desactivado.');
    }
    const [fila] = await this.db.consultar<FilaBusqueda>(
      `INSERT INTO inventario.busquedas (id_variante, id_usuario) VALUES ($1, $2)
       RETURNING id_busqueda, id_variante, inicio, fin`,
      [idVariante, usuario.id],
    );
    return aBusqueda(fila!);
  }

  /** Cierra la búsqueda. Solo una prenda encontrada registra duración; una cancelada queda sin fin. */
  async cerrar(idBusqueda: number, cuerpo: unknown): Promise<Busqueda> {
    const { resultado } = cuerpoComo<CierreBusquedaRequest>(cuerpo);
    exigir(resultado === 'ENCONTRADA' || resultado === 'CANCELADA', 'El resultado no es válido.');
    const [fila] = await this.db.consultar<FilaBusqueda>(
      `UPDATE inventario.busquedas
       SET fin = CASE WHEN $2 AND fin IS NULL THEN now() ELSE fin END
       WHERE id_busqueda = $1
       RETURNING id_busqueda, id_variante, inicio, fin`,
      [idBusqueda, resultado === 'ENCONTRADA'],
    );
    if (!fila) {
      throw noEncontrado('La búsqueda no existe.');
    }
    return aBusqueda(fila);
  }
}
