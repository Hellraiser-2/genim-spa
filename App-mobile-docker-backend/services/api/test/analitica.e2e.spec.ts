import type { PGlite } from '@electric-sql/pglite';
import type { ErrorApi, RecomendacionesInversion, SesionResponse } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Modelo predictivo de inversión. Levanta su propia API con base en memoria y le carga un
 * historial conocido:
 * - Polera Eddie M (variante 7, Iron Maiden): 3 unidades por semana en la tienda durante
 *   las últimas 12 semanas. Su stock no alcanza para las 8 semanas que vienen.
 * - Polera Rayo L (variante 8): tiene stock y nunca se vendió.
 */

const EDDIE = 7;
const RAYO = 8;

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let gerente: string;
let vendedor: string;

async function llamar<T>(ruta: string, token?: string): Promise<{ status: number; cuerpo: T }> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
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

/** Una venta pagada hace `semanasAtras` semanas completas (1 = la semana pasada). */
async function venderHace(semanasAtras: number, canal: 'POS' | 'ECOMMERCE', idVariante: number, cantidad: number, clave?: string) {
  const [{ id_usuario: idVendedor }] = (await db.query<{ id_usuario: number }>("SELECT id_usuario FROM usuarios.usuarios WHERE email = 'vendedor@rockstar.cl'")).rows;
  const [{ id_usuario: idCliente }] = (await db.query<{ id_usuario: number }>("SELECT id_usuario FROM usuarios.usuarios WHERE email = 'cliente@rockstar.cl'")).rows;
  const [{ precio }] = (await db.query<{ precio: number }>(
    'SELECT p.precio FROM inventario.variantes v JOIN inventario.productos p USING (id_producto) WHERE v.id_variante = $1',
    [idVariante],
  )).rows;
  const { rows } = await db.query<{ id_venta: number }>(
    `INSERT INTO ventas.ventas (canal, id_vendedor, id_cliente, id_estado, fecha, total, clave_idempotencia)
     VALUES ($1, $2, $3, (SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA'),
             (date_trunc('week', now() AT TIME ZONE 'America/Santiago') - make_interval(weeks => $4) + interval '2 days 12 hours')
               AT TIME ZONE 'America/Santiago',
             $5, $6)
     RETURNING id_venta`,
    [canal, canal === 'POS' ? idVendedor : null, canal === 'ECOMMERCE' ? idCliente : null, semanasAtras, precio * cantidad, clave ?? `prueba-analitica:${++correlativo}`],
  );
  await db.query('INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)', [
    rows[0]!.id_venta,
    idVariante,
    cantidad,
    precio,
  ]);
}

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
  gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
  for (let semana = 1; semana <= 12; semana++) {
    await venderHace(semana, 'POS', EDDIE, 3);
  }
  await venderHace(3, 'ECOMMERCE', EDDIE, 1, 'demo-historial:prueba');
});

afterAll(async () => {
  await detener?.();
});

describe('recomendaciones de inversión', () => {
  it('son solo del Gerente', async () => {
    expect((await llamar<ErrorApi>('/analitica/recomendaciones', vendedor)).status).toBe(403);
    expect((await llamar<ErrorApi>('/analitica/recomendaciones')).status).toBe(401);
    expect((await llamar<RecomendacionesInversion>('/analitica/recomendaciones', gerente)).status).toBe(200);
  });

  it('valida el horizonte, la reposición y el presupuesto', async () => {
    for (const consulta of ['horizonte=2', 'horizonte=8.5', 'reposicion=20', 'presupuesto=-1', 'presupuesto=abc']) {
      const { status, cuerpo } = await llamar<ErrorApi>(`/analitica/recomendaciones?${consulta}`, gerente);
      expect(status, consulta).toBe(400);
      expect(cuerpo.codigo).toBe('DATOS_INVALIDOS');
    }
  });

  it('recomienda comprar lo que se agota, ubicado donde se vende', async () => {
    const { cuerpo } = await llamar<RecomendacionesInversion>('/analitica/recomendaciones?horizonte=8&reposicion=2', gerente);
    const eddie = cuerpo.comprar.find((c) => c.idVariante === EDDIE)!;

    expect(eddie).toBeDefined();
    // Vende todas las semanas: demanda regular, con el método que ganó la selección.
    const regular = (await llamar<RecomendacionesInversion>('/analitica/recomendaciones', gerente)).cuerpo.modelo.seleccion.find((s) => s.tipo === 'REGULAR')!;
    expect(eddie.metodo).toBe(regular.metodo);
    expect(eddie.confianza).toBe('ALTA');
    // Unas 3 por semana: cerca de 24 unidades en 8 semanas.
    expect(eddie.demandaProyectada).toBeGreaterThan(20);
    expect(eddie.demandaProyectada).toBeLessThan(28);
    expect(eddie.cantidadSugerida).toBeGreaterThanOrEqual(Math.ceil(eddie.demandaProyectada - eddie.disponible));
    expect(eddie.canalPrincipal).toBe('POS');
    expect(eddie.ubicacionSugerida).toBe('SALA_VENTAS');
    expect(eddie.costoEstimado).toBe(false);
    expect(eddie.inversion).toBe(eddie.cantidadSugerida * eddie.costoUnitario);
    expect(eddie.margenEsperado).toBeGreaterThan(0);
    expect(eddie.roi).toBeCloseTo(eddie.margenEsperado / eddie.inversion, 2);
    expect(['URGENTE', 'ALTA']).toContain(eddie.prioridad);
  });

  it('no recomienda reponer lo que no se vende y lo marca como capital inmovilizado', async () => {
    const { cuerpo } = await llamar<RecomendacionesInversion>('/analitica/recomendaciones', gerente);
    expect(cuerpo.comprar.some((c) => c.idVariante === RAYO)).toBe(false);
    const rayo = cuerpo.noReinvertir.find((p) => p.idVariante === RAYO)!;
    expect(rayo.vendidas12Semanas).toBe(0);
    expect(rayo.capitalInmovilizado).toBeGreaterThan(0);
    expect(rayo.sugerencia).toContain('Sin ventas');
  });

  it('con presupuesto elige solo las compras que caben', async () => {
    const { cuerpo: sinTope } = await llamar<RecomendacionesInversion>('/analitica/recomendaciones', gerente);
    const { cuerpo: conTope } = await llamar<RecomendacionesInversion>('/analitica/recomendaciones?presupuesto=1', gerente);
    expect(sinTope.resumen.inversionSugerida).toBeGreaterThan(0);
    expect(conTope.comprar.every((c) => !c.dentroDelPresupuesto)).toBe(true);
    expect(conTope.resumen.inversionSugerida).toBe(0);
    expect(conTope.resumen.roiEsperado).toBeNull();
  });

  it('informa la serie, las tendencias, los canales y cómo se entrenó el modelo', async () => {
    const { cuerpo } = await llamar<RecomendacionesInversion>('/analitica/recomendaciones?horizonte=6', gerente);

    // Los pedidos de demostración del arranque son compras web de los últimos días, de las
    // variantes 1 a 4: según el día caen en una semana u otra. En la tienda solo vende esta prueba.
    expect(cuerpo.serieSemanal).toHaveLength(26 + 6);
    const ultimaReal = cuerpo.serieSemanal[25]!;
    expect(ultimaReal).toMatchObject({ pos: 3, pronostico: null });
    const primeraFutura = cuerpo.serieSemanal[26]!;
    expect(primeraFutura.pronostico).toBeGreaterThan(0);
    expect(primeraFutura.minimo).toBeLessThanOrEqual(primeraFutura.pronostico!);
    expect(primeraFutura.maximo).toBeGreaterThanOrEqual(primeraFutura.pronostico!);

    // Las últimas 8 semanas (24 u.) contra las 8 anteriores, de las que solo 4 tuvieron ventas (12 u.).
    const ironMaiden = cuerpo.tendencias.bandas.find((t) => t.nombre === 'Iron Maiden')!;
    expect(ironMaiden).toMatchObject({ unidadesRecientes: 25, unidadesAnteriores: 12, direccion: 'ALZA' });

    // 36 poleras vendidas en la tienda; el resto de la categoría, en la web.
    const poleras = cuerpo.canales.find((c) => c.categoria === 'Poleras')!;
    expect(poleras.unidades).toBeGreaterThanOrEqual(37);
    expect(poleras.ecommerce).toBeCloseTo((poleras.unidades - 36) / poleras.unidades, 3);
    expect(poleras.recomendacion).toContain('tienda');

    expect(cuerpo.modelo.ventasAnalizadas).toBeGreaterThanOrEqual(13);
    expect(cuerpo.modelo.ventasDemostracion).toBe(1);
    expect(cuerpo.modelo.avisos.some((a) => a.includes('demostración'))).toBe(true);
    expect(cuerpo.modelo.seleccion.map((s) => s.tipo)).toEqual(['REGULAR', 'INTERMITENTE']);
    const regular = cuerpo.modelo.seleccion[0]!;
    expect(regular.errores.map((e) => e.metodo).sort()).toEqual(['HOLT', 'MEDIA_MOVIL', 'SBA', 'SES']);
    expect(regular.errores[0]!.metodo).toBe(regular.metodo);
    expect(cuerpo.parametros).toMatchObject({ horizonteSemanas: 6, reposicionSemanas: 2, nivelServicio: 0.95, presupuesto: null, semanasHistoria: 12 });
    expect(cuerpo.modelo.validacion).not.toBeNull();
  });
});
