import { Injectable } from '@nestjs/common';
import type {
  ProductoEdicionRequest,
  ProductoNuevoRequest,
  Usuario,
  VarianteEdicionRequest,
  VarianteGestion,
  VarianteStock,
} from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, esEnteroPositivo, exigir, noEncontrado, texto } from '../comun/errores.js';
import { claveDe } from '../comun/texto.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { CatalogosService } from './catalogos.service.js';
import { MES_ACTUAL, variantesConStock, variantesDeGestion } from './consultas.js';
import { StockService } from './stock.service.js';
import { codigoDeUbicacion, codigosDeVariante, esUbicacion } from './ubicaciones.js';

const LARGO_MAXIMO_ESTAMPADO = 60;

interface ProductoExistente {
  id: number;
  categoria: string;
}

/** Alta de productos desde la bodega: crea la variante y registra el ingreso de sus primeras unidades. */
@Injectable()
export class ProductosService {
  constructor(
    private readonly db: BaseDeDatos,
    private readonly catalogos: CatalogosService,
    private readonly stock: StockService,
  ) {}

  /**
   * Cambia el precio, la oferta del mes, la descripción o el tipo de estampado de un
   * producto; solo los campos que vienen en el cuerpo. Sin precio, el producto deja de ofrecerse en la tienda web.
   */
  editar(idProducto: number, cuerpo: unknown, usuario: Usuario): Promise<VarianteGestion[]> {
    const datos = cuerpoComo<ProductoEdicionRequest>(cuerpo);
    const valores: unknown[] = [idProducto];
    const cambios: string[] = [];
    if (datos.precio !== undefined) {
      exigir(datos.precio === null || esEnteroPositivo(datos.precio), 'El precio debe ser un entero mayor que cero.');
      valores.push(datos.precio);
      cambios.push(`precio = $${valores.length}`);
    }
    if (datos.descripcion !== undefined) {
      exigir(datos.descripcion === null || typeof datos.descripcion === 'string', 'La descripción no es válida.');
      valores.push(texto(datos.descripcion) || null);
      cambios.push(`descripcion = $${valores.length}`);
    }
    if (datos.tipoEstampado !== undefined) {
      exigir(datos.tipoEstampado === null || typeof datos.tipoEstampado === 'string', 'El tipo de estampado no es válido.');
      exigir(texto(datos.tipoEstampado).length <= LARGO_MAXIMO_ESTAMPADO, `El tipo de estampado puede tener hasta ${LARGO_MAXIMO_ESTAMPADO} caracteres.`);
      valores.push(texto(datos.tipoEstampado) || null);
      cambios.push(`tipo_estampado = $${valores.length}`);
    }
    const { precioOferta } = datos;
    exigir(
      precioOferta === undefined || precioOferta === null || esEnteroPositivo(precioOferta),
      'El precio de oferta debe ser un entero mayor que cero.',
    );
    exigir(cambios.length > 0 || precioOferta !== undefined, 'No hay cambios que aplicar.');

    return this.db.transaccion(async (tx) => {
      // La fila queda bloqueada: la oferta se valida contra el precio con que queda el producto.
      const [producto] = await tx.consultar<{ precio: number | null }>(
        cambios.length > 0
          ? `UPDATE inventario.productos SET ${cambios.join(', ')} WHERE id_producto = $1 RETURNING precio`
          : 'SELECT precio FROM inventario.productos WHERE id_producto = $1 FOR UPDATE',
        valores,
      );
      if (!producto) {
        throw noEncontrado('El producto no existe.');
      }
      await this.ajustarOferta(tx, idProducto, producto.precio, precioOferta, usuario);
      return variantesDeGestion(tx, 'WHERE p.id_producto = $1', [idProducto]);
    });
  }

  /**
   * Deja la oferta de este mes como se pidió, siempre por debajo del precio normal. Si no
   * se pidió nada sobre ella, verifica que la que hay siga siendo una rebaja.
   */
  private async ajustarOferta(
    tx: Ejecutor,
    idProducto: number,
    precio: number | null,
    precioOferta: number | null | undefined,
    usuario: Usuario,
  ): Promise<void> {
    if (precioOferta === undefined && precio !== null) {
      const [oferta] = await tx.consultar<{ precio_oferta: number }>(
        `SELECT precio_oferta FROM inventario.ofertas WHERE id_producto = $1 AND mes = ${MES_ACTUAL}`,
        [idProducto],
      );
      exigir(!oferta || oferta.precio_oferta < precio, 'El precio debe ser mayor que el precio de oferta de este mes.');
      return;
    }
    if (precioOferta === undefined || precioOferta === null) {
      // Se quitó la oferta, o el producto quedó sin precio y fuera de la tienda.
      await tx.consultar(`DELETE FROM inventario.ofertas WHERE id_producto = $1 AND mes = ${MES_ACTUAL}`, [idProducto]);
      return;
    }
    exigir(precio !== null, 'Un producto sin precio no puede estar en oferta.');
    exigir(precioOferta < precio, 'El precio de oferta debe ser menor que el precio normal.');
    await tx.consultar(
      `INSERT INTO inventario.ofertas (id_producto, mes, precio_oferta, id_usuario) VALUES ($1, ${MES_ACTUAL}, $2, $3)
       ON CONFLICT (id_producto, mes)
       DO UPDATE SET precio_oferta = EXCLUDED.precio_oferta, id_usuario = EXCLUDED.id_usuario, creada_en = now()`,
      [idProducto, precioOferta, usuario.id],
    );
  }

  /**
   * Edita una prenda: la talla y el color de la variante, y el nombre, la categoría, la
   * banda y la foto de su producto. Solo cambia lo que viene en el cuerpo, y todo en una
   * transacción: si un dato no es válido, no se aplica ninguno.
   */
  editarVariante(idVariante: number, cuerpo: unknown): Promise<VarianteStock> {
    const datos = cuerpoComo<VarianteEdicionRequest>(cuerpo);
    const campos: (keyof VarianteEdicionRequest)[] = ['nombre', 'categoria', 'banda', 'talla', 'color', 'imagen'];
    exigir(campos.some((campo) => datos[campo] !== undefined), 'No hay cambios que aplicar.');

    return this.db.transaccion(async (tx) => {
      // El bloqueo ordena dos ediciones simultáneas de la misma prenda o de su producto.
      const [actual] = await tx.consultar<{ id_producto: number; id_categoria: number; usa_banda: boolean; clave: string; id_talla: number; id_color: number }>(
        `SELECT v.id_producto, p.id_categoria, c.usa_banda, p.clave, v.id_talla, v.id_color
         FROM inventario.variantes v
         JOIN inventario.productos p ON p.id_producto = v.id_producto
         JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
         WHERE v.id_variante = $1
         FOR UPDATE OF v, p`,
        [idVariante],
      );
      if (!actual) {
        throw noEncontrado('La variante no existe.');
      }
      const idProducto = actual.id_producto;

      if (datos.nombre !== undefined) {
        const nombre = texto(datos.nombre);
        exigir(nombre !== '', 'El nombre es obligatorio.');
        const clave = claveDe(nombre);
        if (clave !== actual.clave) {
          // El mismo candado que usa el alta: nadie crea un producto con este nombre a la vez.
          await tx.consultar('SELECT pg_advisory_xact_lock(hashtext($1))', [`producto:${clave}`]);
          const [otro] = await tx.consultar('SELECT 1 FROM inventario.productos WHERE clave = $1 AND id_producto <> $2', [clave, idProducto]);
          if (otro) {
            throw new ErrorDeNegocio(409, 'PRODUCTO_DUPLICADO', 'Ya existe otro producto con ese nombre.');
          }
        }
        await tx.consultar('UPDATE inventario.productos SET nombre = $2, clave = $3 WHERE id_producto = $1', [idProducto, nombre, clave]);
      }

      let idCategoria = actual.id_categoria;
      let usaBanda = actual.usa_banda;
      if (datos.categoria !== undefined) {
        exigir(texto(datos.categoria) !== '', 'La categoría es obligatoria.');
        const categoria = await this.catalogos.incorporarCategoria(tx, datos.categoria);
        if (categoria.id !== idCategoria) {
          // Cada categoría tiene su zona en la bodega: el producto pasa a un espacio nuevo de esa zona.
          const [lugar] = await tx.consultar<{ zona: string; posicion: number }>(
            `UPDATE inventario.categorias SET ultima_posicion = ultima_posicion + 1
             WHERE id_categoria = $1 RETURNING zona, ultima_posicion AS posicion`,
            [categoria.id],
          );
          await tx.consultar('UPDATE inventario.productos SET id_categoria = $2, codigo_ubicacion = $3 WHERE id_producto = $1', [
            idProducto,
            categoria.id,
            codigoDeUbicacion(lugar!.zona, lugar!.posicion),
          ]);
          // Las tallas que ya tiene el producto pasan a ser tallas de su categoría nueva.
          const tallas = await tx.consultar<{ id_talla: number }>('SELECT DISTINCT id_talla FROM inventario.variantes WHERE id_producto = $1', [idProducto]);
          for (const { id_talla: idTalla } of tallas) {
            await this.catalogos.admitirTalla(tx, categoria.id, idTalla);
          }
          idCategoria = categoria.id;
          usaBanda = categoria.usaBanda;
        }
      }

      if (!usaBanda) {
        // Las categorías sin banda, como los pantalones, no la conservan ni la aceptan.
        await tx.consultar('UPDATE inventario.productos SET id_banda = NULL WHERE id_producto = $1', [idProducto]);
      } else if (datos.banda !== undefined) {
        exigir(datos.banda === null || typeof datos.banda === 'string', 'La banda no es válida.');
        const idBanda = texto(datos.banda) === '' ? null : (await this.catalogos.incorporar(tx, 'bandas', datos.banda)).id;
        await tx.consultar('UPDATE inventario.productos SET id_banda = $2 WHERE id_producto = $1', [idProducto, idBanda]);
      }

      if (datos.imagen !== undefined) {
        exigir(texto(datos.imagen).startsWith('data:image/'), 'La imagen no es válida.');
        await tx.consultar('UPDATE inventario.productos SET imagen_url = $2 WHERE id_producto = $1', [idProducto, datos.imagen]);
      }

      if (datos.talla !== undefined || datos.color !== undefined) {
        exigir(datos.talla === undefined || texto(datos.talla) !== '', 'La talla es obligatoria.');
        exigir(datos.color === undefined || texto(datos.color) !== '', 'El color es obligatorio.');
        const idTalla = datos.talla === undefined ? actual.id_talla : (await this.catalogos.incorporar(tx, 'tallas', datos.talla)).id;
        const idColor = datos.color === undefined ? actual.id_color : (await this.catalogos.incorporar(tx, 'colores', datos.color)).id;
        const [duplicada] = await tx.consultar(
          'SELECT 1 FROM inventario.variantes WHERE id_producto = $1 AND id_talla = $2 AND id_color = $3 AND id_variante <> $4',
          [idProducto, idTalla, idColor, idVariante],
        );
        if (duplicada) {
          throw new ErrorDeNegocio(409, 'VARIANTE_DUPLICADA', 'El producto ya tiene esa talla y color.');
        }
        await this.catalogos.admitirTalla(tx, idCategoria, idTalla);
        await tx.consultar('UPDATE inventario.variantes SET id_talla = $2, id_color = $3 WHERE id_variante = $1', [idVariante, idTalla, idColor]);
      }

      return (await variantesConStock(tx, 'WHERE v.id_variante = $1', [idVariante]))[0]!;
    });
  }

  crear(cuerpo: unknown, usuario: Usuario): Promise<VarianteStock> {
    const datos = cuerpoComo<ProductoNuevoRequest>(cuerpo);
    return this.stock.unaVez(
      'PRODUCTO',
      datos.claveIdempotencia,
      usuario,
      (tx, clave) => this.crearVariante(tx, clave, datos, usuario),
      (tx, clave) => this.stock.varianteDeOperacion(tx, clave),
    );
  }

  private async crearVariante(tx: Ejecutor, clave: string, datos: Partial<ProductoNuevoRequest>, usuario: Usuario): Promise<void> {
    const nombre = texto(datos.nombre);
    const talla = texto(datos.talla);
    const color = texto(datos.color);
    const { cantidad, ubicacion } = datos;
    exigir(nombre !== '', 'El nombre es obligatorio.');
    exigir(texto(datos.categoria) !== '', 'La categoría es obligatoria.');
    exigir(talla !== '', 'La talla es obligatoria.');
    exigir(color !== '', 'El color es obligatorio.');
    exigir(texto(datos.imagen).startsWith('data:image/'), 'La imagen es obligatoria.');
    exigir(esEnteroPositivo(cantidad), 'La cantidad debe ser un entero mayor que cero.');
    exigir(esUbicacion(ubicacion), 'La ubicación no es válida.');

    // Dos altas simultáneas del mismo producto se hacen de a una, para no crearlo dos veces.
    const claveProducto = claveDe(nombre);
    await tx.consultar('SELECT pg_advisory_xact_lock(hashtext($1))', [`producto:${claveProducto}`]);
    const [existente] = await tx.consultar<ProductoExistente>(
      `SELECT p.id_producto AS id, c.nombre AS categoria
       FROM inventario.productos p JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
       WHERE p.clave = $1`,
      [claveProducto],
    );

    // Una talla o color nuevo de un producto existente hereda su categoría, banda, foto y ubicación.
    // Una categoría, talla, color o banda que aún no existe queda registrada al crear el producto.
    const categoria = await this.catalogos.incorporarCategoria(tx, existente?.categoria ?? datos.categoria);
    const idTalla = (await this.catalogos.incorporar(tx, 'tallas', talla)).id;
    const idColor = (await this.catalogos.incorporar(tx, 'colores', color)).id;
    await this.catalogos.admitirTalla(tx, categoria.id, idTalla);

    let idProducto = existente?.id;
    if (idProducto === undefined) {
      // Las categorías sin banda, como los pantalones, ignoran la banda que se envíe.
      const idBanda = categoria.usaBanda && texto(datos.banda) !== '' ? (await this.catalogos.incorporar(tx, 'bandas', datos.banda)).id : null;
      // La posición en la bodega es correlativa dentro de la zona de la categoría.
      const [lugar] = await tx.consultar<{ zona: string; posicion: number }>(
        `UPDATE inventario.categorias SET ultima_posicion = ultima_posicion + 1
         WHERE id_categoria = $1 RETURNING zona, ultima_posicion AS posicion`,
        [categoria.id],
      );
      const [producto] = await tx.consultar<{ id: number }>(
        `INSERT INTO inventario.productos (id_categoria, id_banda, codigo_ubicacion, nombre, clave, imagen_url)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_producto AS id`,
        [categoria.id, idBanda, codigoDeUbicacion(lugar!.zona, lugar!.posicion), nombre, claveProducto, datos.imagen],
      );
      idProducto = producto!.id;
    } else {
      const [duplicada] = await tx.consultar(
        'SELECT 1 FROM inventario.variantes WHERE id_producto = $1 AND id_talla = $2 AND id_color = $3',
        [idProducto, idTalla, idColor],
      );
      if (duplicada) {
        throw new ErrorDeNegocio(409, 'VARIANTE_DUPLICADA', 'La variante ya existe.');
      }
    }

    // El SKU y el código escaneable se derivan del identificador, así que se pide antes de insertar.
    const [siguiente] = await tx.consultar<{ id: number }>(
      `SELECT nextval(pg_get_serial_sequence('inventario.variantes', 'id_variante'))::int AS id`,
    );
    const idVariante = siguiente!.id;
    const { sku, codigo } = codigosDeVariante(idVariante);
    await tx.consultar(
      'INSERT INTO inventario.variantes (id_variante, id_producto, id_talla, id_color, sku, codigo) VALUES ($1, $2, $3, $4, $5, $6)',
      [idVariante, idProducto, idTalla, idColor, sku, codigo],
    );

    // Las primeras unidades entran como un ingreso, para que el stock siempre tenga su movimiento.
    await this.stock.bloquear(tx, [idVariante]);
    await this.stock.sumar(tx, idVariante, ubicacion, cantidad);
    await this.stock.registrar(tx, clave, usuario, {
      idVariante,
      tipo: 'INGRESO',
      ubicacion,
      cantidad,
      motivo: 'Ingreso inicial del producto',
    });
  }
}
