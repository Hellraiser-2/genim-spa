import { Injectable } from '@nestjs/common';
import type {
  CanalVenta,
  Confianza,
  MezclaCanal,
  Prioridad,
  ProductoInmovilizado,
  PuntoSerie,
  RecomendacionCompra,
  RecomendacionesInversion,
  Tendencia,
} from '@rockstar/contracts';

import { exigir } from '../comun/errores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { RESERVA_VIGENTE } from '../inventario/consultas.js';
import { ID_UBICACION } from '../inventario/ubicaciones.js';
import {
  DESCRIPCION_METODO,
  Z_POR_NIVEL,
  asignarPresupuesto,
  pronosticar,
  seleccionarMetodos,
  stockSeguridad,
  validar,
  variacion,
  type Metodo,
  type Pronostico,
} from './modelo-demanda.js';

/** Semanas completas de ventas con que se entrena el modelo. */
const SEMANAS_HISTORIA = 26;
/** Semanas antes del final desde donde se prueban los métodos candidatos (no se cruzan con la validación). */
const ORIGENES_SELECCION = [8, 12];
/** Semanas que se apartan para validar el modelo. */
const SEMANAS_VALIDACION = 4;
/** Semanas recientes que se comparan con las anteriores para las tendencias. */
const SEMANAS_TENDENCIA = 8;
const NIVEL_SERVICIO = 0.95;
/** z de la normal para el intervalo del pronóstico mostrado (80%). */
const Z_INTERVALO = 1.2816;
/** Cambio a partir del cual una banda o categoría se considera en alza o a la baja. */
const UMBRAL_TENDENCIA = 0.15;
/** Unidades mínimas, sumando ambos periodos, para hablar de alza o baja. */
const MINIMO_TENDENCIA = 20;
/** Prefijo de la clave de las ventas que crea `npm run semilla:historial`. */
export const PREFIJO_DEMO = 'demo-historial:';
const ZONA = 'America/Santiago';

interface FilaVenta {
  id_variante: number;
  canal: CanalVenta;
  semana: string;
  unidades: number;
}

interface FilaVariante {
  id_variante: number;
  sku: string;
  producto: string;
  banda: string | null;
  categoria: string;
  talla: string;
  color: string;
  precio: number | null;
  costo_compra: number | null;
  activo: boolean;
  disponible: number;
}

/** Lo que el modelo sabe de una prenda: sus ventas por semana y su pronóstico. */
interface Prenda extends FilaVariante {
  total: number[];
  ecommerce: number;
  pos: number;
  pronostico: Pronostico;
}

const sumar = (valores: number[]) => valores.reduce((s, v) => s + v, 0);
const redondear = (valor: number, decimales = 0) => Math.round(valor * 10 ** decimales) / 10 ** decimales;
const numero = (valor: number, decimales = 0) => valor.toLocaleString('es-CL', { maximumFractionDigits: decimales, minimumFractionDigits: decimales });
const porcentaje = (fraccion: number) => `${numero(Math.abs(fraccion) * 100)}%`;

/** 'AAAA-MM-DD' más `dias`. */
function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

function entero(valor: string | undefined, nombre: string, minimo: number, maximo: number, porDefecto: number): number {
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  exigir(Number.isInteger(n) && n >= minimo && n <= maximo, `${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
  return n;
}

/**
 * Modelo predictivo de inversión. Pronostica la demanda de cada prenda con lo vendido en
 * el e-commerce y en la tienda, y la cruza con el stock, el precio y el costo para decir
 * qué comprar y cuánto, qué no reponer y dónde está creciendo la demanda.
 */
@Injectable()
export class RecomendacionesService {
  constructor(private readonly db: BaseDeDatos) {}

  async calcular(consulta: Record<string, string | undefined>): Promise<RecomendacionesInversion> {
    const horizonte = entero(consulta['horizonte'], 'El horizonte', 4, 26, 8);
    const reposicion = entero(consulta['reposicion'], 'La reposición', 1, 8, 2);
    const presupuesto =
      consulta['presupuesto'] === undefined || consulta['presupuesto'] === ''
        ? null
        : entero(consulta['presupuesto'], 'El presupuesto', 1, 1_000_000_000_000, 0);
    const z = Z_POR_NIVEL[NIVEL_SERVICIO]!;

    // Solo semanas completas: la semana en curso dejaría la última semana a medias.
    const [{ fin }] = (await this.db.consultar<{ fin: string }>(
      `SELECT (date_trunc('week', now() AT TIME ZONE '${ZONA}'))::date::text AS fin`,
    )) as [{ fin: string }];
    const inicio = sumarDias(fin, -7 * SEMANAS_HISTORIA);
    const semanas = Array.from({ length: SEMANAS_HISTORIA }, (_, i) => sumarDias(inicio, 7 * i));
    const indice = new Map(semanas.map((s, i) => [s, i]));

    const [ventas, variantes, totales, comision] = await Promise.all([
      this.db.consultar<FilaVenta>(
        `SELECT d.id_variante, ve.canal,
                (date_trunc('week', ve.fecha AT TIME ZONE '${ZONA}'))::date::text AS semana,
                sum(d.cantidad)::int AS unidades
         FROM ventas.ventas ve
         JOIN ventas.estados_venta e ON e.id_estado = ve.id_estado
         JOIN ventas.detalle_venta d ON d.id_venta = ve.id_venta
         WHERE e.codigo = 'PAGADA'
           AND ve.fecha >= ($1::date AT TIME ZONE '${ZONA}') AND ve.fecha < ($2::date AT TIME ZONE '${ZONA}')
         GROUP BY 1, 2, 3`,
        [inicio, fin],
      ),
      this.db.consultar<FilaVariante>(
        `SELECT v.id_variante, v.sku, p.nombre AS producto, b.nombre AS banda, c.nombre AS categoria,
                t.nombre AS talla, co.nombre AS color, p.precio, p.costo_compra,
                (v.activo AND p.activo) AS activo,
                (COALESCE((SELECT sum(e.cantidad) FROM inventario.existencias e
                           WHERE e.id_variante = v.id_variante
                             AND e.id_ubicacion IN (${ID_UBICACION.BODEGA}, ${ID_UBICACION.SALA_VENTAS})), 0)
                 - COALESCE((SELECT sum(r.cantidad) FROM inventario.reservas r
                             WHERE r.id_variante = v.id_variante AND ${RESERVA_VIGENTE}), 0))::int AS disponible
         FROM inventario.variantes v
         JOIN inventario.productos p ON p.id_producto = v.id_producto
         JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
         LEFT JOIN inventario.bandas b ON b.id_banda = p.id_banda
         JOIN inventario.tallas t ON t.id_talla = v.id_talla
         JOIN inventario.colores co ON co.id_color = v.id_color`,
      ),
      this.db.consultar<{ ventas: number; demo: number }>(
        `SELECT count(*)::int AS ventas, count(*) FILTER (WHERE ve.clave_idempotencia LIKE $3)::int AS demo
         FROM ventas.ventas ve JOIN ventas.estados_venta e ON e.id_estado = ve.id_estado
         WHERE e.codigo = 'PAGADA'
           AND ve.fecha >= ($1::date AT TIME ZONE '${ZONA}') AND ve.fecha < ($2::date AT TIME ZONE '${ZONA}')`,
        [inicio, fin, `${PREFIJO_DEMO}%`],
      ),
      this.db.consultar<{ tasa: number }>(
        `SELECT COALESCE(sum(c.comision_pago)::float / NULLIF(sum(ve.total), 0), 0) AS tasa
         FROM ventas.costos_venta c JOIN ventas.ventas ve ON ve.id_venta = c.id_venta
         WHERE ve.fecha >= ($1::date AT TIME ZONE '${ZONA}') AND ve.fecha < ($2::date AT TIME ZONE '${ZONA}')`,
        [inicio, fin],
      ),
    ]);
    const tasaComision = comision[0]?.tasa ?? 0;

    // Series semanales por prenda y unidades por canal.
    const series = new Map<number, { total: number[]; ecommerce: number[]; pos: number[] }>();
    for (const fila of ventas) {
      const i = indice.get(fila.semana);
      if (i === undefined) continue;
      let serie = series.get(fila.id_variante);
      if (!serie) {
        serie = { total: Array(SEMANAS_HISTORIA).fill(0), ecommerce: Array(SEMANAS_HISTORIA).fill(0), pos: Array(SEMANAS_HISTORIA).fill(0) };
        series.set(fila.id_variante, serie);
      }
      serie.total[i] += fila.unidades;
      (fila.canal === 'POS' ? serie.pos : serie.ecommerce)[i] += fila.unidades;
    }

    // El método de cada tipo de demanda se elige con semanas pasadas, sin tocar las de validación.
    const seleccion = seleccionarMetodos(
      [...series.values()].map((s) => s.total),
      SEMANAS_VALIDACION,
      ORIGENES_SELECCION,
    );
    const vacia = Array(SEMANAS_HISTORIA).fill(0) as number[];
    const prendas: Prenda[] = variantes.map((v) => {
      const serie = series.get(v.id_variante);
      return {
        ...v,
        total: serie?.total ?? vacia,
        ecommerce: sumar(serie?.ecommerce ?? []),
        pos: sumar(serie?.pos ?? []),
        pronostico: pronosticar(serie?.total ?? vacia, horizonte, seleccion.elegidos),
      };
    });

    const costoDe = this.estimadorDeCosto(prendas);
    const comprar = this.compras(prendas, { horizonte, reposicion, z, tasaComision, costoDe, presupuesto });
    const noReinvertir = this.inmovilizados(prendas, horizonte, costoDe);

    const elegidas = comprar.filter((c) => c.dentroDelPresupuesto);
    const inversionSugerida = sumar(elegidas.map((c) => c.inversion));
    const margenEsperado = sumar(elegidas.map((c) => c.margenEsperado));

    // Semanas de historia real: desde la primera semana con ventas.
    const totalesSemana = semanas.map((_, i) => sumar(prendas.map((p) => p.total[i]!)));
    const primera = totalesSemana.findIndex((u) => u > 0);
    const semanasHistoria = primera === -1 ? 0 : SEMANAS_HISTORIA - primera;
    const validacion = validar(
      prendas.map((p) => p.total),
      SEMANAS_VALIDACION,
      seleccion.elegidos,
    );

    const metodos = new Map<Metodo, number>();
    for (const p of prendas) {
      if (p.pronostico.metodo !== 'SIN_VENTAS') metodos.set(p.pronostico.metodo, (metodos.get(p.pronostico.metodo) ?? 0) + 1);
    }

    const conCostoEstimado = new Set(comprar.filter((c) => c.costoEstimado).map((c) => c.producto));
    const avisos = this.avisos({
      ventasDemostracion: totales[0]?.demo ?? 0,
      semanasHistoria,
      conCostoEstimado: conCostoEstimado.size,
      tasaComision,
      proporcionCosto: costoDe.proporcion,
    });

    return {
      generadoEn: new Date().toISOString(),
      parametros: { horizonteSemanas: horizonte, reposicionSemanas: reposicion, nivelServicio: NIVEL_SERVICIO, presupuesto, semanasHistoria },
      modelo: {
        metodos: [...metodos].map(([nombre, cantidad]) => ({ nombre, descripcion: DESCRIPCION_METODO[nombre], variantes: cantidad })),
        seleccion: (['REGULAR', 'INTERMITENTE'] as const).map((tipo) => ({
          tipo,
          metodo: seleccion.elegidos[tipo],
          errores: Object.entries(seleccion.errores[tipo])
            .map(([metodo, error]) => ({ metodo, wape: redondear(error!, 3) }))
            .sort((a, b) => a.wape - b.wape),
        })),
        ventasAnalizadas: totales[0]?.ventas ?? 0,
        unidadesAnalizadas: sumar(totalesSemana),
        ventasDemostracion: totales[0]?.demo ?? 0,
        confianza: this.confianzaGlobal(semanasHistoria, validacion),
        validacion: validacion && { semanas: SEMANAS_VALIDACION, wapeModelo: redondear(validacion.wapeModelo, 3), wapeIngenuo: redondear(validacion.wapeIngenuo, 3) },
        avisos,
      },
      resumen: {
        inversionSugerida,
        ingresoEsperado: sumar(elegidas.map((c) => c.ingresoEsperado)),
        margenEsperado,
        roiEsperado: inversionSugerida > 0 ? redondear(margenEsperado / inversionSugerida, 3) : null,
        capitalInmovilizado: sumar(noReinvertir.map((p) => p.capitalInmovilizado)),
        unidadesProyectadas: Math.round(sumar(prendas.map((p) => sumar(p.pronostico.semanal)))),
      },
      serieSemanal: this.serie(semanas, series, prendas, horizonte, fin),
      comprar,
      noReinvertir,
      tendencias: {
        bandas: this.tendencias(prendas, (p) => p.banda),
        categorias: this.tendencias(prendas, (p) => p.categoria),
      },
      canales: this.mezcla(prendas),
    };
  }

  /**
   * Costo de compra de cada prenda. Sin costo registrado, se estima con la proporción
   * costo/precio típica (mediana) de su categoría, o de toda la tienda.
   */
  private estimadorDeCosto(prendas: Prenda[]): ((p: Prenda) => { costo: number; estimado: boolean }) & { proporcion: number | null } {
    const proporciones = new Map<string, number[]>();
    const vistos = new Set<string>();
    for (const p of prendas) {
      const clave = `${p.producto}|${p.categoria}`;
      if (p.precio && p.costo_compra !== null && !vistos.has(clave)) {
        vistos.add(clave);
        const lista = proporciones.get(p.categoria) ?? [];
        lista.push(p.costo_compra / p.precio);
        proporciones.set(p.categoria, lista);
      }
    }
    const mediana = (valores: number[]) => {
      const orden = [...valores].sort((a, b) => a - b);
      const mitad = Math.floor(orden.length / 2);
      return orden.length % 2 ? orden[mitad]! : (orden[mitad - 1]! + orden[mitad]!) / 2;
    };
    const todas = [...proporciones.values()].flat();
    const global = todas.length > 0 ? mediana(todas) : null;
    const estimar = (p: Prenda) => {
      if (p.costo_compra !== null) return { costo: p.costo_compra, estimado: false };
      const deCategoria = proporciones.get(p.categoria);
      const proporcion = deCategoria && deCategoria.length >= 2 ? mediana(deCategoria) : (global ?? 0.5);
      return { costo: Math.round((p.precio ?? 0) * proporcion), estimado: true };
    };
    return Object.assign(estimar, { proporcion: global });
  }

  private compras(
    prendas: Prenda[],
    o: {
      horizonte: number;
      reposicion: number;
      z: number;
      tasaComision: number;
      costoDe: (p: Prenda) => { costo: number; estimado: boolean };
      presupuesto: number | null;
    },
  ): RecomendacionCompra[] {
    const candidatas: RecomendacionCompra[] = [];
    for (const p of prendas) {
      if (!p.activo || p.precio === null || p.pronostico.metodo === 'SIN_VENTAS') continue;
      const demanda = sumar(p.pronostico.semanal);
      const ritmo = demanda / o.horizonte;
      const disponible = Math.max(0, p.disponible);
      // Cubrir la demanda del horizonte más un colchón por la variabilidad durante la reposición.
      const necesidad = demanda + stockSeguridad(p.pronostico.desviacion, o.reposicion, o.z) - disponible;
      const cantidad = Math.ceil(necesidad - 0.25);
      const cobertura = ritmo > 0 ? disponible / ritmo : null;
      // Si el stock alcanza para todo el horizonte, comprar ahora sería solo colchón sin ventas
      // esperadas: se vuelve a evaluar en la próxima revisión.
      if (cantidad <= 0 || (cobertura !== null && cobertura >= o.horizonte)) continue;

      const { costo, estimado } = o.costoDe(p);
      const vendibles = Math.max(0, Math.min(cantidad, demanda - disponible));
      const inversion = cantidad * costo;
      const ingreso = Math.round(vendibles * p.precio);
      const margen = Math.round(vendibles * (p.precio * (1 - o.tasaComision) - costo));
      const prioridad: Prioridad =
        cobertura !== null && cobertura < o.reposicion ? 'URGENTE' : cobertura !== null && cobertura < o.horizonte / 2 ? 'ALTA' : 'MEDIA';
      const canalPrincipal: CanalVenta = p.pos >= p.ecommerce ? 'POS' : 'ECOMMERCE';
      const { semanasConVentas, semanasObservadas } = p.pronostico;
      const confianza: Confianza = semanasConVentas >= 8 && semanasObservadas >= 12 ? 'ALTA' : semanasConVentas >= 3 ? 'MEDIA' : 'BAJA';

      const coberturaTexto =
        cobertura === null ? '' : disponible === 0 ? ' y no queda stock' : ` y quedan ${disponible} (alcanzan para ${numero(cobertura, 1)} semanas)`;
      const urgencia = prioridad === 'URGENTE' ? ' Se agota antes de que llegue una reposición.' : '';

      candidatas.push({
        idVariante: p.id_variante,
        sku: p.sku,
        producto: p.producto,
        banda: p.banda,
        categoria: p.categoria,
        talla: p.talla,
        color: p.color,
        prioridad,
        demandaProyectada: redondear(demanda, 1),
        disponible,
        coberturaSemanas: cobertura === null ? null : redondear(cobertura, 1),
        cantidadSugerida: cantidad,
        precio: p.precio,
        costoUnitario: costo,
        costoEstimado: estimado,
        inversion,
        ingresoEsperado: ingreso,
        margenEsperado: margen,
        roi: inversion > 0 ? redondear(margen / inversion, 3) : 0,
        canalPrincipal,
        ubicacionSugerida: canalPrincipal === 'POS' ? 'SALA_VENTAS' : 'BODEGA',
        dentroDelPresupuesto: true,
        confianza,
        metodo: p.pronostico.metodo,
        motivo: `Se proyectan ${numero(demanda, 1)} unidades en ${o.horizonte} semanas${coberturaTexto}.${urgencia}`,
      });
    }

    const orden: Record<Prioridad, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2 };
    candidatas.sort((a, b) => orden[a.prioridad] - orden[b.prioridad] || b.margenEsperado - a.margenEsperado || b.roi - a.roi);
    if (o.presupuesto !== null) {
      const elegidas = asignarPresupuesto(
        candidatas.map((c) => c.inversion),
        o.presupuesto,
      );
      candidatas.forEach((c, i) => (c.dentroDelPresupuesto = elegidas.has(i)));
    }
    return candidatas;
  }

  /** Stock que no se espera vender en el horizonte: capital que no conviene aumentar. */
  private inmovilizados(prendas: Prenda[], horizonte: number, costoDe: (p: Prenda) => { costo: number }): ProductoInmovilizado[] {
    const lista: ProductoInmovilizado[] = [];
    for (const p of prendas) {
      if (!p.activo || p.precio === null || p.disponible <= 0) continue;
      const demanda = sumar(p.pronostico.semanal);
      const vendidas12 = sumar(p.total.slice(-12));
      const exceso = p.disponible - Math.ceil(demanda);
      // Solo lo que dura mucho más que el horizonte o no se mueve hace tres meses.
      if (exceso <= 0 || (vendidas12 > 0 && p.disponible < 3 * Math.max(demanda, 1))) continue;
      const semanasDeStock = demanda > 0 ? (p.disponible / demanda) * horizonte : null;
      lista.push({
        idVariante: p.id_variante,
        sku: p.sku,
        producto: p.producto,
        talla: p.talla,
        color: p.color,
        disponible: p.disponible,
        vendidas12Semanas: vendidas12,
        demandaProyectada: redondear(demanda, 1),
        capitalInmovilizado: exceso * costoDe(p).costo,
        sugerencia:
          vendidas12 === 0
            ? 'Sin ventas en 12 semanas: no reponer; liquidar con descuento o darle vitrina en la tienda.'
            : `Hay stock para unas ${numero(semanasDeStock ?? 0)} semanas: no reponer hasta que baje del horizonte.`,
      });
    }
    return lista.sort((a, b) => b.capitalInmovilizado - a.capitalInmovilizado);
  }

  /** Últimas semanas contra las anteriores, por banda o categoría. */
  private tendencias(prendas: Prenda[], grupo: (p: Prenda) => string | null): Tendencia[] {
    const totales = new Map<string, { recientes: number; anteriores: number }>();
    for (const p of prendas) {
      const nombre = grupo(p);
      if (!nombre) continue;
      const actual = totales.get(nombre) ?? { recientes: 0, anteriores: 0 };
      actual.recientes += sumar(p.total.slice(-SEMANAS_TENDENCIA));
      actual.anteriores += sumar(p.total.slice(-2 * SEMANAS_TENDENCIA, -SEMANAS_TENDENCIA));
      totales.set(nombre, actual);
    }
    const lista: Tendencia[] = [];
    for (const [nombre, { recientes, anteriores }] of totales) {
      if (recientes === 0 && anteriores === 0) continue;
      const cambio = variacion(recientes, anteriores);
      // Con pocas unidades un cambio grande es ruido: de 3 a 12 no es una tendencia.
      const suficiente = recientes + anteriores >= MINIMO_TENDENCIA;
      const direccion = !suficiente
        ? 'ESTABLE'
        : cambio === null || cambio >= UMBRAL_TENDENCIA
          ? 'ALZA'
          : cambio <= -UMBRAL_TENDENCIA
            ? 'BAJA'
            : 'ESTABLE';
      const recomendacion = !suficiente
        ? `Pocas ventas (${recientes + anteriores} u. en ${2 * SEMANAS_TENDENCIA} semanas) para concluir una tendencia.`
        : cambio === null
          ? `Empezó a venderse en las últimas ${SEMANAS_TENDENCIA} semanas: prueba con más surtido y mide.`
          : direccion === 'ALZA'
            ? `Subió ${porcentaje(cambio)} en ${SEMANAS_TENDENCIA} semanas: aumenta su surtido y su visibilidad.`
            : direccion === 'BAJA'
              ? `Bajó ${porcentaje(cambio)} en ${SEMANAS_TENDENCIA} semanas: reduce la reposición y evalúa una promoción.`
              : 'Ventas estables: repón según la demanda pronosticada.';
      lista.push({
        nombre,
        unidadesRecientes: recientes,
        unidadesAnteriores: anteriores,
        variacion: cambio === null ? null : redondear(cambio, 3),
        direccion,
        recomendacion,
      });
    }
    return lista.sort((a, b) => (b.variacion ?? Infinity) - (a.variacion ?? Infinity) || b.unidadesRecientes - a.unidadesRecientes);
  }

  /** Qué parte de cada categoría se vende en la web y cuál en la tienda. */
  private mezcla(prendas: Prenda[]): MezclaCanal[] {
    const porCategoria = new Map<string, { ecommerce: number; pos: number }>();
    for (const p of prendas) {
      const actual = porCategoria.get(p.categoria) ?? { ecommerce: 0, pos: 0 };
      actual.ecommerce += p.ecommerce;
      actual.pos += p.pos;
      porCategoria.set(p.categoria, actual);
    }
    return [...porCategoria]
      .filter(([, { ecommerce, pos }]) => ecommerce + pos > 0)
      .map(([categoria, { ecommerce, pos }]) => {
        const web = ecommerce / (ecommerce + pos);
        return {
          categoria,
          unidades: ecommerce + pos,
          ecommerce: redondear(web, 3),
          recomendacion:
            web >= 0.65
              ? 'Se vende sobre todo en la web: guarda su stock en bodega para despachar rápido.'
              : web <= 0.35
                ? 'Se vende sobre todo en la tienda: mantén unidades en la sala de ventas.'
                : 'Se vende en ambos canales: reparte el stock entre sala y bodega.',
        };
      })
      .sort((a, b) => b.unidades - a.unidades);
  }

  private serie(
    semanas: string[],
    series: Map<number, { ecommerce: number[]; pos: number[] }>,
    prendas: Prenda[],
    horizonte: number,
    fin: string,
  ): PuntoSerie[] {
    const historia: PuntoSerie[] = semanas.map((semana, i) => {
      let ecommerce = 0;
      let pos = 0;
      for (const serie of series.values()) {
        ecommerce += serie.ecommerce[i]!;
        pos += serie.pos[i]!;
      }
      return { semana, ecommerce, pos, pronostico: null, minimo: null, maximo: null };
    });
    // Las prendas se tratan como independientes: las varianzas se suman.
    const desviacion = Math.sqrt(sumar(prendas.map((p) => p.pronostico.desviacion ** 2)));
    const futuro: PuntoSerie[] = Array.from({ length: horizonte }, (_, i) => {
      const valor = sumar(prendas.map((p) => p.pronostico.semanal[i]!));
      return {
        semana: sumarDias(fin, 7 * i),
        ecommerce: null,
        pos: null,
        pronostico: redondear(valor, 1),
        minimo: redondear(Math.max(0, valor - Z_INTERVALO * desviacion), 1),
        maximo: redondear(valor + Z_INTERVALO * desviacion, 1),
      };
    });
    return [...historia, ...futuro];
  }

  /** Alta solo con historia larga y un modelo que valida bien y le gana al promedio simple. */
  private confianzaGlobal(semanasHistoria: number, validacion: { wapeModelo: number; wapeIngenuo: number } | null): Confianza {
    if (semanasHistoria >= 12 && validacion && validacion.wapeModelo <= 0.5 && validacion.wapeModelo <= validacion.wapeIngenuo) return 'ALTA';
    return semanasHistoria >= 6 ? 'MEDIA' : 'BAJA';
  }

  private avisos(d: {
    ventasDemostracion: number;
    semanasHistoria: number;
    conCostoEstimado: number;
    tasaComision: number;
    proporcionCosto: number | null;
  }): string[] {
    const avisos: string[] = [];
    if (d.ventasDemostracion > 0) {
      avisos.push(
        `Incluye ${numero(d.ventasDemostracion)} ventas de demostración. Para decidir solo con ventas reales, quítalas con "npm run semilla:historial:quitar".`,
      );
    }
    if (d.semanasHistoria < 8) {
      avisos.push(`Hay ventas de solo ${d.semanasHistoria} semanas completas: las recomendaciones son preliminares.`);
    }
    if (d.conCostoEstimado > 0) {
      const base = d.proporcionCosto === null ? 'un 50% del precio' : `la proporción típica de su categoría (≈${numero(d.proporcionCosto * 100)}% del precio en la tienda)`;
      avisos.push(`${d.conCostoEstimado} productos recomendados no tienen costo de compra: se estimó con ${base}. Regístralo para afinar el retorno.`);
    }
    if (d.tasaComision === 0) {
      avisos.push('Las comisiones de los medios de pago están en 0%: el margen esperado no descuenta comisiones.');
    }
    avisos.push('La semana en curso no se usa: el modelo trabaja con semanas completas.');
    return avisos;
  }
}
