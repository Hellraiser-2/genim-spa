/**
 * GET /analitica/recomendaciones (Gerente)
 *
 * Modelo predictivo de inversión: pronostica la demanda de cada prenda con lo que se vendió
 * en el e-commerce y en la tienda física, y recomienda qué comprar, qué no reponer y en qué
 * bandas o categorías conviene invertir.
 *
 * Parámetros de la consulta, todos opcionales:
 * - `horizonte`: semanas a pronosticar, de 4 a 26 (8 por defecto).
 * - `presupuesto`: pesos disponibles para comprar; reparte las compras por retorno esperado.
 * - `reposicion`: semanas que tarda en llegar una compra, de 1 a 8 (2 por defecto).
 */

export type Confianza = 'ALTA' | 'MEDIA' | 'BAJA';
export type CanalVenta = 'ECOMMERCE' | 'POS';

export interface RecomendacionesInversion {
  generadoEn: string;
  parametros: {
    horizonteSemanas: number;
    reposicionSemanas: number;
    /** Probabilidad buscada de no quedar sin stock durante la reposición. */
    nivelServicio: number;
    presupuesto: number | null;
    /** Semanas completas de ventas que usa el modelo. */
    semanasHistoria: number;
  };
  modelo: ResumenModelo;
  resumen: ResumenInversion;
  /** Unidades vendidas por semana y canal, y el pronóstico de las semanas que vienen. */
  serieSemanal: PuntoSerie[];
  comprar: RecomendacionCompra[];
  noReinvertir: ProductoInmovilizado[];
  tendencias: { bandas: Tendencia[]; categorias: Tendencia[] };
  /** Por categoría: qué parte de las unidades se vende en cada canal. */
  canales: MezclaCanal[];
}

export type TipoDemanda = 'REGULAR' | 'INTERMITENTE';

export interface ResumenModelo {
  /** Métodos usados y en cuántas prendas. */
  metodos: { nombre: string; descripcion: string; variantes: number }[];
  /**
   * Cómo se eligió el método de cada tipo de demanda: el que menos erró (WAPE) al
   * pronosticar semanas pasadas que no se usan en la validación.
   */
  seleccion: { tipo: TipoDemanda; metodo: string; errores: { metodo: string; wape: number }[] }[];
  ventasAnalizadas: number;
  unidadesAnalizadas: number;
  /** Ventas de demostración incluidas (script `semilla:historial`). */
  ventasDemostracion: number;
  confianza: Confianza;
  /**
   * Validación con las últimas semanas: el modelo se entrena sin ellas y se compara su
   * pronóstico con lo que de verdad se vendió. WAPE = error absoluto total / unidades reales.
   * `null` si no hay historia suficiente para separar semanas de prueba.
   */
  validacion: { semanas: number; wapeModelo: number; wapeIngenuo: number } | null;
  avisos: string[];
}

export interface ResumenInversion {
  /** Costo de todas las compras recomendadas (o de las que caben en el presupuesto). */
  inversionSugerida: number;
  ingresoEsperado: number;
  margenEsperado: number;
  /** Margen esperado / inversión; `null` sin inversión. */
  roiEsperado: number | null;
  /** Costo del stock que el modelo no espera vender en el horizonte. */
  capitalInmovilizado: number;
  /** Unidades que se espera vender en el horizonte, todas las prendas. */
  unidadesProyectadas: number;
}

export interface PuntoSerie {
  /** Lunes de la semana, AAAA-MM-DD. */
  semana: string;
  ecommerce: number | null;
  pos: number | null;
  /** Solo en las semanas futuras. */
  pronostico: number | null;
  minimo: number | null;
  maximo: number | null;
}

export type Prioridad = 'URGENTE' | 'ALTA' | 'MEDIA';

export interface RecomendacionCompra {
  idVariante: number;
  sku: string;
  producto: string;
  banda: string | null;
  categoria: string;
  talla: string;
  color: string;
  prioridad: Prioridad;
  /** Unidades que se espera vender en el horizonte. */
  demandaProyectada: number;
  disponible: number;
  /** Semanas que alcanza el stock disponible al ritmo pronosticado. */
  coberturaSemanas: number | null;
  cantidadSugerida: number;
  precio: number;
  costoUnitario: number;
  /** El producto no tiene costo de compra registrado: se estimó con el de productos parecidos. */
  costoEstimado: boolean;
  inversion: number;
  ingresoEsperado: number;
  margenEsperado: number;
  roi: number;
  /** Dónde se vende más: decide si las unidades van a la sala de ventas o a la bodega. */
  canalPrincipal: CanalVenta;
  ubicacionSugerida: 'SALA_VENTAS' | 'BODEGA';
  dentroDelPresupuesto: boolean;
  confianza: Confianza;
  metodo: string;
  motivo: string;
}

export interface ProductoInmovilizado {
  idVariante: number;
  sku: string;
  producto: string;
  talla: string;
  color: string;
  disponible: number;
  vendidas12Semanas: number;
  demandaProyectada: number;
  /** Costo de las unidades que no se espera vender en el horizonte. */
  capitalInmovilizado: number;
  sugerencia: string;
}

export interface Tendencia {
  nombre: string;
  unidadesRecientes: number;
  unidadesAnteriores: number;
  /** Cambio entre las últimas semanas y las anteriores, en fracción: 0.25 es +25%. */
  variacion: number | null;
  direccion: 'ALZA' | 'ESTABLE' | 'BAJA';
  recomendacion: string;
}

export interface MezclaCanal {
  categoria: string;
  unidades: number;
  /** Fracción de las unidades vendidas en el e-commerce; el resto, en la tienda. */
  ecommerce: number;
  recomendacion: string;
}
