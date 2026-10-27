import type { EstadoPedido, LineaPedido, LineaPedidoCliente, Pedido, PedidoCliente } from '@rockstar/contracts';

import type { Ejecutor } from '../db/base-de-datos.js';

interface FilaPedido {
  id_pedido: number;
  id_venta: number;
  estado: EstadoPedido;
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
  lineas: LineaPedido[];
  pagado_en: Date;
  despachado_en: Date | null;
  entregado_en: Date | null;
  tracking_starken: string | null;
}

interface FilaPedidoCliente extends FilaPedido {
  lineas: LineaPedidoCliente[];
  flete_cobrado: number;
  total: number;
}

const DE_PEDIDOS = `
  FROM logistica.pedidos pe
  JOIN logistica.estados_pedido es ON es.id_estado = pe.id_estado
  JOIN logistica.comunas co ON co.id_comuna = pe.id_comuna
  JOIN logistica.regiones re ON re.id_region = co.id_region`;

/** Columnas del pedido y sus líneas; `conPrecio` agrega a cada línea lo que se pagó por unidad. */
function seleccionDePedido(conPrecio: boolean): string {
  const precio = conPrecio ? ", 'precioUnitario', d.precio_unitario" : '';
  return `
    SELECT pe.id_pedido, pe.id_venta, es.codigo AS estado, pe.destinatario, pe.direccion,
           co.nombre AS comuna, re.nombre AS region, pe.pagado_en, pe.despachado_en, pe.entregado_en,
           pe.tracking_starken,
           COALESCE((
             SELECT json_agg(json_build_object(
                      'idVariante', v.id_variante, 'sku', v.sku, 'producto', p.nombre,
                      'talla', t.nombre, 'color', c.nombre, 'cantidad', d.cantidad${precio}) ORDER BY d.id_detalle)
             FROM ventas.detalle_venta d
             JOIN inventario.variantes v ON v.id_variante = d.id_variante
             JOIN inventario.productos p ON p.id_producto = v.id_producto
             JOIN inventario.tallas t ON t.id_talla = v.id_talla
             JOIN inventario.colores c ON c.id_color = v.id_color
             WHERE d.id_venta = pe.id_venta), '[]'::json) AS lineas`;
}

function aPedido(fila: FilaPedido): Pedido {
  return {
    idPedido: fila.id_pedido,
    idVenta: fila.id_venta,
    estado: fila.estado,
    destinatario: fila.destinatario,
    direccion: fila.direccion,
    comuna: fila.comuna,
    region: fila.region,
    lineas: fila.lineas,
    pagadoEn: fila.pagado_en.toISOString(),
    ...(fila.despachado_en ? { despachadoEn: fila.despachado_en.toISOString() } : {}),
    ...(fila.entregado_en ? { entregadoEn: fila.entregado_en.toISOString() } : {}),
    ...(fila.tracking_starken ? { trackingStarken: fila.tracking_starken } : {}),
  };
}

/**
 * Pedidos con su destino y sus líneas, ordenados por identificador. `condicion` es un
 * `WHERE` sobre los alias de la selección (`pe`, `es`, `co`, `re`) con sus parámetros.
 */
export async function pedidosConLineas(ejecutor: Ejecutor, condicion = '', parametros: unknown[] = []): Promise<Pedido[]> {
  const filas = await ejecutor.consultar<FilaPedido>(
    `${seleccionDePedido(false)} ${DE_PEDIDOS} ${condicion} ORDER BY pe.id_pedido`,
    parametros,
  );
  return filas.map(aPedido);
}

/** Los pedidos de un cliente con lo que pagó, del más reciente al más antiguo. */
export async function pedidosDeCliente(ejecutor: Ejecutor, idCliente: number): Promise<PedidoCliente[]> {
  const filas = await ejecutor.consultar<FilaPedidoCliente>(
    `${seleccionDePedido(true)}, pe.flete_cobrado, ve.total
     ${DE_PEDIDOS}
     JOIN ventas.ventas ve ON ve.id_venta = pe.id_venta
     WHERE ve.id_cliente = $1
     ORDER BY pe.id_pedido DESC`,
    [idCliente],
  );
  return filas.map((fila) => ({ ...aPedido(fila), lineas: fila.lineas, flete: fila.flete_cobrado, total: fila.total }));
}
