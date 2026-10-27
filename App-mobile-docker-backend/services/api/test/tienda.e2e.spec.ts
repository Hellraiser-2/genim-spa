import { randomUUID } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import type {
  ArticuloCatalogo,
  CheckoutResponse,
  CompraPendiente,
  Comuna,
  CotizacionFlete,
  CuentaInterna,
  ErrorApi,
  GuiaDeTallas,
  Movimiento,
  Pedido,
  PedidoCliente,
  PerfilUsuario,
  Region,
  ResultadoPago,
  SesionResponse,
  VarianteGestion,
  VarianteStock,
} from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Pruebas de lo que usa la tienda web: catálogo, cuentas de clientes, flete, compra con
 * pago simulado y pedidos del cliente. Venden productos de demostración, así que levantan
 * siempre su propia API con base en memoria y nunca tocan la base de `docker compose`.
 *
 * La Polera Eddie M (variante 7, RS-0007, $15.990) parte con 9 unidades en bodega y 2 en
 * sala, sin reservas. La Polera Rayo L (variante 8, RS-0008, $14.990), con 5 y 1.
 */

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const EDDIE = 7;
const RAYO = 8;
/** Teléfono y dirección que pide el registro, escritos como los escribiría una persona. */
const CONTACTO = { telefono: '+56 9 1234 5678', direccion: '  Av. Siempre Viva 742, Providencia  ' };

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let bodega: string;
let gerente: string;
let cliente: string;
let providencia: number;
let temuco: number;

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as T };
}

const obtener = <T>(ruta: string, token?: string) => llamar<T>('GET', ruta, undefined, token);
const enviar = <T>(ruta: string, cuerpo: unknown, token?: string) => llamar<T>('POST', ruta, cuerpo, token);

async function iniciarSesion(email: string, password: string): Promise<string> {
  return (await enviar<SesionResponse>('/usuarios/auth/login', { email, password })).cuerpo.accessToken;
}

async function enCatalogo(idVariante: number): Promise<ArticuloCatalogo | undefined> {
  return (await obtener<ArticuloCatalogo[]>('/inventario/catalogo')).cuerpo.find((a) => a.idVariante === idVariante);
}

const despachoA = (idComuna: number) => ({ idComuna, direccion: 'Av. Siempre Viva 742', destinatario: 'Cliente Demo', telefono: '+56 9 1234 5678' });

function comprar<T = CheckoutResponse>(lineas: { idVariante: number; cantidad: number }[], token = cliente, extra: object = {}) {
  return enviar<T>('/ventas/checkout', { claveIdempotencia: randomUUID(), lineas, despacho: despachoA(providencia), ...extra }, token);
}

const pagar = (tokenPago: string, aprobar = true) => enviar<ResultadoPago>('/pagos/webpay/retorno', { tokenPago, aprobar });

const filas = async <T>(sql: string, parametros: unknown[] = []) => (await db.query<T>(sql, parametros)).rows;

const estadoDeVenta = async (idVenta: number) =>
  (await filas<{ codigo: string }>('SELECT e.codigo FROM ventas.ventas v JOIN ventas.estados_venta e USING (id_estado) WHERE v.id_venta = $1', [idVenta]))[0]!
    .codigo;

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
  cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
  const comuna = async (region: number, nombre: string) =>
    (await obtener<Comuna[]>(`/logistica/comunas?region=${region}`)).cuerpo.find((c) => c.nombre === nombre)!.idComuna;
  providencia = await comuna(7, 'Providencia');
  temuco = await comuna(12, 'Temuco');
});

afterAll(async () => {
  await detener?.();
});

describe('catálogo de la tienda', () => {
  it('es público y muestra las prendas con precio y lo que se puede comprar ahora', async () => {
    const { status, cuerpo } = await obtener<ArticuloCatalogo[]>('/inventario/catalogo');

    expect(status).toBe(200);
    expect(cuerpo.find((a) => a.idVariante === EDDIE)).toEqual({
      idVariante: EDDIE,
      idProducto: expect.any(Number),
      sku: 'RS-0007',
      producto: 'Polera Eddie',
      categoria: 'Poleras',
      banda: 'Iron Maiden',
      talla: 'M',
      color: 'Negro',
      precio: 15990,
      precioNormal: null,
      descripcion: null,
      tipoEstampado: null,
      imagenUrl: 'assets/prendas/polera-eddie.webp',
      disponible: 11,
    });
    // La Polera Calavera L tiene 10 unidades y 3 comprometidas en pedidos.
    expect(cuerpo.find((a) => a.sku === 'RS-0002')!.disponible).toBe(7);
    // Un producto agotado se muestra sin disponibilidad; uno desactivado no se muestra.
    expect(cuerpo.find((a) => a.sku === 'RS-0005')!.disponible).toBe(0);
    expect(cuerpo.find((a) => a.sku === 'RS-0006')).toBeUndefined();
  });

  it('un producto creado en bodega no se publica hasta que el Gerente le pone precio', async () => {
    const nombre = `Polera Prueba ${randomUUID().slice(0, 8)}`;
    const { cuerpo: creada } = await enviar<VarianteStock>(
      '/inventario/productos',
      { claveIdempotencia: randomUUID(), nombre, categoria: 'Poleras', banda: 'Exodus', talla: 'M', color: 'Negro', cantidad: 4, ubicacion: 'BODEGA', imagen: FOTO },
      bodega,
    );
    expect(await enCatalogo(creada.idVariante)).toBeUndefined();

    const gestion = (await obtener<VarianteGestion[]>('/inventario/productos', bodega)).cuerpo.find((v) => v.idVariante === creada.idVariante)!;
    expect(gestion).toMatchObject({ producto: nombre, precio: null, descripcion: null, disponible: 4 });
    const ruta = `/inventario/productos/${gestion.idProducto}`;

    expect((await llamar<ErrorApi>('PATCH', ruta, { precio: 19990 }, bodega)).status).toBe(403);
    expect((await llamar<ErrorApi>('PATCH', ruta, { precio: -1 }, gerente)).cuerpo.mensaje).toBe('El precio debe ser un entero mayor que cero.');
    expect((await llamar<ErrorApi>('PATCH', ruta, {}, gerente)).cuerpo.mensaje).toBe('No hay cambios que aplicar.');
    expect((await llamar<ErrorApi>('PATCH', '/inventario/productos/999999', { precio: 100 }, gerente)).status).toBe(404);

    const editado = await llamar<VarianteGestion[]>('PATCH', ruta, { precio: 19990, descripcion: '  Edición limitada  ' }, gerente);
    expect(editado.status).toBe(200);
    expect(editado.cuerpo).toEqual([expect.objectContaining({ idVariante: creada.idVariante, precio: 19990, descripcion: 'Edición limitada' })]);
    expect(await enCatalogo(creada.idVariante)).toMatchObject({ producto: nombre, precio: 19990, descripcion: 'Edición limitada', disponible: 4, imagenUrl: FOTO });

    // Cambiar solo la descripción conserva el precio; quitar el precio lo retira de la tienda.
    await llamar('PATCH', ruta, { descripcion: null }, gerente);
    expect(await enCatalogo(creada.idVariante)).toMatchObject({ precio: 19990, descripcion: null });
    await llamar('PATCH', ruta, { precio: null }, gerente);
    expect(await enCatalogo(creada.idVariante)).toBeUndefined();
  });

  it('el Gerente pone un producto en oferta por el mes y la tienda cobra ese precio', async () => {
    const nombre = `Polera Oferta ${randomUUID().slice(0, 8)}`;
    const { cuerpo: creada } = await enviar<VarianteStock>(
      '/inventario/productos',
      { claveIdempotencia: randomUUID(), nombre, categoria: 'Poleras', banda: 'Exodus', talla: 'M', color: 'Negro', cantidad: 4, ubicacion: 'BODEGA', imagen: FOTO },
      bodega,
    );
    const { idProducto } = (await obtener<VarianteGestion[]>('/inventario/productos', gerente)).cuerpo.find((v) => v.idVariante === creada.idVariante)!;
    const editar = <T = VarianteGestion[]>(cambios: object, token = gerente) => llamar<T>('PATCH', `/inventario/productos/${idProducto}`, cambios, token);
    const publicado = () => enCatalogo(creada.idVariante);

    // Solo un producto con precio puede estar en oferta, y la oferta debe ser una rebaja.
    expect((await editar<ErrorApi>({ precioOferta: 9990 })).cuerpo.mensaje).toBe('Un producto sin precio no puede estar en oferta.');
    await editar({ precio: 19990 });
    expect((await editar<ErrorApi>({ precioOferta: 19990 })).cuerpo.mensaje).toBe('El precio de oferta debe ser menor que el precio normal.');
    expect((await editar<ErrorApi>({ precioOferta: 0 })).cuerpo.mensaje).toBe('El precio de oferta debe ser un entero mayor que cero.');
    expect((await editar<ErrorApi>({ precioOferta: 14990 }, bodega)).status).toBe(403);
    expect(await publicado()).toMatchObject({ precio: 19990, precioNormal: null });

    const enOferta = await editar({ precioOferta: 14990 });
    expect(enOferta.status).toBe(200);
    expect(enOferta.cuerpo).toEqual([expect.objectContaining({ idVariante: creada.idVariante, precio: 19990, precioOferta: 14990 })]);
    expect(await publicado()).toMatchObject({ precio: 14990, precioNormal: 19990 });

    // El precio normal no puede quedar igual o por debajo de la oferta: el cambio no se aplica.
    expect((await editar<ErrorApi>({ precio: 14990 })).cuerpo.mensaje).toBe('El precio debe ser mayor que el precio de oferta de este mes.');
    expect(await publicado()).toMatchObject({ precio: 14990, precioNormal: 19990 });

    // La compra se cobra y se guarda al precio de oferta.
    const { cuerpo: compra } = await comprar([{ idVariante: creada.idVariante, cantidad: 2 }]);
    expect(compra.subtotal).toBe(29980);
    expect(await filas('SELECT precio_unitario FROM ventas.detalle_venta WHERE id_venta = $1', [compra.idVenta])).toEqual([{ precio_unitario: 14990 }]);
    await pagar(compra.tokenPago, false);

    // La oferta de un mes anterior ya no rige: el producto vuelve solo a su precio normal.
    await db.query(`UPDATE inventario.ofertas SET mes = (mes - interval '1 month')::date WHERE id_producto = $1`, [idProducto]);
    expect(await publicado()).toMatchObject({ precio: 19990, precioNormal: null });

    // Cambiar la oferta la reemplaza; `null` la quita, y dejar el producto sin precio también.
    await editar({ precioOferta: 12990 });
    await editar({ precioOferta: 11990 });
    expect(await publicado()).toMatchObject({ precio: 11990, precioNormal: 19990 });
    await editar({ precioOferta: null });
    expect(await publicado()).toMatchObject({ precio: 19990, precioNormal: null });
    await editar({ precioOferta: 11990 });
    await editar({ precio: null });
    await editar({ precio: 19990 });
    expect(await publicado()).toMatchObject({ precio: 19990, precioNormal: null });
  });

  it('el Gerente registra el tipo de estampado de un producto y la tienda lo publica', async () => {
    const rayo = (await enCatalogo(RAYO))!;
    const editar = <T = VarianteGestion[]>(cambios: object, token = gerente) => llamar<T>('PATCH', `/inventario/productos/${rayo.idProducto}`, cambios, token);

    const editado = await editar({ tipoEstampado: '  Serigrafía  ' });
    expect(editado.status).toBe(200);
    expect(editado.cuerpo[0]).toMatchObject({ tipoEstampado: 'Serigrafía', precio: 14990 });
    expect(await enCatalogo(RAYO)).toMatchObject({ tipoEstampado: 'Serigrafía', precio: 14990 });

    expect((await editar<ErrorApi>({ tipoEstampado: 'a'.repeat(61) })).cuerpo.mensaje).toBe('El tipo de estampado puede tener hasta 60 caracteres.');
    expect((await editar<ErrorApi>({ tipoEstampado: 7 })).cuerpo.mensaje).toBe('El tipo de estampado no es válido.');
    expect((await editar<ErrorApi>({ tipoEstampado: 'Bordado' }, bodega)).status).toBe(403);

    // Vacío o `null` lo quita, sin tocar lo demás del producto.
    await editar({ tipoEstampado: ' ' });
    expect(await enCatalogo(RAYO)).toMatchObject({ tipoEstampado: null, precio: 14990 });
  });
});

describe('guía de tallas', () => {
  const guias = async () => (await obtener<GuiaDeTallas[]>('/inventario/catalogo/guias-tallas')).cuerpo;
  const guardar = <T = GuiaDeTallas>(cuerpo: object, token = bodega) => llamar<T>('PUT', '/inventario/categorias/medidas', cuerpo, token);

  it('es pública y parte con las tallas de cada categoría, en su orden y sin medidas', async () => {
    const { status, cuerpo } = await obtener<GuiaDeTallas[]>('/inventario/catalogo/guias-tallas');

    expect(status).toBe(200);
    expect(cuerpo.map((g) => g.categoria)).toEqual([...cuerpo.map((g) => g.categoria)].sort((a, b) => a.localeCompare(b, 'es')));
    expect(cuerpo.find((g) => g.categoria === 'Poleras')!.tallas).toEqual(
      ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((talla) => ({ talla, anchoCm: null, largoCm: null })),
    );
    expect(cuerpo.find((g) => g.categoria === 'Pantalones')!.tallas.map((t) => t.talla)).toEqual(['38', '40', '42', '44', '46', '48', '50']);
  });

  it('guarda las medidas de las tallas enviadas y deja las demás como estaban', async () => {
    const { status, cuerpo } = await guardar({ categoria: 'poleras', tallas: [{ talla: 'm', anchoCm: 52, largoCm: 72 }, { talla: 'L', anchoCm: 56, largoCm: null }] });

    expect(status).toBe(200);
    expect(cuerpo.categoria).toBe('Poleras');
    expect(cuerpo.tallas).toEqual([
      { talla: 'XS', anchoCm: null, largoCm: null },
      { talla: 'S', anchoCm: null, largoCm: null },
      { talla: 'M', anchoCm: 52, largoCm: 72 },
      { talla: 'L', anchoCm: 56, largoCm: null },
      { talla: 'XL', anchoCm: null, largoCm: null },
      { talla: 'XXL', anchoCm: null, largoCm: null },
    ]);
    expect((await guias()).find((g) => g.categoria === 'Poleras')).toEqual(cuerpo);
    // Las medidas son de la categoría: las de otra no cambian.
    expect((await guias()).find((g) => g.categoria === 'Polerones')!.tallas.every((t) => t.anchoCm === null && t.largoCm === null)).toBe(true);

    await guardar({ categoria: 'Poleras', tallas: [{ talla: 'L', anchoCm: null, largoCm: null }] });
    expect((await guias()).find((g) => g.categoria === 'Poleras')!.tallas.filter((t) => t.anchoCm !== null)).toEqual([{ talla: 'M', anchoCm: 52, largoCm: 72 }]);
  });

  it('rechaza medidas que no son centímetros enteros o tallas que la categoría no admite', async () => {
    const mensaje = async (cuerpo: object) => (await guardar<ErrorApi>(cuerpo)).cuerpo.mensaje;
    const medidas = 'Las medidas van en centímetros enteros, entre 1 y 300.';

    expect(await mensaje({ categoria: 'Poleras', tallas: [{ talla: 'M', anchoCm: 52.5, largoCm: 72 }] })).toBe(medidas);
    expect(await mensaje({ categoria: 'Poleras', tallas: [{ talla: 'M', anchoCm: 0, largoCm: 72 }] })).toBe(medidas);
    expect(await mensaje({ categoria: 'Poleras', tallas: [{ talla: 'M', anchoCm: 52, largoCm: '72' }] })).toBe(medidas);
    expect(await mensaje({ categoria: 'Poleras', tallas: [{ talla: 'M', anchoCm: 52, largoCm: 301 }] })).toBe(medidas);
    expect(await mensaje({ categoria: 'Poleras', tallas: [] })).toBe('Faltan las medidas de las tallas.');
    expect(await mensaje({ categoria: 'Poleras', tallas: [{ anchoCm: 52, largoCm: 72 }] })).toBe('Cada medida necesita su talla.');
    // Si una talla no corresponde, no se guarda ninguna de la solicitud.
    expect(await mensaje({ categoria: 'Poleras', tallas: [{ talla: 'S', anchoCm: 48, largoCm: 68 }, { talla: '42', anchoCm: 40, largoCm: 100 }] })).toBe('La categoría no admite la talla 42.');
    expect((await guias()).find((g) => g.categoria === 'Poleras')!.tallas.find((t) => t.talla === 'S')).toEqual({ talla: 'S', anchoCm: null, largoCm: null });
    expect((await guardar<ErrorApi>({ categoria: 'No existe', tallas: [{ talla: 'M', anchoCm: 52, largoCm: 72 }] })).status).toBe(404);
  });

  it('solo Bodega y Gerente guardan medidas', async () => {
    const cuerpo = { categoria: 'Poleras', tallas: [{ talla: 'M', anchoCm: 52, largoCm: 72 }] };
    expect((await guardar(cuerpo, gerente)).status).toBe(200);
    expect((await guardar(cuerpo, cliente)).status).toBe(403);
    expect((await llamar('PUT', '/inventario/categorias/medidas', cuerpo)).status).toBe(401);
  });
});

describe('cuentas de clientes', () => {
  it('el registro crea una cuenta de Cliente con la sesión iniciada', async () => {
    const email = `nuevo-${randomUUID().slice(0, 8)}@correo.cl`;

    const { status, cuerpo } = await enviar<SesionResponse>('/usuarios/auth/registro', { nombre: ' Ana Rock ', email: ` ${email.toUpperCase()} `, password: 'guitarra-8', ...CONTACTO });

    expect(status).toBe(201);
    expect(cuerpo.usuario).toEqual({ id: expect.any(Number), nombre: 'Ana Rock', email, rol: 'CLIENTE' });
    expect((await obtener<PedidoCliente[]>('/logistica/pedidos/mios', cuerpo.accessToken)).cuerpo).toEqual([]);
    expect((await enviar<SesionResponse>('/usuarios/auth/login', { email, password: 'guitarra-8' })).status).toBe(200);

    expect(await enviar<ErrorApi>('/usuarios/auth/registro', { nombre: 'Otra', email, password: 'guitarra-8', ...CONTACTO })).toEqual({
      status: 409,
      cuerpo: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya existe una cuenta con ese correo.' },
    });
  });

  it('rechaza un registro con datos incompletos', async () => {
    const registro = (datos: object) => enviar<ErrorApi>('/usuarios/auth/registro', { nombre: 'Ana', email: 'ana@correo.cl', password: 'guitarra-8', ...CONTACTO, ...datos });
    expect((await registro({ nombre: ' ' })).cuerpo.mensaje).toBe('El nombre es obligatorio.');
    expect((await registro({ email: 'sin-arroba' })).cuerpo.mensaje).toBe('El correo no es válido.');
    expect((await registro({ password: 'corta' })).cuerpo.mensaje).toBe('La contraseña debe tener al menos 8 caracteres.');
    expect((await registro({ direccion: '  ' })).cuerpo.mensaje).toBe('La dirección es obligatoria.');
    expect((await registro({ direccion: 'a'.repeat(201) })).cuerpo.mensaje).toBe('La dirección puede tener hasta 200 caracteres.');
  });

  it('el teléfono debe ser un número chileno y se guarda con su prefijo +56', async () => {
    const registrar = <T>(telefono: unknown) =>
      enviar<T>('/usuarios/auth/registro', { nombre: 'Ana', email: `fono-${randomUUID().slice(0, 8)}@correo.cl`, password: 'guitarra-8', direccion: 'Calle 1', telefono });
    const guardado = async (telefono: string) =>
      (await obtener<PerfilUsuario>('/usuarios/yo', (await registrar<SesionResponse>(telefono)).cuerpo.accessToken)).cuerpo.telefono;

    // Con el prefijo o sin él, con espacios o guiones: queda siempre igual.
    expect(await guardado('912345678')).toBe('+56912345678');
    expect(await guardado('+56 9 1234 5678')).toBe('+56912345678');
    expect(await guardado('56912345678')).toBe('+56912345678');
    expect(await guardado('(2) 2345-6789')).toBe('+56223456789');
    // Un número que empieza con 56 y tiene nueve dígitos no pierde esos dígitos.
    expect(await guardado('561234567')).toBe('+56561234567');

    for (const telefono of [undefined, '', '12345678', '9123456789', '+54 9 1234 5678', '9 1234 567a', '+56']) {
      expect((await registrar<ErrorApi>(telefono)).cuerpo, String(telefono)).toEqual({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'El teléfono debe ser un número chileno: +56 y 9 dígitos.',
      });
    }
  });

  it('el Gerente ve las cuentas del personal, sin las de clientes', async () => {
    const { status, cuerpo } = await obtener<CuentaInterna[]>('/usuarios/internos', gerente);
    expect(status).toBe(200);
    expect(cuerpo.map((c) => [c.email, c.rol, c.activo])).toEqual([
      ['bodega@rockstar.cl', 'BODEGA', true],
      ['gerente@rockstar.cl', 'GERENTE', true],
      ['vendedor@rockstar.cl', 'VENDEDOR', true],
    ]);
    expect((await obtener('/usuarios/internos', bodega)).status).toBe(403);
    expect((await obtener('/usuarios/internos', cliente)).status).toBe(403);
  });
});

describe('destinos y flete', () => {
  it('entrega las regiones y las comunas de cada una sin pedir sesión', async () => {
    const regiones = (await obtener<Region[]>('/logistica/regiones')).cuerpo;
    expect(regiones).toHaveLength(16);
    expect(regiones[6]).toEqual({ idRegion: 7, nombre: 'Región Metropolitana' });

    const comunas = (await obtener<Comuna[]>('/logistica/comunas?region=7')).cuerpo;
    expect(comunas).toHaveLength(52);
    expect(comunas.map((c) => c.nombre)).toEqual([...comunas.map((c) => c.nombre)].sort((a, b) => a.localeCompare(b, 'es')));
    expect((await obtener<Comuna[]>('/logistica/comunas')).cuerpo).toEqual([]);
  });

  it('cotiza el flete según la zona de la comuna', async () => {
    expect((await enviar<CotizacionFlete>('/logistica/fletes/cotizar', { idComuna: providencia })).cuerpo).toEqual({ idComuna: providencia, valor: 3990 });
    expect((await enviar<CotizacionFlete>('/logistica/fletes/cotizar', { idComuna: temuco })).cuerpo.valor).toBe(7990);
    expect(await enviar<ErrorApi>('/logistica/fletes/cotizar', { idComuna: 999999 })).toEqual({
      status: 400,
      cuerpo: { codigo: 'DATOS_INVALIDOS', mensaje: 'La comuna no existe.' },
    });
  });
});

describe('compra web', () => {
  let compra: CheckoutResponse;
  let idPedido: number;

  it('el checkout reserva las unidades y deja la compra pendiente de pago', async () => {
    await db.query(`UPDATE pagos.medios_pago SET tasa_comision = 0.02 WHERE codigo = 'WEBPAY_DEBITO'`);
    const clave = randomUUID();
    const pedido = { claveIdempotencia: clave, lineas: [{ idVariante: EDDIE, cantidad: 1 }, { idVariante: EDDIE, cantidad: 1 }], despacho: despachoA(providencia) };

    const { status, cuerpo } = await enviar<CheckoutResponse>('/ventas/checkout', pedido, cliente);

    expect(status).toBe(201);
    expect(cuerpo).toEqual({
      idVenta: expect.any(Number),
      subtotal: 31980,
      flete: 3990,
      total: 35970,
      tokenPago: expect.stringMatching(/^SIM-/),
      expiraEn: expect.any(String),
    });
    const minutos = (new Date(cuerpo.expiraEn).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(14);
    expect(minutos).toBeLessThanOrEqual(15.1);
    compra = cuerpo;

    // Mientras se paga, las dos poleras ya no se ofrecen a otro comprador, pero siguen en la bodega.
    expect((await enCatalogo(EDDIE))!.disponible).toBe(9);
    expect(await estadoDeVenta(compra.idVenta)).toBe('PENDIENTE_PAGO');
    expect(await filas('SELECT cantidad, estado FROM inventario.reservas WHERE id_venta = $1', [compra.idVenta])).toEqual([{ cantidad: 2, estado: 'ACTIVA' }]);
    expect((await obtener<PedidoCliente[]>('/logistica/pedidos/mios', cliente)).cuerpo.some((p) => p.idVenta === compra.idVenta)).toBe(false);

    // Reenviar la misma solicitud responde la misma compra, sin reservar otra vez.
    expect((await enviar<CheckoutResponse>('/ventas/checkout', pedido, cliente)).cuerpo).toEqual(compra);
    expect((await enCatalogo(EDDIE))!.disponible).toBe(9);
  });

  it('el pago autorizado deja la venta pagada y crea el pedido', async () => {
    const { status, cuerpo } = await pagar(compra.tokenPago);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({
      estado: 'PAGADA',
      idVenta: compra.idVenta,
      total: 35970,
      idPedido: expect.any(Number),
      codigoAutorizacion: expect.stringMatching(/^\d{6}$/),
    });
    idPedido = cuerpo.idPedido!;
    expect(await estadoDeVenta(compra.idVenta)).toBe('PAGADA');
    expect(await filas('SELECT estado, expira_en FROM inventario.reservas WHERE id_venta = $1', [compra.idVenta])).toEqual([{ estado: 'CONFIRMADA', expira_en: null }]);
    expect(await filas('SELECT 1 FROM logistica.solicitudes_despacho WHERE id_venta = $1', [compra.idVenta])).toEqual([]);
    // La comisión del medio de pago queda calculada con la tasa vigente: 2% de $35.970.
    expect(
      await filas(
        `SELECT t.estado, m.codigo AS medio, t.comision, c.comision_pago, c.flete_cobrado
         FROM pagos.transacciones t JOIN pagos.medios_pago m USING (id_medio) JOIN ventas.costos_venta c USING (id_venta)
         WHERE t.id_venta = $1`,
        [compra.idVenta],
      ),
    ).toEqual([{ estado: 'AUTORIZADA', medio: 'WEBPAY_DEBITO', comision: 719, comision_pago: 719, flete_cobrado: 3990 }]);

    // Volver a informar el mismo pago, incluso como rechazado, responde lo ya resuelto.
    expect((await pagar(compra.tokenPago, false)).cuerpo).toEqual(cuerpo);
  });

  it('el cliente ve su pedido y el personal lo recibe para prepararlo', async () => {
    const [mio] = (await obtener<PedidoCliente[]>('/logistica/pedidos/mios', cliente)).cuerpo;
    expect(mio).toMatchObject({
      idPedido,
      idVenta: compra.idVenta,
      estado: 'PAGADO',
      destinatario: 'Cliente Demo',
      direccion: 'Av. Siempre Viva 742',
      comuna: 'Providencia',
      region: 'Región Metropolitana',
      flete: 3990,
      total: 35970,
      lineas: [{ idVariante: EDDIE, sku: 'RS-0007', producto: 'Polera Eddie', talla: 'M', color: 'Negro', cantidad: 2, precioUnitario: 15990 }],
    });
    expect(mio).not.toHaveProperty('trackingStarken');

    const enBodega = (await obtener<Pedido[]>('/logistica/pedidos?estado=PAGADO', bodega)).cuerpo.find((p) => p.idPedido === idPedido)!;
    expect(enBodega).toMatchObject({ destinatario: 'Cliente Demo', lineas: [{ idVariante: EDDIE, cantidad: 2 }] });
  });

  it('al despacharse, el cliente ve el código de seguimiento', async () => {
    const despacho = await enviar<Pedido>(`/logistica/pedidos/${idPedido}/despacho`, undefined, bodega);
    expect(despacho.status).toBe(200);

    const [mio] = (await obtener<PedidoCliente[]>('/logistica/pedidos/mios', cliente)).cuerpo;
    expect(mio).toMatchObject({ idPedido, estado: 'DESPACHADO', trackingStarken: `STK-${900_000 + idPedido}` });
    // Las dos poleras salieron de la bodega: quedan 7 ahí y 2 en la sala.
    expect((await enCatalogo(EDDIE))!.disponible).toBe(9);
    const eddie = (await obtener<VarianteStock>('/inventario/variantes/por-codigo/RS-0007', bodega)).cuerpo;
    expect(eddie.existencias).toEqual([
      { ubicacion: 'BODEGA', cantidad: 7 },
      { ubicacion: 'SALA_VENTAS', cantidad: 2 },
    ]);
    expect(eddie.reservado).toBe(0);
  });

  it('cada cliente ve solo sus pedidos', async () => {
    const otro = (await enviar<SesionResponse>('/usuarios/auth/registro', { nombre: 'Otro', email: `otro-${randomUUID().slice(0, 8)}@correo.cl`, password: 'guitarra-8', ...CONTACTO })).cuerpo;
    expect((await obtener<PedidoCliente[]>('/logistica/pedidos/mios', otro.accessToken)).cuerpo).toEqual([]);
    expect((await obtener('/logistica/pedidos', otro.accessToken)).status).toBe(403);
    expect((await obtener('/logistica/pedidos/mios', bodega)).status).toBe(403);
  });

  it('el flete depende de la comuna de despacho', async () => {
    const { cuerpo } = await comprar([{ idVariante: RAYO, cantidad: 1 }], cliente, { despacho: despachoA(temuco) });
    expect(cuerpo).toMatchObject({ subtotal: 14990, flete: 7990, total: 22980 });
    await pagar(cuerpo.tokenPago, false);
  });

  it('un pago rechazado libera la reserva y no crea pedido', async () => {
    const antes = (await enCatalogo(RAYO))!.disponible;
    const { cuerpo: pendiente } = await comprar([{ idVariante: RAYO, cantidad: 2 }]);
    expect((await enCatalogo(RAYO))!.disponible).toBe(antes - 2);

    const { cuerpo } = await pagar(pendiente.tokenPago, false);

    expect(cuerpo).toEqual({ estado: 'RECHAZADA', idVenta: pendiente.idVenta, total: pendiente.total, motivo: 'Pago rechazado por el banco (simulado).' });
    expect((await enCatalogo(RAYO))!.disponible).toBe(antes);
    expect(await estadoDeVenta(pendiente.idVenta)).toBe('RECHAZADA');
    expect(await filas('SELECT estado FROM inventario.reservas WHERE id_venta = $1', [pendiente.idVenta])).toEqual([{ estado: 'LIBERADA' }]);
    expect(await filas('SELECT 1 FROM logistica.pedidos WHERE id_venta = $1', [pendiente.idVenta])).toEqual([]);
    expect(await filas('SELECT 1 FROM logistica.solicitudes_despacho WHERE id_venta = $1', [pendiente.idVenta])).toEqual([]);
    // Un rechazo ya resuelto no se convierte en pago por reintentar.
    expect((await pagar(pendiente.tokenPago, true)).cuerpo.estado).toBe('RECHAZADA');
  });

  it('una compra que no se paga a tiempo expira y devuelve las unidades', async () => {
    const antes = (await enCatalogo(RAYO))!.disponible;
    const { cuerpo: lenta } = await comprar([{ idVariante: RAYO, cantidad: 1 }]);
    const { cuerpo: abandonada } = await comprar([{ idVariante: RAYO, cantidad: 1 }]);
    expect((await enCatalogo(RAYO))!.disponible).toBe(antes - 2);

    // Pasan 16 minutos para ambas.
    await db.query(`UPDATE pagos.transacciones SET creado_en = creado_en - interval '16 minutes' WHERE id_venta = ANY($1::bigint[])`, [[lenta.idVenta, abandonada.idVenta]]);
    await db.query(`UPDATE inventario.reservas SET expira_en = expira_en - interval '16 minutes' WHERE id_venta = ANY($1::bigint[])`, [[lenta.idVenta, abandonada.idVenta]]);
    expect((await enCatalogo(RAYO))!.disponible).toBe(antes);

    // Quien vuelve tarde de la pasarela no paga ni recibe pedido.
    expect((await pagar(lenta.tokenPago)).cuerpo).toEqual({ estado: 'EXPIRADA', idVenta: lenta.idVenta, total: lenta.total });
    expect(await estadoDeVenta(lenta.idVenta)).toBe('EXPIRADA');
    expect(await filas('SELECT 1 FROM logistica.pedidos WHERE id_venta = $1', [lenta.idVenta])).toEqual([]);

    // La que nadie retomó se cierra sola con la siguiente compra de cualquier cliente.
    const { cuerpo: siguiente } = await comprar([{ idVariante: RAYO, cantidad: 1 }]);
    expect(await estadoDeVenta(abandonada.idVenta)).toBe('EXPIRADA');
    expect(await filas('SELECT estado FROM inventario.reservas WHERE id_venta = $1', [abandonada.idVenta])).toEqual([{ estado: 'LIBERADA' }]);
    await pagar(siguiente.tokenPago, false);
    expect((await enCatalogo(RAYO))!.disponible).toBe(antes);
  });

  it('no inicia el pago si el carrito pide más de lo disponible, e indica qué ajustar', async () => {
    const disponible = (await enCatalogo(RAYO))!.disponible;

    const respuesta = await comprar<ErrorApi>([{ idVariante: RAYO, cantidad: disponible + 1 }, { idVariante: EDDIE, cantidad: 1 }]);

    expect(respuesta).toEqual({
      status: 409,
      cuerpo: {
        codigo: 'STOCK_INSUFICIENTE',
        mensaje: `Solo quedan ${disponible} unidades de Polera Rayo talla L.`,
        detalle: [{ idVariante: RAYO, producto: 'Polera Rayo', talla: 'L', disponible }],
      },
    });
    // No se reservó nada, tampoco la línea que sí tenía stock.
    expect((await enCatalogo(RAYO))!.disponible).toBe(disponible);
    expect((await enCatalogo(EDDIE))!.disponible).toBe(9);

    const agotado = await comprar<ErrorApi>([{ idVariante: 5, cantidad: 1 }]);
    expect(agotado.cuerpo.mensaje).toBe('Polerón Banda Tour talla XL ya no está disponible.');
  });

  it('no vende lo que el personal no puede sacar: respeta lo reservado por otros pedidos', async () => {
    // La Polera Calavera L tiene 10 unidades, 3 de ellas comprometidas.
    const respuesta = await comprar<ErrorApi>([{ idVariante: 2, cantidad: 8 }]);
    expect(respuesta.status).toBe(409);
    expect(respuesta.cuerpo.detalle).toEqual([{ idVariante: 2, producto: 'Polera Calavera', talla: 'L', disponible: 7 }]);
  });

  it('rechaza un carrito o un despacho con datos incompletos', async () => {
    const mensaje = async (lineas: unknown, extra: object = {}) =>
      (await comprar<ErrorApi>(lineas as { idVariante: number; cantidad: number }[], cliente, extra)).cuerpo.mensaje;

    expect(await mensaje([])).toBe('El carrito está vacío.');
    expect(await mensaje([{ idVariante: EDDIE, cantidad: 0 }])).toBe('Cada línea del carrito necesita una variante y una cantidad mayor que cero.');
    expect(await mensaje([{ idVariante: EDDIE, cantidad: 1 }], { despacho: { ...despachoA(providencia), direccion: ' ' } })).toBe('Falta la dirección de despacho.');
    expect(await mensaje([{ idVariante: EDDIE, cantidad: 1 }], { despacho: { ...despachoA(providencia), telefono: '' } })).toBe('Falta el teléfono de contacto.');
    expect(await mensaje([{ idVariante: EDDIE, cantidad: 1 }], { despacho: despachoA(999999) })).toBe('La comuna no existe.');
    expect(await mensaje([{ idVariante: EDDIE, cantidad: 1 }], { claveIdempotencia: '' })).toBe('Falta la clave de idempotencia.');

    expect((await comprar<ErrorApi>([{ idVariante: 999999, cantidad: 1 }])).status).toBe(404);
    expect((await comprar<ErrorApi>([{ idVariante: 6, cantidad: 1 }])).cuerpo.codigo).toBe('VARIANTE_INACTIVA');
    expect((await enCatalogo(EDDIE))!.disponible).toBe(9);
  });

  it('comprar exige una sesión de Cliente', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1 }];
    expect((await enviar('/ventas/checkout', { claveIdempotencia: randomUUID(), lineas, despacho: despachoA(providencia) })).status).toBe(401);
    expect((await comprar<ErrorApi>(lineas, bodega)).status).toBe(403);
    expect((await comprar<ErrorApi>(lineas, gerente)).status).toBe(403);
  });

  it('informa un pago que no existe', async () => {
    expect(await enviar<ErrorApi>('/pagos/webpay/retorno', { tokenPago: 'SIM-no-existe' })).toEqual({
      status: 404,
      cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'El pago no existe.' },
    });
    expect((await enviar<ErrorApi>('/pagos/webpay/retorno', {})).cuerpo.mensaje).toBe('Falta el token del pago.');
  });

  it('dos clientes que compran a la vez las últimas unidades no las venden dos veces', async () => {
    const disponible = (await enCatalogo(RAYO))!.disponible;
    const otro = (await enviar<SesionResponse>('/usuarios/auth/registro', { nombre: 'Rival', email: `rival-${randomUUID().slice(0, 8)}@correo.cl`, password: 'guitarra-8', ...CONTACTO })).cuerpo.accessToken;

    const respuestas = await Promise.all([
      comprar<CheckoutResponse | ErrorApi>([{ idVariante: RAYO, cantidad: disponible }], cliente),
      comprar<CheckoutResponse | ErrorApi>([{ idVariante: RAYO, cantidad: disponible }], otro),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await enCatalogo(RAYO))!.disponible).toBe(0);
    await pagar((respuestas.find((r) => r.status === 201)!.cuerpo as CheckoutResponse).tokenPago, false);
    expect((await enCatalogo(RAYO))!.disponible).toBe(disponible);
  });
});

describe('perfil del cliente', () => {
  it('cada cuenta ve sus propios datos, leídos de la base', async () => {
    const email = `perfil-${randomUUID().slice(0, 8)}@correo.cl`;
    const antes = Date.now();
    const sesion = (await enviar<SesionResponse>('/usuarios/auth/registro', { nombre: 'Ana Perfil', email, password: 'guitarra-8', ...CONTACTO })).cuerpo;

    const { status, cuerpo } = await obtener<PerfilUsuario>('/usuarios/yo', sesion.accessToken);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({
      id: sesion.usuario.id,
      nombre: 'Ana Perfil',
      email,
      rol: 'CLIENTE',
      creadoEn: expect.any(String),
      telefono: '+56912345678',
      direccion: 'Av. Siempre Viva 742, Providencia',
    });
    expect(new Date(cuerpo.creadoEn).getTime()).toBeGreaterThanOrEqual(antes - 5000);
    // No entrega la contraseña ni su hash.
    expect(JSON.stringify(cuerpo)).not.toMatch(/hash|contrasena|password/i);

    // Las cuentas del personal y las anteriores no tienen teléfono ni dirección.
    expect((await obtener<PerfilUsuario>('/usuarios/yo', bodega)).cuerpo).toMatchObject({ email: 'bodega@rockstar.cl', rol: 'BODEGA', telefono: null, direccion: null });
    expect((await obtener('/usuarios/yo')).status).toBe(401);
  });

  it('una cuenta desactivada deja de ver su perfil aunque su token siga vigente', async () => {
    const sesion = (await enviar<SesionResponse>('/usuarios/auth/registro', { nombre: 'Baja', email: `baja-${randomUUID().slice(0, 8)}@correo.cl`, password: 'guitarra-8', ...CONTACTO })).cuerpo;
    await db.query('UPDATE usuarios.usuarios SET activo = false WHERE id_usuario = $1', [sesion.usuario.id]);
    expect((await obtener('/usuarios/yo', sesion.accessToken)).status).toBe(401);
  });

  it('lista las compras que esperan pago, con lo necesario para retomarlas', async () => {
    const comprador = (await enviar<SesionResponse>('/usuarios/auth/registro', { nombre: 'Comprador', email: `comprador-${randomUUID().slice(0, 8)}@correo.cl`, password: 'guitarra-8', ...CONTACTO })).cuerpo.accessToken;
    const pendientes = async (token = comprador) => (await obtener<CompraPendiente[]>('/ventas/pendientes', token)).cuerpo;
    expect(await pendientes()).toEqual([]);

    const primera = (await comprar([{ idVariante: EDDIE, cantidad: 2 }], comprador)).cuerpo;
    const segunda = (await comprar([{ idVariante: EDDIE, cantidad: 1 }], comprador, { despacho: despachoA(temuco) })).cuerpo;

    const lista = await pendientes();
    // La más reciente primero.
    expect(lista.map((c) => c.idVenta)).toEqual([segunda.idVenta, primera.idVenta]);
    expect(lista[1]).toEqual({
      ...primera,
      fecha: expect.any(String),
      destinatario: 'Cliente Demo',
      direccion: 'Av. Siempre Viva 742',
      comuna: 'Providencia',
      region: 'Región Metropolitana',
      lineas: [{ idVariante: EDDIE, sku: 'RS-0007', producto: 'Polera Eddie', talla: 'M', color: 'Negro', cantidad: 2, precioUnitario: 15990 }],
    });
    expect(lista[0]).toMatchObject({ comuna: 'Temuco', flete: 7990, total: 15990 + 7990 });

    // Cada cliente ve solo las suyas, y el personal no tiene compras.
    expect(await pendientes(cliente)).toEqual([]);
    expect((await obtener('/ventas/pendientes', bodega)).status).toBe(403);
    expect((await obtener('/ventas/pendientes')).status).toBe(401);

    // Pagada, deja de estar pendiente y pasa a ser un pedido; rechazada, simplemente sale.
    await pagar(primera.tokenPago);
    expect((await pendientes()).map((c) => c.idVenta)).toEqual([segunda.idVenta]);
    expect((await obtener<PedidoCliente[]>('/logistica/pedidos/mios', comprador)).cuerpo.map((p) => p.idVenta)).toEqual([primera.idVenta]);

    // Vencido el plazo deja de listarse, aunque todavía nadie la haya cerrado.
    await db.query(`UPDATE pagos.transacciones SET creado_en = creado_en - interval '16 minutes' WHERE id_venta = $1`, [segunda.idVenta]);
    expect(await pendientes()).toEqual([]);
    await pagar(segunda.tokenPago);
  });
});

describe('historial de movimientos', () => {
  it('Bodega y Gerente consultan los movimientos, del más reciente al más antiguo y por tipo', async () => {
    const merma = await enviar('/inventario/movimientos/mermas', { claveIdempotencia: randomUUID(), idVariante: EDDIE, ubicacion: 'BODEGA', cantidad: 1, tipoMerma: 'DANADO', motivo: 'Costura rota' }, bodega);
    expect(merma.status).toBe(201);

    const { status, cuerpo } = await obtener<Movimiento[]>('/inventario/movimientos?tipo=MERMA', gerente);
    expect(status).toBe(200);
    expect(cuerpo.every((m) => m.tipo === 'MERMA')).toBe(true);
    expect(cuerpo[0]).toMatchObject({ idVariante: EDDIE, tipo: 'MERMA', tipoMerma: 'DANADO', ubicacion: 'BODEGA', cantidad: 1, motivo: 'Costura rota' });

    const todos = (await obtener<Movimiento[]>('/inventario/movimientos', bodega)).cuerpo;
    expect(todos.map((m) => m.idMovimiento)).toEqual([...todos.map((m) => m.idMovimiento)].sort((a, b) => b - a));
    expect(new Set(todos.map((m) => m.tipo)).size).toBeGreaterThan(1);
    expect((await obtener('/inventario/movimientos', cliente)).status).toBe(403);
  });
});
