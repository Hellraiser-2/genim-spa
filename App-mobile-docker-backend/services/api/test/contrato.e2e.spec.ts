import { randomUUID } from 'node:crypto';

import type {
  Busqueda,
  Categoria,
  ErrorApi,
  Pedido,
  ProductoNuevoRequest,
  ResultadoMovimientos,
  SesionResponse,
  Ubicacion,
  VarianteStock,
} from '@rockstar/contracts';
import { beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * Pruebas del contrato que usa la app de bodega, por HTTP contra la API en ejecución.
 * No suponen una base recién creada: lo que modifican son productos que ellas mismas
 * crean, de modo que también pueden correr contra la base de `docker compose`.
 */

const apiUrl = inject('apiUrl');
const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

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

async function iniciarSesion(email: string, password: string): Promise<SesionResponse> {
  const { status, cuerpo } = await llamar<SesionResponse>('POST', '/usuarios/auth/login', { email, password });
  expect(status).toBe(200);
  return cuerpo;
}

const existencia = (variante: VarianteStock, ubicacion: Ubicacion) =>
  variante.existencias.find((e) => e.ubicacion === ubicacion)!.cantidad;

let bodega: string;
let vendedor: string;

const obtener = <T>(ruta: string, token = bodega) => llamar<T>('GET', ruta, undefined, token);
const enviar = <T>(ruta: string, cuerpo: unknown, token = bodega) => llamar<T>('POST', ruta, cuerpo, token);

/** Crea un producto propio de la prueba, con nombre irrepetible. */
async function crearProducto(datos: Partial<ProductoNuevoRequest> = {}): Promise<VarianteStock> {
  const { status, cuerpo } = await enviar<VarianteStock>('/inventario/productos', {
    claveIdempotencia: randomUUID(),
    nombre: `Polera Prueba ${randomUUID().slice(0, 8)}`,
    categoria: 'Poleras',
    banda: 'Metallica',
    talla: 'M',
    color: 'Negro',
    cantidad: 10,
    ubicacion: 'BODEGA',
    imagen: FOTO,
    ...datos,
  });
  expect(status).toBe(201);
  return cuerpo;
}

beforeAll(async () => {
  bodega = (await iniciarSesion('bodega@rockstar.cl', 'bodega123')).accessToken;
  vendedor = (await iniciarSesion('vendedor@rockstar.cl', 'vendedor123')).accessToken;
});

describe('sesión', () => {
  it('responde la verificación de vida sin pedir sesión', async () => {
    expect(await llamar('GET', '/salud')).toEqual({ status: 200, cuerpo: { estado: 'ok' } });
  });

  it('inicia sesión con el correo sin importar mayúsculas ni espacios', async () => {
    const sesion = await iniciarSesion('  Bodega@Rockstar.CL ', 'bodega123');
    expect(sesion.usuario).toEqual({ id: 1, nombre: 'Bodega Demo', email: 'bodega@rockstar.cl', rol: 'BODEGA' });
    expect(sesion.accessToken.split('.')).toHaveLength(3);
    expect(sesion.refreshToken).not.toBe('');
  });

  it('rechaza igual una contraseña incorrecta y un correo que no existe', async () => {
    const mala = await llamar<ErrorApi>('POST', '/usuarios/auth/login', { email: 'bodega@rockstar.cl', password: 'otra' });
    const inexistente = await llamar<ErrorApi>('POST', '/usuarios/auth/login', { email: 'nadie@rockstar.cl', password: 'x' });
    expect(mala).toEqual({ status: 401, cuerpo: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña no válidos.' } });
    expect(inexistente).toEqual(mala);
  });

  it('rechaza un cuerpo sin datos', async () => {
    expect((await llamar<ErrorApi>('POST', '/usuarios/auth/login', {})).cuerpo.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('exige sesión en las rutas protegidas', async () => {
    const sinToken = await llamar<ErrorApi>('GET', '/inventario/variantes');
    const tokenFalso = await llamar<ErrorApi>('GET', '/inventario/variantes', undefined, 'no-es-un-token');
    expect(sinToken).toEqual({ status: 401, cuerpo: { codigo: 'SESION_INVALIDA', mensaje: 'La sesión no es válida.' } });
    expect(tokenFalso).toEqual(sinToken);
  });

  it('renueva la sesión y deja sin efecto el token de refresco usado', async () => {
    const sesion = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
    const renovada = await llamar<SesionResponse>('POST', '/usuarios/auth/refresh', { refreshToken: sesion.refreshToken });
    expect(renovada.status).toBe(200);
    expect(renovada.cuerpo.refreshToken).not.toBe(sesion.refreshToken);
    expect((await obtener('/inventario/bandas', renovada.cuerpo.accessToken)).status).toBe(200);

    const repetida = await llamar<ErrorApi>('POST', '/usuarios/auth/refresh', { refreshToken: sesion.refreshToken });
    expect(repetida).toEqual({ status: 401, cuerpo: { codigo: 'SESION_INVALIDA', mensaje: 'La sesión no es válida.' } });
  });

  it('al cerrar sesión el token de refresco deja de ser aceptado', async () => {
    const sesion = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
    expect(await llamar('POST', '/usuarios/auth/logout', { refreshToken: sesion.refreshToken })).toEqual({ status: 200, cuerpo: {} });
    expect((await llamar('POST', '/usuarios/auth/refresh', { refreshToken: sesion.refreshToken })).status).toBe(401);
  });
});

describe('control por rol', () => {
  it('el vendedor consulta stock pero no registra ingresos ni crea productos', async () => {
    expect((await obtener('/inventario/variantes', vendedor)).status).toBe(200);
    const ingreso = await enviar<ErrorApi>('/inventario/movimientos/ingresos', { claveIdempotencia: randomUUID() }, vendedor);
    expect(ingreso).toEqual({
      status: 403,
      cuerpo: { codigo: 'ACCESO_DENEGADO', mensaje: 'El rol no tiene permiso para esta operación.' },
    });
    expect((await enviar('/inventario/productos', {}, vendedor)).status).toBe(403);
  });

  it('el cliente no entra a ninguna ruta del personal', async () => {
    const cliente = (await iniciarSesion('cliente@rockstar.cl', 'cliente123')).accessToken;
    expect((await obtener('/inventario/variantes', cliente)).status).toBe(403);
    expect((await obtener('/logistica/pedidos', cliente)).status).toBe(403);
  });
});

describe('consulta de stock', () => {
  it('lista todas las variantes con existencias, reservas y disponible', async () => {
    const { status, cuerpo } = await obtener<VarianteStock[]>('/inventario/variantes?q=');
    expect(status).toBe(200);
    expect(cuerpo.length).toBeGreaterThanOrEqual(8);
    const calaveraL = cuerpo.find((v) => v.sku === 'RS-0002')!;
    expect(calaveraL).toMatchObject({
      idVariante: 2,
      codigo: '7800000000002',
      producto: 'Polera Calavera',
      categoria: 'Poleras',
      banda: 'Misfits',
      imagenUrl: 'assets/prendas/polera-calavera.jpg',
      codigoUbicacion: 'B-POL-01',
      talla: 'L',
      color: 'Negro',
      activo: true,
      reservado: 3,
    });
    // Disponible es lo que hay en ambas ubicaciones menos lo comprometido en pedidos.
    expect(calaveraL.disponible).toBe(existencia(calaveraL, 'BODEGA') + existencia(calaveraL, 'SALA_VENTAS') - 3);
    expect(cuerpo.find((v) => v.sku === 'RS-0006')!.activo).toBe(false);
    expect(cuerpo.find((v) => v.sku === 'RS-0003')!.banda).toBeNull();
  });

  it('busca por nombre, categoría, banda o SKU sin distinguir mayúsculas', async () => {
    const skus = async (q: string) =>
      (await obtener<VarianteStock[]>(`/inventario/variantes?q=${encodeURIComponent(q)}`)).cuerpo.map((v) => v.sku);
    expect(await skus('CALAVERA')).toEqual(expect.arrayContaining(['RS-0001', 'RS-0002']));
    expect(await skus('pantalones')).toContain('RS-0004');
    expect(await skus('iron maiden')).toContain('RS-0007');
    expect(await skus('rs-0008')).toEqual(['RS-0008']);
    expect(await skus('%')).toEqual([]);
  });

  it('busca por el código del espacio de bodega, que es lo que lleva su etiqueta QR', async () => {
    const { cuerpo } = await obtener<VarianteStock[]>('/inventario/variantes?q=b-pol-01');
    expect(cuerpo.map((v) => [v.sku, v.codigoUbicacion])).toEqual([
      ['RS-0001', 'B-POL-01'],
      ['RS-0002', 'B-POL-01'],
    ]);
  });

  it('encuentra una variante por el código escaneado o por su SKU', async () => {
    const porCodigo = await obtener<VarianteStock>('/inventario/variantes/por-codigo/7800000000001');
    const porSku = await obtener<VarianteStock>('/inventario/variantes/por-codigo/RS-0001');
    expect(porCodigo.status).toBe(200);
    expect(porCodigo.cuerpo.sku).toBe('RS-0001');
    expect(porSku.cuerpo).toEqual(porCodigo.cuerpo);
  });

  it('informa cuando el código no está registrado', async () => {
    expect(await obtener('/inventario/variantes/por-codigo/0000')).toEqual({
      status: 404,
      cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'El código no está registrado.' },
    });
  });
});

describe('catálogos', () => {
  it('cada categoría define sus tallas y si usa banda', async () => {
    const { cuerpo } = await obtener<Categoria[]>('/inventario/categorias');
    expect(cuerpo.find((c) => c.nombre === 'Pantalones')).toEqual({
      nombre: 'Pantalones',
      tallas: ['38', '40', '42', '44', '46', '48', '50'],
      usaBanda: false,
    });
    expect(cuerpo.find((c) => c.nombre === 'Poleras')).toEqual({
      nombre: 'Poleras',
      tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      usaBanda: true,
    });
    const nombres = cuerpo.map((c) => c.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('una categoría nueva nace con tallas XS a XXL y admite banda', async () => {
    const nombre = `Gorros ${randomUUID().slice(0, 8)}`;
    const { status, cuerpo } = await enviar<Categoria[]>('/inventario/categorias', { nombre: `  ${nombre} ` });
    expect(status).toBe(201);
    expect(cuerpo.find((c) => c.nombre === nombre)).toEqual({ nombre, tallas: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], usaBanda: true });
  });

  it('registrar una banda que ya existe conserva la existente, sin distinguir tildes ni mayúsculas', async () => {
    const antes = (await obtener<string[]>('/inventario/bandas')).cuerpo;
    const { cuerpo } = await enviar<string[]>('/inventario/bandas', { nombre: 'METÁLLICA' });
    expect(cuerpo).toEqual(antes);
    expect(cuerpo).toContain('Metallica');
  });

  it('registra bandas y colores nuevos sin necesidad de un producto', async () => {
    const banda = `Banda ${randomUUID().slice(0, 8)}`;
    const color = `Color ${randomUUID().slice(0, 8)}`;
    expect((await enviar<string[]>('/inventario/bandas', { nombre: banda })).cuerpo).toContain(banda);
    expect((await enviar<string[]>('/inventario/colores', { nombre: color })).cuerpo).toContain(color);
    expect((await obtener<string[]>('/inventario/colores')).cuerpo).toContain(color);
  });

  it('rechaza un nombre vacío', async () => {
    expect(await enviar('/inventario/colores', { nombre: '   ' })).toEqual({
      status: 400,
      cuerpo: { codigo: 'DATOS_INVALIDOS', mensaje: 'El nombre es obligatorio.' },
    });
  });
});

describe('alta de productos', () => {
  it('crea el producto con su SKU, código, ubicación y el ingreso de sus primeras unidades', async () => {
    const creada = await crearProducto({ cantidad: 7, ubicacion: 'SALA_VENTAS' });
    expect(creada.sku).toBe(`RS-${String(creada.idVariante).padStart(4, '0')}`);
    expect(creada.codigo).toBe(`780000000${String(creada.idVariante).padStart(4, '0')}`);
    expect(creada.codigoUbicacion).toMatch(/^B-POL-\d{2,}$/);
    expect(creada).toMatchObject({ categoria: 'Poleras', banda: 'Metallica', imagenUrl: FOTO, activo: true, reservado: 0, disponible: 7 });
    expect(creada.existencias).toEqual([
      { ubicacion: 'BODEGA', cantidad: 0 },
      { ubicacion: 'SALA_VENTAS', cantidad: 7 },
    ]);
    expect((await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${creada.codigo}`)).cuerpo).toEqual(creada);
  });

  it('otra talla del mismo producto comparte su ubicación, banda y foto', async () => {
    const primera = await crearProducto();
    const segunda = await crearProducto({
      nombre: primera.producto.toUpperCase(),
      talla: 'L',
      banda: 'AC/DC',
      imagen: 'data:image/png;base64,AAAA',
    });
    expect(segunda.idVariante).not.toBe(primera.idVariante);
    expect(segunda).toMatchObject({
      producto: primera.producto,
      codigoUbicacion: primera.codigoUbicacion,
      banda: 'Metallica',
      imagenUrl: FOTO,
      talla: 'L',
    });
  });

  it('rechaza la misma talla y color de un producto que ya los tiene', async () => {
    const primera = await crearProducto();
    const repetida = await enviar<ErrorApi>('/inventario/productos', {
      claveIdempotencia: randomUUID(),
      nombre: primera.producto,
      categoria: 'Poleras',
      banda: null,
      talla: 'm',
      color: 'NEGRO',
      cantidad: 1,
      ubicacion: 'BODEGA',
      imagen: FOTO,
    });
    expect(repetida).toEqual({ status: 409, cuerpo: { codigo: 'VARIANTE_DUPLICADA', mensaje: 'La variante ya existe.' } });
  });

  it('una categoría sin banda ignora la banda enviada y admite una talla nueva', async () => {
    const talla = `T${randomUUID().slice(0, 6)}`;
    const jeans = await crearProducto({ categoria: 'Pantalones', banda: 'Metallica', talla });
    expect(jeans.banda).toBeNull();
    expect(jeans.codigoUbicacion).toMatch(/^B-PAN-/);
    const pantalones = (await obtener<Categoria[]>('/inventario/categorias')).cuerpo.find((c) => c.nombre === 'Pantalones')!;
    expect(pantalones.tallas.at(-1)).toBe(talla);
  });

  it('reenviar la misma clave no crea el producto dos veces', async () => {
    const datos = {
      claveIdempotencia: randomUUID(),
      nombre: `Polera Reintento ${randomUUID().slice(0, 8)}`,
      categoria: 'Poleras',
      banda: null,
      talla: 'S',
      color: 'Negro',
      cantidad: 4,
      ubicacion: 'BODEGA',
      imagen: FOTO,
    };
    const primera = await enviar<VarianteStock>('/inventario/productos', datos);
    const segunda = await enviar<VarianteStock>('/inventario/productos', datos);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(existencia(segunda.cuerpo, 'BODEGA')).toBe(4);
  });

  it.each([
    [{ nombre: ' ' }, 'El nombre es obligatorio.'],
    [{ talla: '' }, 'La talla es obligatoria.'],
    [{ imagen: 'http://ejemplo/foto.jpg' }, 'La imagen es obligatoria.'],
    [{ cantidad: 0 }, 'La cantidad debe ser un entero mayor que cero.'],
    [{ ubicacion: 'PATIO' }, 'La ubicación no es válida.'],
    [{ claveIdempotencia: '' }, 'Falta la clave de idempotencia.'],
  ])('valida los datos del producto: %j', async (cambio, mensaje) => {
    const respuesta = await enviar<ErrorApi>('/inventario/productos', {
      claveIdempotencia: randomUUID(),
      nombre: 'Polera Inválida',
      categoria: 'Poleras',
      banda: null,
      talla: 'M',
      color: 'Negro',
      cantidad: 1,
      ubicacion: 'BODEGA',
      imagen: FOTO,
      ...cambio,
    });
    expect(respuesta).toEqual({ status: 400, cuerpo: { codigo: 'DATOS_INVALIDOS', mensaje } });
  });
});

describe('edición de productos', () => {
  const editar = <T = VarianteStock>(idVariante: number, cambios: unknown, token = bodega) =>
    llamar<T>('PATCH', `/inventario/variantes/${idVariante}`, cambios, token);
  const OTRA_FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

  it('cambia el nombre, la banda, la talla, el color y la foto de una prenda', async () => {
    const original = await crearProducto({ cantidad: 6 });
    const nombre = `Polera Editada ${randomUUID().slice(0, 8)}`;

    const { status, cuerpo } = await editar(original.idVariante, { nombre: `  ${nombre} `, banda: 'Slayer', talla: 'XL', color: 'Rojo', imagen: OTRA_FOTO });

    expect(status).toBe(200);
    expect(cuerpo).toEqual({ ...original, producto: nombre, banda: 'Slayer', talla: 'XL', color: 'Rojo', imagenUrl: OTRA_FOTO });
    // Lo que identifica a la prenda y su stock no cambian con la edición.
    expect(cuerpo).toMatchObject({ sku: original.sku, codigo: original.codigo, codigoUbicacion: original.codigoUbicacion, disponible: 6 });
    expect((await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${original.sku}`)).cuerpo).toEqual(cuerpo);
    expect((await obtener<string[]>('/inventario/colores')).cuerpo).toContain('Rojo');
  });

  it('solo cambia los campos enviados', async () => {
    const original = await crearProducto({ banda: 'Metallica', talla: 'S' });

    const { cuerpo } = await editar(original.idVariante, { color: 'Negro' });
    expect(cuerpo).toEqual(original);
    expect((await editar(original.idVariante, { banda: null })).cuerpo).toEqual({ ...original, banda: null });
  });

  it('el nombre, la banda y la foto cambian para todas las tallas del producto', async () => {
    const m = await crearProducto({ talla: 'M' });
    const l = await crearProducto({ nombre: m.producto, talla: 'L' });
    const nombre = `Polera Renombrada ${randomUUID().slice(0, 8)}`;

    await editar(m.idVariante, { nombre, banda: 'Iron Maiden', imagen: OTRA_FOTO, talla: 'S' });

    const otraTalla = (await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${l.sku}`)).cuerpo;
    // La otra talla conserva lo suyo y recibe lo que es del producto.
    expect(otraTalla).toEqual({ ...l, producto: nombre, banda: 'Iron Maiden', imagenUrl: OTRA_FOTO });
  });

  it('al cambiar de categoría recibe un espacio en la zona nueva y pierde la banda si no corresponde', async () => {
    const talla = `T${randomUUID().slice(0, 6)}`;
    const polera = await crearProducto({ banda: 'Metallica', talla });
    expect(polera.codigoUbicacion).toMatch(/^B-POL-/);

    const { cuerpo } = await editar(polera.idVariante, { categoria: 'pantalones', banda: 'Slayer' });

    expect(cuerpo).toMatchObject({ categoria: 'Pantalones', banda: null, talla });
    expect(cuerpo.codigoUbicacion).toMatch(/^B-PAN-\d+$/);
    // La talla que traía pasa a ser una talla de su categoría nueva.
    const pantalones = (await obtener<Categoria[]>('/inventario/categorias')).cuerpo.find((c) => c.nombre === 'Pantalones')!;
    expect(pantalones.tallas).toContain(talla);

    // Repetir la misma categoría no lo mueve otra vez.
    expect((await editar(polera.idVariante, { categoria: 'Pantalones' })).cuerpo.codigoUbicacion).toBe(cuerpo.codigoUbicacion);
  });

  it('no admite el nombre de otro producto ni una talla y color que el producto ya tiene', async () => {
    const uno = await crearProducto({ talla: 'M' });
    const otro = await crearProducto({ talla: 'M' });
    const hermana = await crearProducto({ nombre: uno.producto, talla: 'L' });

    expect(await editar<ErrorApi>(otro.idVariante, { nombre: uno.producto.toUpperCase(), color: 'Rojo' })).toEqual({
      status: 409,
      cuerpo: { codigo: 'PRODUCTO_DUPLICADO', mensaje: 'Ya existe otro producto con ese nombre.' },
    });
    expect(await editar<ErrorApi>(hermana.idVariante, { banda: 'Slayer', talla: 'M' })).toEqual({
      status: 409,
      cuerpo: { codigo: 'VARIANTE_DUPLICADA', mensaje: 'El producto ya tiene esa talla y color.' },
    });
    // Un rechazo no deja cambios a medias: ni el color ni la banda quedaron aplicados.
    expect((await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${otro.sku}`)).cuerpo).toEqual(otro);
    expect((await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${hermana.sku}`)).cuerpo).toEqual(hermana);

    // Cambiar solo mayúsculas del propio nombre sí se puede.
    expect((await editar(uno.idVariante, { nombre: uno.producto.toUpperCase() })).cuerpo.producto).toBe(uno.producto.toUpperCase());
  });

  it.each([
    [{ nombre: ' ' }, 'El nombre es obligatorio.'],
    [{ categoria: '' }, 'La categoría es obligatoria.'],
    [{ talla: ' ' }, 'La talla es obligatoria.'],
    [{ color: '' }, 'El color es obligatorio.'],
    [{ imagen: 'http://ejemplo/foto.jpg' }, 'La imagen no es válida.'],
    [{}, 'No hay cambios que aplicar.'],
    [{ precio: 100 }, 'No hay cambios que aplicar.'],
  ])('valida los datos de la edición: %j', async (cambio, mensaje) => {
    const { idVariante } = await crearProducto();
    expect(await editar<ErrorApi>(idVariante, cambio)).toEqual({ status: 400, cuerpo: { codigo: 'DATOS_INVALIDOS', mensaje } });
  });

  it('solo Bodega y Gerente editan productos', async () => {
    const { idVariante } = await crearProducto();
    expect((await editar<ErrorApi>(idVariante, { color: 'Rojo' }, vendedor)).status).toBe(403);
    expect((await llamar('PATCH', `/inventario/variantes/${idVariante}`, { color: 'Rojo' })).status).toBe(401);
    expect((await editar<ErrorApi>(999999, { color: 'Rojo' })).status).toBe(404);
  });
});

describe('movimientos', () => {
  it('un ingreso suma a la ubicación y deja un movimiento por prenda', async () => {
    const a = await crearProducto({ cantidad: 2 });
    const b = await crearProducto({ cantidad: 5 });
    const { status, cuerpo } = await enviar<ResultadoMovimientos>('/inventario/movimientos/ingresos', {
      claveIdempotencia: randomUUID(),
      ubicacion: 'SALA_VENTAS',
      lineas: [
        { idVariante: b.idVariante, cantidad: 3 },
        { idVariante: a.idVariante, cantidad: 1 },
      ],
    });
    expect(status).toBe(201);
    expect(cuerpo.movimientos.map((m) => [m.idVariante, m.tipo, m.ubicacion, m.cantidad, m.motivo, m.idUsuario])).toEqual([
      [b.idVariante, 'INGRESO', 'SALA_VENTAS', 3, 'Ingreso de mercadería', 1],
      [a.idVariante, 'INGRESO', 'SALA_VENTAS', 1, 'Ingreso de mercadería', 1],
    ]);
    // Las variantes vuelven en el orden del ingreso, con el stock ya actualizado.
    expect(cuerpo.variantes.map((v) => [v.idVariante, existencia(v, 'BODEGA'), existencia(v, 'SALA_VENTAS'), v.disponible])).toEqual([
      [b.idVariante, 5, 3, 8],
      [a.idVariante, 2, 1, 3],
    ]);
  });

  it('reenviar un ingreso con la misma clave no lo duplica', async () => {
    const { idVariante } = await crearProducto({ cantidad: 1 });
    const ingreso = { claveIdempotencia: randomUUID(), ubicacion: 'BODEGA', motivo: 'Reposición', lineas: [{ idVariante, cantidad: 4 }] };
    const primera = await enviar<ResultadoMovimientos>('/inventario/movimientos/ingresos', ingreso);
    const segunda = await enviar<ResultadoMovimientos>('/inventario/movimientos/ingresos', ingreso);
    expect(segunda.cuerpo).toEqual(primera.cuerpo);
    expect(existencia(segunda.cuerpo.variantes[0]!, 'BODEGA')).toBe(5);
    expect(segunda.cuerpo.movimientos).toHaveLength(1);
  });

  it('un ingreso con una línea no válida no registra ninguna', async () => {
    const { idVariante, codigo } = await crearProducto({ cantidad: 2 });
    const cantidadMala = await enviar<ErrorApi>('/inventario/movimientos/ingresos', {
      claveIdempotencia: randomUUID(),
      ubicacion: 'BODEGA',
      lineas: [
        { idVariante, cantidad: 5 },
        { idVariante, cantidad: 1.5 },
      ],
    });
    const varianteInexistente = await enviar<ErrorApi>('/inventario/movimientos/ingresos', {
      claveIdempotencia: randomUUID(),
      ubicacion: 'BODEGA',
      lineas: [
        { idVariante, cantidad: 5 },
        { idVariante: 99_999_999, cantidad: 1 },
      ],
    });
    expect(cantidadMala.cuerpo).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: 'La cantidad debe ser un entero mayor que cero.' });
    expect(varianteInexistente).toEqual({ status: 404, cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'La variante no existe.' } });
    expect(existencia((await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${codigo}`)).cuerpo, 'BODEGA')).toBe(2);
  });

  it('un producto desactivado no admite movimientos', async () => {
    const respuesta = await enviar<ErrorApi>('/inventario/movimientos/ingresos', {
      claveIdempotencia: randomUUID(),
      ubicacion: 'BODEGA',
      lineas: [{ idVariante: 6, cantidad: 1 }],
    });
    expect(respuesta).toEqual({ status: 409, cuerpo: { codigo: 'VARIANTE_INACTIVA', mensaje: 'El producto está desactivado.' } });
  });

  it('una merma descuenta de la ubicación y exige tipo y motivo', async () => {
    const { idVariante } = await crearProducto({ cantidad: 6 });
    const merma = { claveIdempotencia: randomUUID(), idVariante, ubicacion: 'BODEGA', cantidad: 2, tipoMerma: 'DANADO', motivo: ' Costura rota ' };

    const sinMotivo = await enviar<ErrorApi>('/inventario/movimientos/mermas', { ...merma, motivo: ' ' });
    const sinTipo = await enviar<ErrorApi>('/inventario/movimientos/mermas', { ...merma, tipoMerma: 'ROBO' });
    expect(sinMotivo.cuerpo).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: 'El motivo es obligatorio.' });
    expect(sinTipo.cuerpo).toEqual({ codigo: 'DATOS_INVALIDOS', mensaje: 'El tipo de merma no es válido.' });

    const { status, cuerpo } = await enviar<ResultadoMovimientos>('/inventario/movimientos/mermas', merma);
    expect(status).toBe(201);
    expect(cuerpo.movimientos[0]).toMatchObject({ tipo: 'MERMA', tipoMerma: 'DANADO', ubicacion: 'BODEGA', cantidad: 2, motivo: 'Costura rota' });
    expect(cuerpo.movimientos[0]).not.toHaveProperty('ubicacionDestino');
    expect(existencia(cuerpo.variantes[0]!, 'BODEGA')).toBe(4);
  });

  it('una merma no puede superar la existencia de la ubicación', async () => {
    const { idVariante } = await crearProducto({ cantidad: 3 });
    const respuesta = await enviar<ErrorApi>('/inventario/movimientos/mermas', {
      claveIdempotencia: randomUUID(),
      idVariante,
      ubicacion: 'SALA_VENTAS',
      cantidad: 1,
      tipoMerma: 'MUESTRA',
      motivo: 'Vitrina',
    });
    expect(respuesta).toEqual({
      status: 409,
      cuerpo: { codigo: 'STOCK_INSUFICIENTE', mensaje: 'No hay existencia suficiente en la ubicación.' },
    });
  });

  it('una merma no puede dar de baja unidades comprometidas en pedidos', async () => {
    // La Polera Calavera L tiene 3 unidades reservadas; se intenta sacar toda su bodega.
    const calaveraL = (await obtener<VarianteStock>('/inventario/variantes/por-codigo/RS-0002')).cuerpo;
    const respuesta = await enviar<ErrorApi>('/inventario/movimientos/mermas', {
      claveIdempotencia: randomUUID(),
      idVariante: 2,
      ubicacion: 'BODEGA',
      cantidad: existencia(calaveraL, 'BODEGA'),
      tipoMerma: 'DANADO',
      motivo: 'Prueba',
    });
    expect(respuesta).toEqual({
      status: 409,
      cuerpo: { codigo: 'UNIDADES_RESERVADAS', mensaje: 'Hay unidades comprometidas en pedidos.' },
    });
    expect((await obtener<VarianteStock>('/inventario/variantes/por-codigo/RS-0002')).cuerpo).toEqual(calaveraL);
  });

  it('un traspaso mueve unidades entre ubicaciones sin cambiar el total', async () => {
    const { idVariante } = await crearProducto({ cantidad: 5 });
    const traspaso = { claveIdempotencia: randomUUID(), idVariante, origen: 'BODEGA', destino: 'SALA_VENTAS', cantidad: 2, motivo: 'Reponer sala' };

    const mismoLugar = await enviar<ErrorApi>('/inventario/movimientos/traspasos', { ...traspaso, destino: 'BODEGA' });
    const sinStock = await enviar<ErrorApi>('/inventario/movimientos/traspasos', { ...traspaso, cantidad: 6 });
    expect(mismoLugar.cuerpo.mensaje).toBe('El origen y el destino deben ser distintos.');
    expect(sinStock.cuerpo.codigo).toBe('STOCK_INSUFICIENTE');

    const { cuerpo } = await enviar<ResultadoMovimientos>('/inventario/movimientos/traspasos', traspaso, vendedor);
    expect(cuerpo.movimientos[0]).toMatchObject({ tipo: 'TRASPASO', ubicacion: 'BODEGA', ubicacionDestino: 'SALA_VENTAS', cantidad: 2, idUsuario: 2 });
    expect(cuerpo.variantes[0]).toMatchObject({
      existencias: [
        { ubicacion: 'BODEGA', cantidad: 3 },
        { ubicacion: 'SALA_VENTAS', cantidad: 2 },
      ],
      disponible: 5,
    });
  });

  it('un ajuste deja la existencia en lo contado y registra la diferencia', async () => {
    const { idVariante } = await crearProducto({ cantidad: 5 });
    const ajustar = (cantidadContada: unknown) =>
      enviar<ResultadoMovimientos>('/inventario/movimientos/ajustes', {
        claveIdempotencia: randomUUID(),
        idVariante,
        ubicacion: 'BODEGA',
        cantidadContada,
        motivo: 'Conteo semanal',
      });

    const faltante = await ajustar(3);
    expect(faltante.cuerpo.movimientos[0]).toMatchObject({ tipo: 'AJUSTE', cantidad: -2, motivo: 'Conteo semanal' });
    expect(existencia(faltante.cuerpo.variantes[0]!, 'BODEGA')).toBe(3);

    const sobrante = await ajustar(4);
    expect(sobrante.cuerpo.movimientos[0]!.cantidad).toBe(1);

    const igual = await ajustar(4);
    expect(igual.cuerpo.movimientos[0]!.cantidad).toBe(0);
    expect(existencia(igual.cuerpo.variantes[0]!, 'BODEGA')).toBe(4);

    expect((await ajustar(-1)).cuerpo).toEqual({
      codigo: 'DATOS_INVALIDOS',
      mensaje: 'La cantidad contada debe ser un entero mayor o igual a cero.',
    });
  });

  it('una clave de idempotencia no sirve para dos operaciones distintas', async () => {
    const { idVariante } = await crearProducto({ cantidad: 5 });
    const claveIdempotencia = randomUUID();
    await enviar('/inventario/movimientos/ingresos', { claveIdempotencia, ubicacion: 'BODEGA', lineas: [{ idVariante, cantidad: 1 }] });
    const merma = await enviar<ErrorApi>('/inventario/movimientos/mermas', {
      claveIdempotencia,
      idVariante,
      ubicacion: 'BODEGA',
      cantidad: 1,
      tipoMerma: 'CAMBIO',
      motivo: 'Otra operación',
    });
    expect(merma).toEqual({
      status: 400,
      cuerpo: { codigo: 'DATOS_INVALIDOS', mensaje: 'La clave de idempotencia ya se usó en otra operación.' },
    });
  });

  it('mermas simultáneas sobre las mismas unidades nunca dejan el stock en negativo', async () => {
    const { idVariante, codigo } = await crearProducto({ cantidad: 3 });
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () =>
        enviar<ResultadoMovimientos | ErrorApi>('/inventario/movimientos/mermas', {
          claveIdempotencia: randomUUID(),
          idVariante,
          ubicacion: 'BODEGA',
          cantidad: 1,
          tipoMerma: 'DANADO',
          motivo: 'Concurrencia',
        }),
      ),
    );
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(3);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(7);
    expect(existencia((await obtener<VarianteStock>(`/inventario/variantes/por-codigo/${codigo}`)).cuerpo, 'BODEGA')).toBe(0);
  });
});

describe('tiempo de búsqueda', () => {
  it('una búsqueda completada registra su duración', async () => {
    const { idVariante } = await crearProducto();
    const inicio = await enviar<Busqueda>('/inventario/busquedas', { idVariante });
    expect(inicio.status).toBe(201);
    expect(inicio.cuerpo).toEqual({ idBusqueda: expect.any(Number), idVariante, inicio: expect.any(String) });

    const cierre = await llamar<Busqueda>('PATCH', `/inventario/busquedas/${inicio.cuerpo.idBusqueda}`, { resultado: 'ENCONTRADA' }, bodega);
    expect(cierre.status).toBe(200);
    expect(cierre.cuerpo).toMatchObject({ ...inicio.cuerpo, fin: expect.any(String), duracionSegundos: expect.any(Number) });
    expect(cierre.cuerpo.duracionSegundos).toBeGreaterThanOrEqual(0);
  });

  it('una búsqueda cancelada no registra duración', async () => {
    const { idVariante } = await crearProducto();
    const { cuerpo: inicio } = await enviar<Busqueda>('/inventario/busquedas', { idVariante });
    const cierre = await llamar<Busqueda>('PATCH', `/inventario/busquedas/${inicio.idBusqueda}`, { resultado: 'CANCELADA' }, bodega);
    expect(cierre.cuerpo).toEqual(inicio);
  });

  it('informa una búsqueda o una variante que no existe', async () => {
    expect((await enviar<ErrorApi>('/inventario/busquedas', { idVariante: 99_999_999 })).cuerpo.codigo).toBe('NO_ENCONTRADO');
    const cierre = await llamar<ErrorApi>('PATCH', '/inventario/busquedas/99999999', { resultado: 'ENCONTRADA' }, bodega);
    expect(cierre).toEqual({ status: 404, cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'La búsqueda no existe.' } });
  });
});

describe('pedidos', () => {
  it('lista los pedidos del e-commerce con su destino y sus líneas', async () => {
    const { status, cuerpo } = await obtener<Pedido[]>('/logistica/pedidos');
    expect(status).toBe(200);
    const pedido = cuerpo.find((p) => p.idPedido === 1004)!;
    expect(pedido).toMatchObject({
      idVenta: 5004,
      estado: 'DESPACHADO',
      destinatario: 'Diego Muñoz',
      direccion: 'Av. Alemania 310',
      comuna: 'Temuco',
      region: 'La Araucanía',
      trackingStarken: 'STK-900104',
      lineas: [
        { idVariante: 3, sku: 'RS-0003', producto: 'Chaqueta de Cuero Rider', talla: 'M', color: 'Negro', cantidad: 1 },
        { idVariante: 1, sku: 'RS-0001', producto: 'Polera Calavera', talla: 'M', color: 'Negro', cantidad: 2 },
      ],
    });
    expect(new Date(pedido.pagadoEn).getTime()).toBeLessThan(new Date(pedido.despachadoEn!).getTime());
    expect(pedido).not.toHaveProperty('entregadoEn');

    const pagado = cuerpo.find((p) => p.idPedido === 1001)!;
    expect(pagado).not.toHaveProperty('despachadoEn');
    expect(pagado).not.toHaveProperty('trackingStarken');
  });

  it('filtra por estado', async () => {
    const { cuerpo } = await obtener<Pedido[]>('/logistica/pedidos?estado=ENTREGADO');
    expect(cuerpo.map((p) => p.idPedido)).toEqual(expect.arrayContaining([1006, 1007]));
    expect(cuerpo.every((p) => p.estado === 'ENTREGADO')).toBe(true);
  });
});

describe('formato de error', () => {
  it('una ruta que no existe responde con el formato común', async () => {
    expect(await obtener('/inventario/no-existe')).toEqual({
      status: 404,
      cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta no existe.' },
    });
  });

  it('un cuerpo que no es JSON válido responde 400', async () => {
    const respuesta = await fetch(`${apiUrl}/usuarios/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{no es json',
    });
    expect(respuesta.status).toBe(400);
    expect(((await respuesta.json()) as ErrorApi).codigo).toBe('DATOS_INVALIDOS');
  });
});
