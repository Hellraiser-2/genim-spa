import { Logger } from '@nestjs/common';
import { hash } from '@node-rs/argon2';

import { claveDe } from '../comun/texto.js';
import { ID_UBICACION, codigoDeUbicacion, codigosDeVariante, elegirZona } from '../inventario/ubicaciones.js';
import type { BaseDeDatos, Ejecutor } from './base-de-datos.js';

const ID_ROL = { CLIENTE: 1, VENDEDOR: 2, BODEGA: 3, GERENTE: 4 } as const;

/** Cuentas de demostración. Las contraseñas son públicas: no usar fuera de desarrollo. */
const CUENTAS = [
  { id: 1, nombre: 'Bodega Demo', email: 'bodega@rockstar.cl', password: 'bodega123', rol: ID_ROL.BODEGA },
  { id: 2, nombre: 'Vendedor Demo', email: 'vendedor@rockstar.cl', password: 'vendedor123', rol: ID_ROL.VENDEDOR },
  { id: 3, nombre: 'Gerente Demo', email: 'gerente@rockstar.cl', password: 'gerente123', rol: ID_ROL.GERENTE },
  { id: 4, nombre: 'Cliente Demo', email: 'cliente@rockstar.cl', password: 'cliente123', rol: ID_ROL.CLIENTE },
];
const ID_CLIENTE = 4;
const ID_BODEGA = 1;

const TALLAS_DE_LETRAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const CATEGORIAS = [
  { nombre: 'Poleras', tallas: TALLAS_DE_LETRAS, usaBanda: true },
  { nombre: 'Polerones', tallas: TALLAS_DE_LETRAS, usaBanda: true },
  { nombre: 'Chaquetas', tallas: TALLAS_DE_LETRAS, usaBanda: false },
  { nombre: 'Pantalones', tallas: ['38', '40', '42', '44', '46', '48', '50'], usaBanda: false },
  { nombre: 'Cinturones', tallas: ['Única'], usaBanda: false },
];

// Las fotos vienen incluidas en la app, por eso la dirección es relativa a ella.
const PRODUCTOS = [
  { nombre: 'Polera Calavera', categoria: 'Poleras', banda: 'Misfits', imagen: 'polera-calavera.jpg', precio: 14990, costo: 6500 },
  { nombre: 'Chaqueta de Cuero Rider', categoria: 'Chaquetas', banda: null, imagen: 'chaqueta-cuero-rider.jpg', precio: 89990, costo: 42000 },
  { nombre: 'Jeans Rasgado', categoria: 'Pantalones', banda: null, imagen: 'jeans-rasgado.jpg', precio: 29990, costo: 13000 },
  { nombre: 'Polerón Banda Tour', categoria: 'Polerones', banda: 'Metallica', imagen: 'poleron-banda-tour.jpg', precio: 34990, costo: 15500 },
  { nombre: 'Cinturón Tachas', categoria: 'Cinturones', banda: null, imagen: 'cinturon-tachas.jpg', precio: 12990, costo: 5000 },
  { nombre: 'Polera Eddie', categoria: 'Poleras', banda: 'Iron Maiden', imagen: 'polera-eddie.webp', precio: 15990, costo: 7000 },
  { nombre: 'Polera Rayo', categoria: 'Poleras', banda: 'AC/DC', imagen: 'polera-rayo.jpg', precio: 14990, costo: 6500 },
];

const VARIANTES = [
  { id: 1, producto: 'Polera Calavera', talla: 'M', color: 'Negro', bodega: 12, sala: 3, activo: true },
  { id: 2, producto: 'Polera Calavera', talla: 'L', color: 'Negro', bodega: 8, sala: 2, activo: true },
  { id: 3, producto: 'Chaqueta de Cuero Rider', talla: 'M', color: 'Negro', bodega: 4, sala: 1, activo: true },
  { id: 4, producto: 'Jeans Rasgado', talla: '42', color: 'Azul', bodega: 6, sala: 0, activo: true },
  { id: 5, producto: 'Polerón Banda Tour', talla: 'XL', color: 'Gris', bodega: 0, sala: 0, activo: true },
  { id: 6, producto: 'Cinturón Tachas', talla: 'Única', color: 'Negro', bodega: 5, sala: 5, activo: false },
  { id: 7, producto: 'Polera Eddie', talla: 'M', color: 'Negro', bodega: 9, sala: 2, activo: true },
  { id: 8, producto: 'Polera Rayo', talla: 'L', color: 'Negro', bodega: 5, sala: 1, activo: true },
];

interface PedidoDemo {
  id: number;
  venta: number;
  estado: string;
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
  /** Pares `[idVariante, cantidad]`. */
  lineas: [number, number][];
  pagado: number;
  despachado?: number;
  entregado?: number;
  tracking?: string;
}

/** Las horas son "hace cuánto" respecto del momento de la carga, para que siempre haya pedidos de cada estado. */
const PEDIDOS: PedidoDemo[] = [
  { id: 1001, venta: 5001, estado: 'PAGADO', destinatario: 'Camila Rojas', direccion: 'Av. Providencia 1234, depto 52', comuna: 'Providencia', region: 'Región Metropolitana', lineas: [[2, 1]], pagado: 2 },
  { id: 1002, venta: 5002, estado: 'EN_PREPARACION', destinatario: 'Matías Fuentes', direccion: 'Calle Condell 880', comuna: 'Valparaíso', region: 'Valparaíso', lineas: [[2, 1]], pagado: 20 },
  { id: 1003, venta: 5003, estado: 'DESPACHO_PENDIENTE', destinatario: 'Javiera Soto', direccion: 'Los Carrera 455', comuna: 'Concepción', region: 'Biobío', lineas: [[2, 1]], pagado: 26 },
  { id: 1004, venta: 5004, estado: 'DESPACHADO', destinatario: 'Diego Muñoz', direccion: 'Av. Alemania 310', comuna: 'Temuco', region: 'La Araucanía', lineas: [[3, 1], [1, 2]], pagado: 40, despachado: 22, tracking: 'STK-900104' },
  { id: 1005, venta: 5005, estado: 'DESPACHADO', destinatario: 'Fernanda Castro', direccion: 'Arturo Prat 2100', comuna: 'Antofagasta', region: 'Antofagasta', lineas: [[4, 1]], pagado: 70, despachado: 50, tracking: 'STK-900105' },
  { id: 1006, venta: 5006, estado: 'ENTREGADO', destinatario: 'Sebastián Vera', direccion: 'Irarrázaval 3400', comuna: 'Ñuñoa', region: 'Región Metropolitana', lineas: [[1, 1]], pagado: 120, despachado: 100, entregado: 75, tracking: 'STK-900106' },
  { id: 1007, venta: 5007, estado: 'ENTREGADO', destinatario: 'Antonia Pérez', direccion: 'O’Higgins 150', comuna: 'Rancagua', region: 'O’Higgins', lineas: [[4, 2]], pagado: 200, despachado: 180, entregado: 150, tracking: 'STK-900107' },
];

const ESTADOS_SIN_DESPACHAR = new Set(['PAGADO', 'EN_PREPARACION', 'DESPACHO_PENDIENTE', 'ATENCION_MANUAL']);
const FLETE = 4990;

/** Inserta los nombres en un catálogo (tallas, colores, bandas) y devuelve el id de cada uno. */
async function catalogo(tx: Ejecutor, tabla: string, columnaId: string, nombres: Iterable<string>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const nombre of new Set(nombres)) {
    const [fila] = await tx.consultar<{ id: number }>(
      `INSERT INTO inventario.${tabla} (nombre, clave) VALUES ($1, $2) RETURNING ${columnaId} AS id`,
      [nombre, claveDe(nombre)],
    );
    ids.set(nombre, fila!.id);
  }
  return ids;
}

const hace = (horas: number | undefined) => (horas === undefined ? null : new Date(Date.now() - horas * 3_600_000));

async function sembrar(tx: Ejecutor): Promise<void> {
  for (const cuenta of CUENTAS) {
    await tx.consultar(
      'INSERT INTO usuarios.usuarios (id_usuario, nombre, email, hash_contrasena, id_rol) VALUES ($1, $2, $3, $4, $5)',
      [cuenta.id, cuenta.nombre, cuenta.email, await hash(cuenta.password), cuenta.rol],
    );
  }

  const tallas = await catalogo(tx, 'tallas', 'id_talla', CATEGORIAS.flatMap((categoria) => categoria.tallas));
  const colores = await catalogo(tx, 'colores', 'id_color', VARIANTES.map((variante) => variante.color));
  const bandas = await catalogo(tx, 'bandas', 'id_banda', PRODUCTOS.flatMap((producto) => producto.banda ?? []));

  const zonas = new Set<string>();
  const categorias = new Map<string, { id: number; zona: string; posicion: number }>();
  for (const categoria of CATEGORIAS) {
    const zona = elegirZona(categoria.nombre, zonas);
    zonas.add(zona);
    const [fila] = await tx.consultar<{ id: number }>(
      'INSERT INTO inventario.categorias (nombre, clave, usa_banda, zona) VALUES ($1, $2, $3, $4) RETURNING id_categoria AS id',
      [categoria.nombre, claveDe(categoria.nombre), categoria.usaBanda, zona],
    );
    categorias.set(categoria.nombre, { id: fila!.id, zona, posicion: 0 });
    for (const [orden, talla] of categoria.tallas.entries()) {
      await tx.consultar('INSERT INTO inventario.categorias_tallas (id_categoria, id_talla, orden) VALUES ($1, $2, $3)', [
        fila!.id,
        tallas.get(talla),
        orden + 1,
      ]);
    }
  }

  const productos = new Map<string, { id: number; precio: number; costo: number }>();
  for (const producto of PRODUCTOS) {
    const categoria = categorias.get(producto.categoria)!;
    categoria.posicion += 1;
    const [fila] = await tx.consultar<{ id: number }>(
      `INSERT INTO inventario.productos (id_categoria, id_banda, codigo_ubicacion, nombre, clave, imagen_url, precio, costo_compra)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_producto AS id`,
      [
        categoria.id,
        producto.banda ? bandas.get(producto.banda) : null,
        codigoDeUbicacion(categoria.zona, categoria.posicion),
        producto.nombre,
        claveDe(producto.nombre),
        `assets/prendas/${producto.imagen}`,
        producto.precio,
        producto.costo,
      ],
    );
    productos.set(producto.nombre, { id: fila!.id, precio: producto.precio, costo: producto.costo });
  }
  for (const categoria of categorias.values()) {
    await tx.consultar('UPDATE inventario.categorias SET ultima_posicion = $2 WHERE id_categoria = $1', [
      categoria.id,
      categoria.posicion,
    ]);
  }

  for (const variante of VARIANTES) {
    const { sku, codigo } = codigosDeVariante(variante.id);
    await tx.consultar(
      'INSERT INTO inventario.variantes (id_variante, id_producto, id_talla, id_color, sku, codigo, activo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [variante.id, productos.get(variante.producto)!.id, tallas.get(variante.talla), colores.get(variante.color), sku, codigo, variante.activo],
    );
    for (const [ubicacion, cantidad] of [
      [ID_UBICACION.BODEGA, variante.bodega],
      [ID_UBICACION.SALA_VENTAS, variante.sala],
    ] as const) {
      await tx.consultar('INSERT INTO inventario.existencias (id_variante, id_ubicacion, cantidad) VALUES ($1, $2, $3)', [
        variante.id,
        ubicacion,
        cantidad,
      ]);
      if (cantidad > 0) {
        // Todo saldo nace de un movimiento, también el de la carga de demostración.
        await tx.consultar(
          `INSERT INTO inventario.movimientos (id_variante, id_ubicacion, id_tipo, cantidad, id_usuario, motivo)
           VALUES ($1, $2, (SELECT id_tipo FROM inventario.tipos_movimiento WHERE codigo = 'INGRESO'), $3, $4, 'Carga de demostración')`,
          [variante.id, ubicacion, cantidad, ID_BODEGA],
        );
      }
    }
  }

  // Las comunas vienen cargadas por las migraciones; aquí solo se ubican las de los pedidos.
  const comunas = new Map<string, number>();
  for (const pedido of PEDIDOS) {
    const [fila] = await tx.consultar<{ id: number }>(
      `SELECT c.id_comuna AS id FROM logistica.comunas c
       JOIN logistica.regiones r ON r.id_region = c.id_region
       WHERE c.nombre = $1 AND r.nombre = $2`,
      [pedido.comuna, pedido.region],
    );
    comunas.set(pedido.comuna, fila!.id);
  }

  const productoDeVariante = new Map(VARIANTES.map((variante) => [variante.id, productos.get(variante.producto)!]));
  for (const pedido of PEDIDOS) {
    const total = pedido.lineas.reduce((suma, [idVariante, cantidad]) => suma + productoDeVariante.get(idVariante)!.precio * cantidad, FLETE);
    await tx.consultar(
      `INSERT INTO ventas.ventas (id_venta, canal, id_cliente, id_estado, fecha, total, clave_idempotencia)
       VALUES ($1, 'ECOMMERCE', $2, (SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA'), $3, $4, $5)`,
      [pedido.venta, ID_CLIENTE, hace(pedido.pagado), total, `demo-${pedido.venta}`],
    );
    await tx.consultar(
      `INSERT INTO pagos.transacciones (id_venta, id_medio, monto, estado, token_webpay, codigo_autorizacion, creado_en, resuelto_en)
       VALUES ($1, (SELECT id_medio FROM pagos.medios_pago WHERE codigo = 'WEBPAY_DEBITO'), $2, 'AUTORIZADA', $3, $4, $5, $5)`,
      [pedido.venta, total, `demo-${pedido.venta}`, String(pedido.venta), hace(pedido.pagado)],
    );
    await tx.consultar('INSERT INTO ventas.costos_venta (id_venta, flete_cobrado) VALUES ($1, $2)', [pedido.venta, FLETE]);
    for (const [idVariante, cantidad] of pedido.lineas) {
      const { precio, costo } = productoDeVariante.get(idVariante)!;
      await tx.consultar(
        'INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario, costo_unitario) VALUES ($1, $2, $3, $4, $5)',
        [pedido.venta, idVariante, cantidad, precio, costo],
      );
      if (ESTADOS_SIN_DESPACHAR.has(pedido.estado)) {
        // Pagado y sin despachar: las unidades siguen en la tienda, pero ya están comprometidas.
        await tx.consultar("INSERT INTO inventario.reservas (id_venta, id_variante, cantidad, estado) VALUES ($1, $2, $3, 'CONFIRMADA')", [
          pedido.venta,
          idVariante,
          cantidad,
        ]);
      }
    }
    await tx.consultar(
      `INSERT INTO logistica.pedidos
         (id_pedido, id_venta, id_estado, id_comuna, direccion, destinatario, tracking_starken, flete_cobrado, pagado_en, despachado_en, entregado_en)
       VALUES ($1, $2, (SELECT id_estado FROM logistica.estados_pedido WHERE codigo = $3), $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        pedido.id,
        pedido.venta,
        pedido.estado,
        comunas.get(pedido.comuna),
        pedido.direccion,
        pedido.destinatario,
        pedido.tracking ?? null,
        FLETE,
        hace(pedido.pagado),
        hace(pedido.despachado),
        hace(pedido.entregado),
      ],
    );
  }

  // Los identificadores se fijaron a mano: las secuencias deben continuar después del último.
  for (const [tabla, columna] of [
    ['usuarios.usuarios', 'id_usuario'],
    ['inventario.variantes', 'id_variante'],
    ['ventas.ventas', 'id_venta'],
    ['logistica.pedidos', 'id_pedido'],
  ] as const) {
    await tx.consultar(`SELECT setval(pg_get_serial_sequence('${tabla}', '${columna}'), (SELECT max(${columna}) FROM ${tabla}))`);
  }
}

/**
 * Carga las cuentas, los productos y los pedidos de demostración, los mismos con que
 * la app se desarrolló contra su backend simulado. Solo actúa sobre una base sin cuentas.
 */
export async function sembrarDatosDemo(db: BaseDeDatos): Promise<boolean> {
  return db.transaccion(async (tx) => {
    const [cuentas] = await tx.consultar<{ hay: boolean }>('SELECT EXISTS (SELECT 1 FROM usuarios.usuarios) AS hay');
    if (cuentas!.hay) {
      return false;
    }
    await sembrar(tx);
    new Logger('DatosDemo').warn('Se cargaron datos de demostración con contraseñas públicas. No usar en producción.');
    return true;
  });
}
