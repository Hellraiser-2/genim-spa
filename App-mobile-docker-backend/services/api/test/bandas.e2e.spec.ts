import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { ArticuloCatalogo, BandaCatalogo, ErrorApi, SesionResponse, VarianteGestion } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Pruebas de las fotos de las bandas y del cargador del catálogo de bandas. Agregan
 * bandas y productos, así que levantan siempre su propia API con base en memoria.
 */

const ejecutar = promisify(execFile);
const CARGADOR = fileURLToPath(new URL('../scripts/cargar-bandas.mjs', import.meta.url));

/** El JPEG más chico que pasa por foto: su firma y un cierre. */
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]).toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]).toString('base64')}`;

let apiUrl: string;
let detener: () => Promise<void>;
let bodega: string;
let vendedor: string;

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

async function iniciarSesion(email: string, password: string): Promise<string> {
  return (await llamar<SesionResponse>('POST', '/usuarios/auth/login', { email, password })).cuerpo.accessToken;
}

const bandas = async () => (await llamar<BandaCatalogo[]>('GET', '/inventario/catalogo/bandas')).cuerpo;
const guardar = <T = BandaCatalogo>(cuerpo: object, token = bodega) => llamar<T>('PUT', '/inventario/bandas/imagen', cuerpo, token);
/** La dirección de la foto es relativa al servidor (`/api/v1/...`); `apiUrl` ya trae ese prefijo. */
const pedirFoto = (imagenUrl: string) => fetch(new URL(imagenUrl, apiUrl));

beforeAll(async () => {
  ({ apiUrl, detener } = await iniciarEntornoLocal({ silencioso: true }));
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
});

afterAll(async () => {
  await detener?.();
});

describe('fotos de las bandas', () => {
  it('la lista de bandas es pública y parte sin fotos', async () => {
    const lista = await bandas();
    expect(lista.map((b) => b.nombre)).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits']);
    expect(lista.every((b) => b.imagenUrl === null && b.credito === null)).toBe(true);
  });

  it('guarda la foto de una banda y la entrega por su dirección, lista para guardarse en el navegador', async () => {
    const { status, cuerpo } = await guardar({ banda: 'metallica', imagen: JPEG, credito: '  Foto: Alguien · CC0  ' });

    expect(status).toBe(200);
    expect(cuerpo).toEqual({
      idBanda: expect.any(Number),
      // La banda se reconoce sin distinguir mayúsculas y conserva su nombre registrado.
      nombre: 'Metallica',
      imagenUrl: expect.stringMatching(/^\/api\/v1\/inventario\/catalogo\/bandas\/\d+\/imagen\?v=[0-9a-f]{16}$/),
      credito: 'Foto: Alguien · CC0',
      concierto: null,
    });
    expect((await bandas()).find((b) => b.nombre === 'Metallica')).toEqual(cuerpo);

    const foto = await pedirFoto(cuerpo.imagenUrl!);
    expect(foto.status).toBe(200);
    expect(foto.headers.get('content-type')).toBe('image/jpeg');
    expect(foto.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(foto.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await foto.arrayBuffer()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('una foto nueva reemplaza a la anterior y cambia de dirección', async () => {
    const anterior = (await bandas()).find((b) => b.nombre === 'Metallica')!;

    const { cuerpo } = await guardar({ banda: 'Metallica', imagen: PNG });

    expect(cuerpo.imagenUrl).not.toBe(anterior.imagenUrl);
    expect(cuerpo.credito).toBeNull();
    expect((await pedirFoto(cuerpo.imagenUrl!)).headers.get('content-type')).toBe('image/png');
  });

  it('registra la banda si aún no existe', async () => {
    const { cuerpo } = await guardar({ banda: 'Slayer', imagen: JPEG });
    expect(cuerpo.nombre).toBe('Slayer');
    expect((await llamar<string[]>('GET', '/inventario/bandas', undefined, bodega)).cuerpo).toContain('Slayer');
  });

  it('rechaza lo que no es una foto, aunque diga serlo', async () => {
    const mensaje = async (imagen: unknown) => (await guardar<ErrorApi>({ banda: 'Metallica', imagen })).cuerpo.mensaje;
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`;
    const htmlComoJpeg = `data:image/jpeg;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}`;

    expect(await mensaje(svg)).toBe('La imagen debe ser una foto JPEG, PNG o WebP.');
    expect(await mensaje('https://ejemplo.cl/foto.jpg')).toBe('La imagen debe ser una foto JPEG, PNG o WebP.');
    expect(await mensaje(undefined)).toBe('La imagen debe ser una foto JPEG, PNG o WebP.');
    expect(await mensaje(htmlComoJpeg)).toBe('El contenido de la imagen no corresponde a su formato.');
    expect(await mensaje(`data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024)]).toString('base64')}`)).toBe(
      'La imagen no puede pesar más de 2 MB.',
    );
    expect((await guardar<ErrorApi>({ banda: ' ', imagen: JPEG })).cuerpo.mensaje).toBe('El nombre es obligatorio.');
  });

  it('solo Bodega y Gerente guardan fotos', async () => {
    expect((await guardar<ErrorApi>({ banda: 'Metallica', imagen: JPEG }, vendedor)).status).toBe(403);
    expect((await llamar('PUT', '/inventario/bandas/imagen', { banda: 'Metallica', imagen: JPEG })).status).toBe(401);
  });

  it('informa una banda sin foto o que no existe', async () => {
    const misfits = (await bandas()).find((b) => b.nombre === 'Misfits')!;
    expect(await llamar<ErrorApi>('GET', `/inventario/catalogo/bandas/${misfits.idBanda}/imagen`)).toEqual({
      status: 404,
      cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'La banda no tiene foto.' },
    });
    expect((await llamar('GET', '/inventario/catalogo/bandas/999999/imagen')).status).toBe(404);
  });
});

describe('conciertos de las bandas en Chile', () => {
  const registrar = <T = BandaCatalogo>(cuerpo: object, token = bodega) => llamar<T>('PUT', '/inventario/bandas/concierto', cuerpo, token);
  const maiden = async () => (await bandas()).find((b) => b.nombre === 'Iron Maiden')!;

  it('registra el próximo concierto de una banda y lo publica con ella, sin tocar su foto', async () => {
    const metallica = (await bandas()).find((b) => b.nombre === 'Metallica')!;
    expect((await maiden()).concierto).toBeNull();

    const { status, cuerpo } = await registrar({ banda: 'iron maiden', fecha: '2026-10-31', lugar: '  Estadio Nacional, Santiago  ' });

    expect(status).toBe(200);
    expect(cuerpo).toMatchObject({ nombre: 'Iron Maiden', concierto: { fecha: '2026-10-31', lugar: 'Estadio Nacional, Santiago' } });
    expect(await maiden()).toEqual(cuerpo);

    // El lugar es opcional, y el concierto de una banda no cambia nada de otra.
    expect((await registrar({ banda: 'Metallica', fecha: '2027-03-15' })).cuerpo).toEqual({ ...metallica, concierto: { fecha: '2027-03-15', lugar: null } });
    expect((await maiden()).concierto).toEqual({ fecha: '2026-10-31', lugar: 'Estadio Nacional, Santiago' });
  });

  it('una fecha nueva reemplaza a la anterior y `null` quita el concierto', async () => {
    expect((await registrar({ banda: 'Iron Maiden', fecha: '2026-11-01' })).cuerpo.concierto).toEqual({ fecha: '2026-11-01', lugar: null });
    expect((await registrar({ banda: 'Iron Maiden', fecha: null, lugar: 'Estadio Nacional' })).cuerpo.concierto).toBeNull();
    expect((await maiden()).concierto).toBeNull();
  });

  it('rechaza una fecha que no es un día real', async () => {
    const mensaje = async (fecha: unknown) => (await registrar<ErrorApi>({ banda: 'Iron Maiden', fecha })).cuerpo.mensaje;
    const esperado = 'La fecha del concierto debe ser un día válido, con la forma AAAA-MM-DD.';

    expect(await mensaje('31-10-2026')).toBe(esperado);
    expect(await mensaje('2026-02-30')).toBe(esperado);
    expect(await mensaje(undefined)).toBe(esperado);
    expect((await registrar<ErrorApi>({ banda: ' ', fecha: '2026-10-31' })).cuerpo.mensaje).toBe('El nombre es obligatorio.');
    expect((await maiden()).concierto).toBeNull();
  });

  it('solo Bodega y Gerente registran conciertos', async () => {
    expect((await registrar<ErrorApi>({ banda: 'Iron Maiden', fecha: '2026-10-31' }, vendedor)).status).toBe(403);
    expect((await llamar('PUT', '/inventario/bandas/concierto', { banda: 'Iron Maiden', fecha: '2026-10-31' })).status).toBe(401);
  });
});

describe('cargador del catálogo de bandas', () => {
  const cargar = () => ejecutar(process.execPath, [CARGADOR], { env: { ...process.env, API_URL: apiUrl } });

  it('carga las fotos, los productos con su stock y sus precios', async () => {
    const { stdout } = await cargar();

    expect(stdout).toContain('Fotos de bandas guardadas: 17 de 17');
    expect(stdout).toContain('Variantes creadas: 38 de 38');
    expect(stdout).toContain('Productos que recibieron precio: 19 de 19');

    const lista = await bandas();
    expect(lista).toHaveLength(17);
    expect(lista.every((b) => b.imagenUrl !== null && b.credito?.includes('Wikimedia Commons'))).toBe(true);
    const queen = lista.find((b) => b.nombre === 'Queen')!;
    const foto = await pedirFoto(queen.imagenUrl!);
    expect(foto.headers.get('content-type')).toBe('image/jpeg');
    expect((await foto.arrayBuffer()).byteLength).toBeGreaterThan(10_000);

    const catalogo = (await llamar<ArticuloCatalogo[]>('GET', '/inventario/catalogo')).cuerpo;
    expect(catalogo.filter((a) => a.producto === 'Polera Metallica Master of Puppets').map((a) => [a.talla, a.disponible, a.precio, a.categoria, a.banda])).toEqual([
      ['M', 8, 16990, 'Poleras', 'Metallica'],
      ['L', 6, 16990, 'Poleras', 'Metallica'],
    ]);
    const poleron = catalogo.find((a) => a.producto === 'Polerón Nirvana In Utero' && a.talla === 'XL')!;
    expect(poleron).toMatchObject({ categoria: 'Polerones', banda: 'Nirvana', precio: 34990, disponible: 3 });
    expect(poleron.descripcion).toContain('In Utero');
    // La imagen del producto es una ilustración liviana, no una foto.
    expect(poleron.imagenUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(poleron.imagenUrl!.length).toBeLessThan(4000);
    expect(Buffer.from(poleron.imagenUrl!.split(',')[1]!, 'base64').toString('utf8')).toContain('NIRVANA');
  }, 120_000);

  it('ejecutarlo de nuevo no duplica nada ni pisa un precio cambiado por el Gerente', async () => {
    const gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
    const antes = (await llamar<VarianteGestion[]>('GET', '/inventario/productos', undefined, bodega)).cuerpo;
    const kiss = antes.find((v) => v.producto === 'Polera Kiss Destroyer')!;
    await llamar('PATCH', `/inventario/productos/${kiss.idProducto}`, { precio: 9990 }, gerente);

    const { stdout } = await cargar();

    expect(stdout).toContain('Todo estaba cargado: no hubo cambios.');
    const despues = (await llamar<VarianteGestion[]>('GET', '/inventario/productos', undefined, bodega)).cuerpo;
    expect(despues).toHaveLength(antes.length);
    expect(despues.find((v) => v.producto === 'Polera Kiss Destroyer')!.precio).toBe(9990);
    expect(despues.filter((v) => v.producto === 'Polera Kiss Destroyer').map((v) => v.disponible)).toEqual([5, 5]);
  }, 120_000);
});
