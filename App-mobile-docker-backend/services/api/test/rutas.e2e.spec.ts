import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { PGlite } from '@electric-sql/pglite';
import type { RutaReparto, SesionResponse } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Ruta de reparto. La API habla con un doble de Nominatim y OSRM que corre en la prueba:
 * así se controla qué direcciones existen y en qué orden conviene visitarlas.
 *
 * Pedidos por enviar de la Región Metropolitana: el de demostración en Providencia y los
 * que crea la prueba en Ñuñoa, Maipú (calle que no existe) y Lo Barnechea (nada existe).
 */

const BODEGA = { lat: -33.4378, lon: -70.6504 };
const CALLES: Record<string, { lat: string; lon: string }> = {
  'Av. Providencia 1234': { lat: '-33.4263', lon: '-70.6178' },
  'Irarrázaval 3400': { lat: '-33.4569', lon: '-70.5977' },
};
const COMUNAS: Record<string, { lat: string; lon: string }> = {
  Maipú: { lat: '-33.5167', lon: '-70.7667' },
};

let servicio: Server;
let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let bodega: string;
let cliente: string;
let busquedas: URLSearchParams[] = [];
let rutasCaidas = false;

function atender(peticion: IncomingMessage, respuesta: ServerResponse): void {
  const url = new URL(peticion.url ?? '/', 'http://doble');
  respuesta.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/search') {
    busquedas.push(url.searchParams);
    const calle = url.searchParams.get('street');
    const encontrada = calle ? CALLES[calle] : COMUNAS[url.searchParams.get('city') ?? ''];
    respuesta.end(JSON.stringify(encontrada ? [encontrada] : []));
    return;
  }
  if (url.pathname.startsWith('/trip/v1/driving/')) {
    if (rutasCaidas) {
      respuesta.statusCode = 503;
      respuesta.end('{}');
      return;
    }
    const puntos = url.pathname.slice('/trip/v1/driving/'.length).split(';').map((par) => par.split(',').map(Number) as [number, number]);
    // El doble visita los destinos al revés de como llegaron: así se ve que la API respeta su orden.
    const destinos = puntos.length - 1;
    const waypoints = puntos.map((_, i) => ({ waypoint_index: i === 0 ? 0 : destinos - i + 1 }));
    const visita = [puntos[0]!, ...puntos.slice(1).reverse(), puntos[0]!];
    respuesta.end(
      JSON.stringify({
        code: 'Ok',
        waypoints,
        trips: [{ geometry: { coordinates: visita }, legs: visita.slice(1).map((_, i) => ({ distance: 1000 * (i + 1), duration: 120 * (i + 1) })) }],
      }),
    );
    return;
  }
  respuesta.statusCode = 404;
  respuesta.end('{}');
}

async function llamar<T>(ruta: string, token: string): Promise<{ status: number; cuerpo: T }> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as T };
}

async function iniciarSesion(email: string, password: string): Promise<string> {
  const respuesta = await fetch(`${apiUrl}/usuarios/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return ((await respuesta.json()) as SesionResponse).accessToken;
}

let correlativo = 0;

/** Un pedido web pagado de 2 prendas, en el estado y la comuna de la Región Metropolitana dados. */
async function pedido(direccion: string, comuna: string, estado = 'PAGADO'): Promise<number> {
  const { rows: ventas } = await db.query<{ id_venta: number }>(
    `INSERT INTO ventas.ventas (canal, id_cliente, id_estado, total, clave_idempotencia)
     VALUES ('ECOMMERCE', (SELECT id_usuario FROM usuarios.usuarios WHERE email = 'cliente@rockstar.cl'),
             (SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA'), 29980, $1)
     RETURNING id_venta`,
    [`prueba-rutas:${++correlativo}`],
  );
  const idVenta = ventas[0]!.id_venta;
  await db.query('INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario) VALUES ($1, 1, 2, 14990)', [idVenta]);
  const { rows } = await db.query<{ id_pedido: number }>(
    `INSERT INTO logistica.pedidos (id_venta, id_estado, id_comuna, direccion, destinatario, pagado_en)
     VALUES ($1, (SELECT id_estado FROM logistica.estados_pedido WHERE codigo = $2),
             (SELECT id_comuna FROM logistica.comunas WHERE nombre = $3 AND id_region = 7), $4, 'Cliente de prueba', now())
     RETURNING id_pedido`,
    [idVenta, estado, comuna, direccion],
  );
  return rows[0]!.id_pedido;
}

const ruta = async () => (await llamar<RutaReparto>('/logistica/rutas/reparto', bodega)).cuerpo;

let enNunoa: number;
let enMaipu: number;
let enLoBarnechea: number;

describe('ruta de reparto', () => {
  const entornoPrevio = { geo: process.env['GEOCODIFICADOR_URL'], rutas: process.env['RUTAS_URL'] };

  beforeAll(async () => {
    servicio = createServer(atender);
    await new Promise<void>((resolver) => servicio.listen(0, '127.0.0.1', resolver));
    const doble = `http://127.0.0.1:${(servicio.address() as AddressInfo).port}`;
    process.env['GEOCODIFICADOR_URL'] = doble;
    process.env['RUTAS_URL'] = doble;
    ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
    bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
    cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
    enNunoa = await pedido('Irarrázaval 3400', 'Ñuñoa');
    enMaipu = await pedido('Calle Inexistente 999', 'Maipú', 'EN_PREPARACION');
    enLoBarnechea = await pedido('Pasaje Fantasma 1', 'Lo Barnechea');
    await pedido('Irarrázaval 3400', 'Ñuñoa', 'DESPACHADO');
  }, 60_000);

  afterAll(async () => {
    await detener?.();
    await new Promise((resolver) => servicio.close(resolver));
    for (const [nombre, valor] of [
      ['GEOCODIFICADOR_URL', entornoPrevio.geo],
      ['RUTAS_URL', entornoPrevio.rutas],
    ] as const) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  });

  it('es del personal: un cliente no la ve', async () => {
    expect((await llamar('/logistica/rutas/reparto', cliente)).status).toBe(403);
  });

  it('sale de la bodega con los pedidos por enviar de la Región Metropolitana, en el orden del servicio de rutas', async () => {
    busquedas = [];
    const cuerpo = await ruta();

    expect(cuerpo.calculo).toBe('CALLES');
    expect(cuerpo.origen.ubicacion).toEqual(BODEGA);
    // Fuera: los de regiones (demostración en Valparaíso y Concepción) y el ya despachado.
    const ids = cuerpo.paradas.map((parada) => parada.idPedido);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining([1001, enNunoa, enMaipu]));
    // El doble visita al revés de como se le enviaron, que es del pago más antiguo al más nuevo.
    expect(ids).toEqual([enMaipu, enNunoa, 1001]);
    expect(cuerpo.paradas.map((parada) => parada.orden)).toEqual([1, 2, 3]);
    expect(cuerpo.paradas[0]).toMatchObject({ comuna: 'Maipú', precision: 'COMUNA', unidades: 2, distanciaTramo: 1000, duracionTramo: 120 });
    expect(cuerpo.paradas[2]).toMatchObject({ idPedido: 1001, precision: 'DIRECCION', ubicacion: { lat: -33.4263, lon: -70.6178 } });
    // Tres tramos de ida más el regreso: 1 + 2 + 3 + 4 km.
    expect(cuerpo.distanciaTotal).toBe(10_000);
    expect(cuerpo.duracionTotal).toBe(1200);
    expect(cuerpo.trazado[0]).toEqual(BODEGA);
    expect(cuerpo.trazado.at(-1)).toEqual(BODEGA);
    expect(cuerpo.sinUbicar).toEqual([{ idPedido: enLoBarnechea, destinatario: 'Cliente de prueba', direccion: 'Pasaje Fantasma 1', comuna: 'Lo Barnechea' }]);

    // La calle se busca sin el departamento, en la comuna y región del pedido.
    const providencia = busquedas.find((b) => b.get('street') === 'Av. Providencia 1234')!;
    expect(providencia.get('city')).toBe('Providencia');
    expect(providencia.get('state')).toBe('Región Metropolitana');
  }, 60_000);

  it('no vuelve a buscar las direcciones ya ubicadas ni las que no existen', async () => {
    busquedas = [];
    await ruta();
    expect(busquedas).toEqual([]);
  });

  it('si el servicio de rutas no responde, ordena por cercanía en línea recta', async () => {
    rutasCaidas = true;
    try {
      const cuerpo = await ruta();
      expect(cuerpo.calculo).toBe('LINEA_RECTA');
      // Desde la Plaza de Armas: Providencia, Ñuñoa y al final Maipú.
      expect(cuerpo.paradas.map((parada) => parada.idPedido)).toEqual([1001, enNunoa, enMaipu]);
      expect(cuerpo.trazado).toHaveLength(5);
      expect(cuerpo.distanciaTotal).toBeGreaterThan(0);
    } finally {
      rutasCaidas = false;
    }
  });
});
