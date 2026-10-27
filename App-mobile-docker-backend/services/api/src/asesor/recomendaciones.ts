import type {
  AccionRecomendada,
  BandaDelMomento,
  ProductoPorReponer,
  RecomendacionDeBanda,
  RecomendacionDeCategoria,
  Recomendaciones,
} from '@rockstar/contracts';

import { type Popularidad, claveDeArtista } from './popularidad.service.js';
import type { ResumenDeNegocio } from './resumen.js';

/**
 * Recomendaciones de inversión por reglas: sin IA, y cada puntaje se puede explicar. El
 * puntaje de una banda (0 a 100) suma cuatro cosas, de la que más pesa a la que menos:
 *
 *   concierto en Chile   hasta 40   mientras más cerca, más: es cuando más se vende su ropa
 *   ventas recientes     hasta 25   sus unidades de los últimos 30 días frente a la banda que más vende
 *   popularidad          hasta 25   20 por su lugar en seguidores entre las bandas de la tienda,
 *                                   más 5 si tiene canciones en los rankings actuales
 *   stock                ±10        suma si se vende y queda poco; resta si hay stock detenido
 *
 * Con 40 puntos o más conviene invertir; con menos de 20, no priorizar.
 */
const PUNTAJE_INVERTIR = 40;
const PUNTAJE_MANTENER = 20;

const PUNTOS_POR_CONCIERTO: [dias: number, puntos: number][] = [
  [90, 40],
  [180, 30],
  [365, 20],
];
const PUNTOS_POR_VENTAS = 25;
const PUNTOS_POR_FANS = 20;
const PUNTOS_POR_RANKING = 5;
const PUNTOS_POR_STOCK = 10;

/** Con menos ventas que estas, no vender no dice nada todavía: no se castiga el stock detenido. */
const VENTAS_PARA_JUZGAR = 10;
/** Unidades sin vender a partir de las cuales el stock se considera detenido. */
const STOCK_DETENIDO = 10;
/** Parte de las unidades vendidas desde la cual una categoría es de las que más venden. */
const PARTE_DESTACADA = 0.2;
/** Parte de las unidades vendidas desde la cual una categoría es la principal de la tienda. */
const PARTE_PRINCIPAL = 0.4;
/** Meses de venta que debe cubrir el stock de una categoría para no necesitar más compra. */
const MESES_DE_STOCK_SUFICIENTE = 3;
const MAXIMO_POR_REPONER = 8;
const MAXIMO_DEL_MOMENTO = 10;

const DIA = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const unidades = (n: number) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

/** Seguidores en palabras: "3,8 millones de seguidores", "935 mil seguidores". */
function seguidores(fans: number): string {
  if (fans >= 1_000_000) {
    return `${(fans / 1_000_000).toFixed(1).replace('.', ',')} millones de seguidores`;
  }
  return `${fans >= 1000 ? `${Math.round(fans / 1000)} mil` : fans} seguidores`;
}

const accionPara = (puntaje: number): AccionRecomendada =>
  puntaje >= PUNTAJE_INVERTIR ? 'INVERTIR' : puntaje >= PUNTAJE_MANTENER ? 'MANTENER' : 'NO_PRIORIZAR';

interface Motivo {
  puntos: number;
  texto: string;
}

export function recomendar(resumen: ResumenDeNegocio, popularidad: Popularidad, ahora = new Date()): Recomendaciones {
  const hayVentasParaJuzgar = resumen.ventas.pagadas >= VENTAS_PARA_JUZGAR;
  const vendidasEnTotal = resumen.porCategoria.reduce((suma, categoria) => suma + categoria.unidadesVendidas, 0);
  // Tipos de producto que proponerle a una banda: los que más vende la tienda, entre los que
  // son de bandas (un pantalón no lo es), y solo cuando hay ventas suficientes para saberlo.
  const categoriasDeBandas = new Set(resumen.productos.filter((p) => p.banda !== null).map((p) => p.categoria));
  const categoriasDestacadas = resumen.porCategoria
    .filter((categoria) => hayVentasParaJuzgar && categoriasDeBandas.has(categoria.nombre) && categoria.unidadesVendidas / vendidasEnTotal >= PARTE_DESTACADA)
    .map((categoria) => categoria.nombre);

  // --- Bandas ---
  const maximoVendido = Math.max(0, ...resumen.porBanda.map((banda) => banda.unidadesVendidasUltimos30Dias));
  const porSeguidores = resumen.porBanda
    .flatMap((banda) => {
      const fans = popularidad.fans.get(claveDeArtista(banda.nombre));
      return fans === undefined ? [] : [{ nombre: banda.nombre, fans }];
    })
    .sort((a, b) => b.fans - a.fans);

  const bandas = resumen.porBanda.map<RecomendacionDeBanda>((banda) => {
    const motivos: Motivo[] = [];
    const categorias = [...new Set(resumen.productos.filter((p) => p.banda === banda.nombre).map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'));

    const dias = banda.conciertoEnChile ? Math.round((Date.parse(banda.conciertoEnChile.fecha) - Date.parse(resumen.fecha)) / MS_POR_DIA) : null;
    const concierto = banda.conciertoEnChile !== null && dias !== null && dias >= 0 && dias <= 365 ? { ...banda.conciertoEnChile, diasRestantes: dias } : null;
    if (concierto) {
      const puntos = PUNTOS_POR_CONCIERTO.find(([limite]) => concierto.diasRestantes <= limite)![1];
      const cuando = concierto.diasRestantes === 0 ? 'hoy' : concierto.diasRestantes === 1 ? 'mañana' : `en ${concierto.diasRestantes} días`;
      motivos.push({ puntos, texto: `Toca en Chile el ${DIA.format(new Date(`${concierto.fecha}T00:00:00Z`))}, ${cuando}${concierto.lugar ? ` (${concierto.lugar})` : ''}.` });
    }

    if (maximoVendido > 0 && banda.unidadesVendidasUltimos30Dias > 0) {
      const esLaPrimera = banda.unidadesVendidasUltimos30Dias === maximoVendido;
      motivos.push({
        puntos: Math.round((PUNTOS_POR_VENTAS * banda.unidadesVendidasUltimos30Dias) / maximoVendido),
        texto: `Vendió ${unidades(banda.unidadesVendidasUltimos30Dias)} en los últimos 30 días${esLaPrimera ? ': es la banda que más vende' : ''}.`,
      });
    }

    const lugar = porSeguidores.findIndex((otra) => otra.nombre === banda.nombre);
    const fans = lugar >= 0 ? porSeguidores[lugar]!.fans : null;
    if (fans !== null) {
      const parte = porSeguidores.length > 1 ? 1 - lugar / (porSeguidores.length - 1) : 1;
      motivos.push({
        puntos: Math.round(PUNTOS_POR_FANS * parte),
        texto: `Tiene ${seguidores(fans)} en Deezer: es la ${lugar + 1}.ª de las ${porSeguidores.length} bandas de la tienda.`,
      });
    }
    const enRanking = popularidad.ranking.get(claveDeArtista(banda.nombre));
    if (enRanking) {
      motivos.push({
        puntos: PUNTOS_POR_RANKING,
        texto: `Tiene ${enRanking.canciones} ${enRanking.canciones === 1 ? 'canción' : 'canciones'} en los rankings actuales de metal y rock de Deezer.`,
      });
    }

    if (banda.unidadesVendidasUltimos30Dias > 0 && banda.unidadesEnStock <= banda.unidadesVendidasUltimos30Dias) {
      motivos.push({
        puntos: PUNTOS_POR_STOCK,
        texto: banda.unidadesEnStock === 0 ? 'Se vende y ya no le quedan unidades.' : `Le quedan ${unidades(banda.unidadesEnStock)}: menos de un mes al ritmo de venta actual.`,
      });
    } else if (hayVentasParaJuzgar && banda.unidadesVendidasUltimos30Dias === 0 && banda.unidadesEnStock >= STOCK_DETENIDO) {
      motivos.push({ puntos: -PUNTOS_POR_STOCK, texto: `Tiene ${unidades(banda.unidadesEnStock)} en stock y no vendió ninguna en 30 días.` });
    }
    if (banda.productos === 0) {
      motivos.push({ puntos: 0, texto: 'Está registrada, pero la tienda aún no vende productos suyos.' });
    }

    const puntaje = Math.min(100, Math.max(0, motivos.reduce((suma, motivo) => suma + motivo.puntos, 0)));
    const accion = accionPara(puntaje);
    return {
      banda: banda.nombre,
      puntaje,
      accion,
      motivos: motivos.sort((a, b) => Math.abs(b.puntos) - Math.abs(a.puntos)).map((motivo) => motivo.texto),
      productos: banda.productos,
      unidadesEnStock: banda.unidadesEnStock,
      unidadesVendidas: banda.unidadesVendidas,
      unidadesVendidasUltimos30Dias: banda.unidadesVendidasUltimos30Dias,
      ingresos: banda.ingresos,
      categorias,
      // A una banda en que conviene invertir le faltan los tipos de producto que más vende la tienda.
      categoriasPorSumar: accion === 'INVERTIR' ? categoriasDestacadas.filter((categoria) => !categorias.includes(categoria)) : [],
      fans,
      cancionesEnRanking: enRanking?.canciones ?? 0,
      conciertoEnChile: concierto,
    };
  });
  bandas.sort((a, b) => b.puntaje - a.puntaje || a.banda.localeCompare(b.banda, 'es'));

  // --- Tipos de producto ---
  const vendidasEn30Dias = resumen.porCategoria.reduce((suma, categoria) => suma + categoria.unidadesVendidasUltimos30Dias, 0);
  const categorias = resumen.porCategoria.map<RecomendacionDeCategoria>((categoria) => {
    const motivos: string[] = [];
    let accion: AccionRecomendada = 'MANTENER';
    const vendidas = categoria.unidadesVendidasUltimos30Dias;
    const parte = vendidasEn30Dias > 0 ? vendidas / vendidasEn30Dias : 0;

    if (vendidas > 0) {
      motivos.push(`Vendió ${unidades(vendidas)} en los últimos 30 días: el ${Math.round(parte * 100)} % de lo que vende la tienda.`);
      if (categoria.unidadesEnStock <= vendidas) {
        accion = 'INVERTIR';
        motivos.push(categoria.unidadesEnStock === 0 ? 'Ya no le quedan unidades.' : `Le quedan ${unidades(categoria.unidadesEnStock)}: menos de un mes al ritmo de venta actual.`);
      } else {
        motivos.push(`Tiene ${unidades(categoria.unidadesEnStock)} en stock.`);
        // Lo que más vende merece más compra solo si su stock no alcanza para mucho tiempo.
        if (hayVentasParaJuzgar && parte >= PARTE_PRINCIPAL && categoria.unidadesEnStock <= vendidas * MESES_DE_STOCK_SUFICIENTE) {
          accion = 'INVERTIR';
        }
      }
    } else if (!hayVentasParaJuzgar) {
      motivos.push(`Sin ventas en los últimos 30 días, pero la tienda aún tiene pocas ventas para sacar conclusiones. Tiene ${unidades(categoria.unidadesEnStock)} en stock.`);
    } else {
      accion = 'NO_PRIORIZAR';
      motivos.push(
        categoria.unidadesEnStock > 0
          ? `No vendió nada en los últimos 30 días y tiene ${unidades(categoria.unidadesEnStock)} en stock.`
          : 'No vendió nada en los últimos 30 días y no tiene stock.',
      );
    }
    return {
      categoria: categoria.nombre,
      accion,
      motivos,
      productos: categoria.productos,
      unidadesEnStock: categoria.unidadesEnStock,
      unidadesVendidas: categoria.unidadesVendidas,
      unidadesVendidasUltimos30Dias: vendidas,
      ingresos: categoria.ingresos,
    };
  });
  categorias.sort((a, b) => b.unidadesVendidasUltimos30Dias - a.unidadesVendidasUltimos30Dias || a.categoria.localeCompare(b.categoria, 'es'));

  // --- Productos que se venden y se acaban ---
  const porReponer = resumen.productos
    .filter((p) => p.unidadesVendidasUltimos30Dias > 0 && (p.unidadesEnStock <= p.unidadesVendidasUltimos30Dias || p.tallasAgotadas.length > 0))
    .sort((a, b) => b.unidadesVendidasUltimos30Dias - a.unidadesVendidasUltimos30Dias || a.unidadesEnStock - b.unidadesEnStock)
    .slice(0, MAXIMO_POR_REPONER)
    .map<ProductoPorReponer>((p) => ({
      producto: p.producto,
      banda: p.banda,
      categoria: p.categoria,
      unidadesEnStock: p.unidadesEnStock,
      unidadesVendidasUltimos30Dias: p.unidadesVendidasUltimos30Dias,
      tallasAgotadas: p.tallasAgotadas,
    }));

  // --- Bandas con canciones en los rankings que la tienda no vende ---
  const propias = new Set(resumen.porBanda.map((banda) => claveDeArtista(banda.nombre)));
  const bandasDelMomento = [...popularidad.ranking]
    .filter(([clave]) => !propias.has(clave))
    .map<BandaDelMomento>(([, artista]) => ({ banda: artista.nombre, cancionesEnRanking: artista.canciones, mejorPuesto: artista.mejorPuesto }))
    .sort((a, b) => b.cancionesEnRanking - a.cancionesEnRanking || a.mejorPuesto - b.mejorPuesto)
    .slice(0, MAXIMO_DEL_MOMENTO);

  return {
    generadoEn: ahora.toISOString(),
    ventasPagadas: resumen.ventas.pagadas,
    popularidadDisponible: popularidad.disponible,
    bandas,
    categorias,
    porReponer,
    bandasDelMomento,
  };
}
