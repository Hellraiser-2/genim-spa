import { Inject, Injectable } from '@nestjs/common';
import type { Coordenada, EstadoPedido, ParadaReparto, PedidoSinUbicar, RutaReparto } from '@rockstar/contracts';

import { CONFIGURACION, type Configuracion } from '../config.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { MapasService, type Ubicacion } from './mapas.service.js';
import { viajeEnLineaRecta } from './rutas.js';

/** Los pedidos de la Región Metropolitana se reparten desde la bodega; los de regiones van por Starken. */
const ID_REGION_METROPOLITANA = 7;
/** Por enviar: todo lo que aún no sale de la bodega, como en la app. */
const ESTADOS_POR_ENVIAR: EstadoPedido[] = ['PAGADO', 'EN_PREPARACION', 'DESPACHO_PENDIENTE', 'ATENCION_MANUAL'];
/** Tope de paradas de una ruta: más que eso no se reparte en un día, y el servicio de rutas no lo admite. */
const MAXIMO_PARADAS = 25;

interface FilaPorRepartir {
  id_pedido: number;
  estado: EstadoPedido;
  destinatario: string;
  direccion: string;
  comuna: string;
  unidades: number;
}

/** Ruta del día para repartir desde la bodega los pedidos de la Región Metropolitana. */
@Injectable()
export class RutasService {
  constructor(
    private readonly db: BaseDeDatos,
    private readonly mapas: MapasService,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async reparto(): Promise<RutaReparto> {
    const { bodega } = this.configuracion;
    const origen: Coordenada = { lat: bodega.lat, lon: bodega.lon };

    // El más antiguo primero: si hay más pedidos que el tope, se reparten antes los que llevan más esperando.
    const pedidos = await this.db.consultar<FilaPorRepartir>(
      `SELECT pe.id_pedido, es.codigo AS estado, pe.destinatario, pe.direccion, co.nombre AS comuna,
              COALESCE((SELECT sum(d.cantidad) FROM ventas.detalle_venta d WHERE d.id_venta = pe.id_venta), 0)::int AS unidades
       FROM logistica.pedidos pe
       JOIN logistica.estados_pedido es ON es.id_estado = pe.id_estado
       JOIN logistica.comunas co ON co.id_comuna = pe.id_comuna
       WHERE co.id_region = $1 AND es.codigo = ANY($2::text[])
       ORDER BY pe.pagado_en, pe.id_pedido
       LIMIT $3`,
      [ID_REGION_METROPOLITANA, ESTADOS_POR_ENVIAR, MAXIMO_PARADAS],
    );

    // Las direcciones se buscan de a una: el servicio admite una consulta por segundo.
    const ubicados: { pedido: FilaPorRepartir; ubicacion: Ubicacion }[] = [];
    const sinUbicar: PedidoSinUbicar[] = [];
    for (const pedido of pedidos) {
      const ubicacion = await this.mapas.ubicar(pedido.direccion, pedido.comuna);
      if (ubicacion) {
        ubicados.push({ pedido, ubicacion });
      } else {
        sinUbicar.push({ idPedido: pedido.id_pedido, destinatario: pedido.destinatario, direccion: pedido.direccion, comuna: pedido.comuna });
      }
    }

    const destinos = ubicados.map((ubicado) => ubicado.ubicacion.ubicacion);
    const porCalles = destinos.length > 0 ? await this.mapas.viaje(origen, destinos) : null;
    const viaje = porCalles ?? viajeEnLineaRecta(origen, destinos);

    const paradas: ParadaReparto[] = viaje.orden.map((indice, lugar) => {
      const { pedido, ubicacion } = ubicados[indice]!;
      return {
        orden: lugar + 1,
        idPedido: pedido.id_pedido,
        estado: pedido.estado,
        destinatario: pedido.destinatario,
        direccion: pedido.direccion,
        comuna: pedido.comuna,
        unidades: pedido.unidades,
        ubicacion: ubicacion.ubicacion,
        precision: ubicacion.precision,
        distanciaTramo: viaje.tramos[lugar]!.distancia,
        duracionTramo: viaje.tramos[lugar]!.duracion,
      };
    });

    return {
      origen: { nombre: bodega.nombre, direccion: bodega.direccion, ubicacion: origen },
      paradas,
      sinUbicar,
      trazado: viaje.trazado,
      distanciaTotal: viaje.tramos.reduce((suma, tramo) => suma + tramo.distancia, 0),
      duracionTotal: viaje.tramos.reduce((suma, tramo) => suma + tramo.duracion, 0),
      calculo: porCalles || destinos.length === 0 ? 'CALLES' : 'LINEA_RECTA',
    };
  }
}
