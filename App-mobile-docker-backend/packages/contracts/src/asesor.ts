/**
 * Asesor de inversión del Gerente: un asistente que cruza los datos de la tienda (ventas,
 * stock, ofertas, conciertos) con lo que encuentra en internet sobre las bandas, y
 * recomienda en qué bandas y tipos de producto invertir.
 */

/** Un turno de la conversación con el asesor. */
export interface MensajeAsesor {
  rol: 'usuario' | 'asesor';
  texto: string;
}

/**
 * POST /asesor/consultas (Gerente)
 *
 * Envía la conversación completa: el servicio no guarda nada entre consultas. El primer
 * mensaje y el último deben ser del usuario. Responde lo que contesta el asesor.
 *
 * - Sin la clave del servicio de IA responde `503 ASESOR_NO_CONFIGURADO`.
 * - Si el servicio de IA falla o no contesta responde `503 ASESOR_NO_DISPONIBLE`.
 */
export interface ConsultaAsesorRequest {
  mensajes: MensajeAsesor[];
}

/** Página de internet en que el asesor apoyó su respuesta. */
export interface FuenteAsesor {
  titulo: string;
  url: string;
}

export interface RespuestaAsesor {
  /** Texto plano, sin formato. */
  texto: string;
  fuentes: FuenteAsesor[];
}

/** GET /asesor/estado (Gerente) */
export interface EstadoAsesor {
  /** Falso mientras el servicio no tenga la clave del servicio de IA. */
  configurado: boolean;
}

/** Qué conviene hacer con una banda o un tipo de producto, según las reglas del asesor. */
export type AccionRecomendada = 'INVERTIR' | 'MANTENER' | 'NO_PRIORIZAR';

/** Recomendación sobre una banda, con los datos que la sostienen. */
export interface RecomendacionDeBanda {
  banda: string;
  /** De 0 a 100: cuánto conviene poner presupuesto en la banda. */
  puntaje: number;
  accion: AccionRecomendada;
  /** Las razones del puntaje, listas para leer, de la que más pesó a la que menos. */
  motivos: string[];
  productos: number;
  unidadesEnStock: number;
  unidadesVendidas: number;
  unidadesVendidasUltimos30Dias: number;
  ingresos: number;
  /** Categorías en que la banda tiene productos. */
  categorias: string[];
  /** Categorías que venden bien en la tienda y en las que la banda aún no tiene productos. */
  categoriasPorSumar: string[];
  /** Seguidores de la banda en Deezer; `null` si no se pudo consultar o no se encontró. */
  fans: number | null;
  /** Canciones de la banda en los rankings actuales de metal y rock de Deezer. */
  cancionesEnRanking: number;
  conciertoEnChile: { fecha: string; lugar: string | null; diasRestantes: number } | null;
}

/** Recomendación sobre un tipo de producto (una categoría). */
export interface RecomendacionDeCategoria {
  categoria: string;
  accion: AccionRecomendada;
  motivos: string[];
  productos: number;
  unidadesEnStock: number;
  unidadesVendidas: number;
  unidadesVendidasUltimos30Dias: number;
  ingresos: number;
}

/** Producto que se vende y se está quedando sin unidades. */
export interface ProductoPorReponer {
  producto: string;
  banda: string | null;
  categoria: string;
  unidadesEnStock: number;
  unidadesVendidasUltimos30Dias: number;
  tallasAgotadas: string[];
}

/** Banda con canciones en los rankings actuales de Deezer de la que la tienda no vende nada. */
export interface BandaDelMomento {
  banda: string;
  cancionesEnRanking: number;
  /** Mejor puesto de una de sus canciones, desde 1. */
  mejorPuesto: number;
}

/**
 * Recomendaciones de inversión calculadas con reglas, sin IA. GET /asesor/recomendaciones (Gerente)
 *
 * Cruzan lo que la tienda registra (ventas pagadas, stock, conciertos de las bandas en
 * Chile) con la popularidad de las bandas en Deezer, que se consulta por internet. Si
 * Deezer no responde, se calculan igual con los datos de la tienda.
 */
export interface Recomendaciones {
  generadoEn: string;
  /** Ventas pagadas en que se apoyan; con pocas, pesan más los conciertos y la popularidad. */
  ventasPagadas: number;
  /** Falso si no se pudo consultar Deezer en este cálculo. */
  popularidadDisponible: boolean;
  bandas: RecomendacionDeBanda[];
  categorias: RecomendacionDeCategoria[];
  porReponer: ProductoPorReponer[];
  bandasDelMomento: BandaDelMomento[];
}
