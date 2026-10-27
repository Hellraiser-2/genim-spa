/**
 * Modelo de demanda: pronóstico de unidades por semana de cada prenda.
 *
 * Cada serie se clasifica con el criterio de Syntetos y Boylan: si el intervalo medio
 * entre semanas con ventas (ADI) es de 1,32 o más, la demanda es intermitente (muchas
 * semanas sin ventas, típico de una prenda en una talla y color); si no, es regular.
 *
 * El método no se fija a mano: para cada tipo de demanda se prueban cuatro métodos en
 * semanas pasadas que el modelo no usa para entrenar, y se queda el que menos erró.
 * El error que se informa se mide en semanas distintas de las usadas para elegir.
 *
 * Todo aquí es puro: recibe series de unidades por semana, de la más antigua a la más reciente.
 */

export type Metodo = 'SES' | 'SBA' | 'HOLT' | 'MEDIA_MOVIL' | 'SIN_VENTAS';
export type MetodoCandidato = Exclude<Metodo, 'SIN_VENTAS'>;
export type TipoDemanda = 'REGULAR' | 'INTERMITENTE';

export const CANDIDATOS: MetodoCandidato[] = ['SES', 'SBA', 'HOLT', 'MEDIA_MOVIL'];

export const DESCRIPCION_METODO: Record<Metodo, string> = {
  SES: 'Suavizado exponencial simple',
  SBA: 'Syntetos-Boylan (Croston corregido), para demanda intermitente',
  HOLT: 'Holt con tendencia amortiguada',
  MEDIA_MOVIL: 'Media móvil de 8 semanas',
  SIN_VENTAS: 'Sin ventas en el periodo: demanda cero',
};

/** Métodos que se usan si no hay historia suficiente para elegir. */
export const METODOS_POR_DEFECTO: Record<TipoDemanda, MetodoCandidato> = { REGULAR: 'HOLT', INTERMITENTE: 'SBA' };

/** Umbral de Syntetos-Boylan entre demanda regular e intermitente. */
export const ADI_INTERMITENTE = 1.32;

/** Cuantiles de la normal estándar para los niveles de servicio que se ofrecen. */
export const Z_POR_NIVEL: Record<number, number> = { 0.9: 1.2816, 0.95: 1.6449, 0.98: 2.0537 };

export interface Pronostico {
  metodo: Metodo;
  tipo: TipoDemanda | null;
  /** Unidades esperadas en cada semana del horizonte. */
  semanal: number[];
  /** Desviación de la demanda semanal: alimenta el stock de seguridad y el intervalo. */
  desviacion: number;
  /** Semanas desde la primera venta, con y sin ventas. */
  semanasObservadas: number;
  semanasConVentas: number;
}

const sumar = (valores: number[]) => valores.reduce((s, v) => s + v, 0);

export function media(valores: number[]): number {
  return valores.length === 0 ? 0 : sumar(valores) / valores.length;
}

/** Desviación estándar muestral. */
export function desviacionEstandar(valores: number[]): number {
  if (valores.length < 2) return 0;
  const m = media(valores);
  return Math.sqrt(valores.reduce((s, v) => s + (v - m) ** 2, 0) / (valores.length - 1));
}

/** La serie desde su primera venta: las semanas previas son de antes de que la prenda se vendiera. */
export function desdePrimeraVenta(serie: number[]): number[] {
  const inicio = serie.findIndex((u) => u > 0);
  return inicio === -1 ? [] : serie.slice(inicio);
}

/** Intervalo medio entre semanas con ventas (ADI). Infinito si no hubo ventas. */
export function intervaloMedio(serie: number[]): number {
  const conVentas = serie.filter((u) => u > 0).length;
  return conVentas === 0 ? Infinity : serie.length / conVentas;
}

/** Regular o intermitente, sobre la serie desde su primera venta. `null` si nunca se vendió. */
export function tipoDemanda(serie: number[]): TipoDemanda | null {
  const observada = desdePrimeraVenta(serie);
  if (observada.length === 0) return null;
  return intervaloMedio(observada) >= ADI_INTERMITENTE || observada.length < 4 ? 'INTERMITENTE' : 'REGULAR';
}

/** Suavizado exponencial simple: un nivel que se acerca a cada semana en la fracción α. */
export function ses(serie: number[], alfa = 0.15): number {
  if (serie.length === 0) return 0;
  let nivel = media(serie.slice(0, 4));
  for (const unidades of serie) nivel += alfa * (unidades - nivel);
  return nivel;
}

/**
 * Syntetos-Boylan: suaviza por separado el tamaño de cada venta y el intervalo entre
 * ventas, y pronostica su cociente con el factor (1 − α/2). Devuelve unidades por semana.
 */
export function sba(serie: number[], alfa = 0.2): number {
  let tamano: number | null = null;
  let intervalo = 0;
  let desdeUltima = 1;
  for (const unidades of serie) {
    if (unidades > 0) {
      if (tamano === null) {
        tamano = unidades;
        intervalo = desdeUltima;
      } else {
        tamano += alfa * (unidades - tamano);
        intervalo += alfa * (desdeUltima - intervalo);
      }
      desdeUltima = 1;
    } else {
      desdeUltima++;
    }
  }
  return tamano === null ? 0 : (1 - alfa / 2) * (tamano / intervalo);
}

/**
 * Holt con tendencia amortiguada: nivel y pendiente suavizados, y una pendiente que se
 * apaga con φ para no proyectar crecimientos sin límite. Devuelve `h` semanas, nunca negativas.
 */
export function holtAmortiguado(serie: number[], h: number, { alfa = 0.3, beta = 0.1, phi = 0.9 } = {}): number[] {
  if (serie.length === 0) return Array(h).fill(0);
  let nivel = serie[0]!;
  let pendiente = serie.length > 1 ? serie[1]! - serie[0]! : 0;
  for (let t = 1; t < serie.length; t++) {
    const anterior = nivel;
    nivel = alfa * serie[t]! + (1 - alfa) * (nivel + phi * pendiente);
    pendiente = beta * (nivel - anterior) + (1 - beta) * phi * pendiente;
  }
  const pronostico: number[] = [];
  let acumulado = 0;
  for (let i = 1; i <= h; i++) {
    acumulado += phi ** i;
    pronostico.push(Math.max(0, nivel + acumulado * pendiente));
  }
  return pronostico;
}

/** Promedio de las últimas `ventana` semanas. */
export function mediaMovil(serie: number[], ventana = 8): number {
  return media(serie.slice(-ventana));
}

/** Pronóstico de `h` semanas con un método dado, sobre la serie desde su primera venta. */
export function pronosticarCon(metodo: MetodoCandidato, serie: number[], h: number): number[] {
  const observada = desdePrimeraVenta(serie);
  if (observada.length === 0) return Array(h).fill(0);
  if (metodo === 'HOLT') return holtAmortiguado(observada, h);
  const nivel = metodo === 'SES' ? ses(observada) : metodo === 'SBA' ? sba(observada) : mediaMovil(observada);
  return Array(h).fill(nivel);
}

/** Pronóstico de `h` semanas con el método elegido para el tipo de demanda de la serie. */
export function pronosticar(serie: number[], h: number, metodos: Record<TipoDemanda, MetodoCandidato> = METODOS_POR_DEFECTO): Pronostico {
  const observada = desdePrimeraVenta(serie);
  const semanasConVentas = observada.filter((u) => u > 0).length;
  const tipo = tipoDemanda(serie);
  if (tipo === null) {
    return { metodo: 'SIN_VENTAS', tipo: null, semanal: Array(h).fill(0), desviacion: 0, semanasObservadas: 0, semanasConVentas: 0 };
  }
  const metodo = metodos[tipo];
  const semanal = pronosticarCon(metodo, serie, h);
  // Con pocas semanas la desviación muestral subestima: al menos la de una demanda de Poisson.
  const desviacion = Math.max(desviacionEstandar(observada), Math.sqrt(media(semanal)));
  return { metodo, tipo, semanal, desviacion, semanasObservadas: observada.length, semanasConVentas };
}

/** Error porcentual absoluto ponderado: Σ|pronóstico − real| / Σ real. `null` si no hubo ventas reales. */
export function wape(reales: number[], pronosticos: number[]): number | null {
  const total = sumar(reales);
  if (total === 0) return null;
  return reales.reduce((s, real, i) => s + Math.abs((pronosticos[i] ?? 0) - real), 0) / total;
}

/**
 * Prueba un pronóstico en una ventana pasada: corta cada serie `atras` semanas antes del
 * final, pronostica las `h` semanas siguientes y suma lo pronosticado y lo vendido.
 */
function ventana(
  series: number[][],
  atras: number,
  h: number,
  pronostico: (entrenamiento: number[], tipo: TipoDemanda) => number[],
): Map<TipoDemanda, { reales: number[]; pronosticos: number[] }> {
  const porTipo = new Map<TipoDemanda, { reales: number[]; pronosticos: number[] }>();
  for (const serie of series) {
    if (serie.length < atras + 4) continue;
    const entrenamiento = serie.slice(0, serie.length - atras);
    const tipo = tipoDemanda(entrenamiento);
    if (tipo === null) continue;
    const grupo = porTipo.get(tipo) ?? { reales: [], pronosticos: [] };
    grupo.reales.push(sumar(serie.slice(serie.length - atras, serie.length - atras + h)));
    grupo.pronosticos.push(sumar(pronostico(entrenamiento, tipo)));
    porTipo.set(tipo, grupo);
  }
  return porTipo;
}

export interface Seleccion {
  elegidos: Record<TipoDemanda, MetodoCandidato>;
  /** Error de cada método candidato en las ventanas de selección, por tipo de demanda. */
  errores: Record<TipoDemanda, Partial<Record<MetodoCandidato, number>>>;
}

/**
 * Elige, para cada tipo de demanda, el método que menos erró pronosticando `h` semanas
 * desde cada uno de los `origenes` (semanas antes del final). Sin historia suficiente,
 * quedan los métodos por defecto.
 */
export function seleccionarMetodos(series: number[][], h = 4, origenes = [8, 12]): Seleccion {
  const acumulado: Record<TipoDemanda, Partial<Record<MetodoCandidato, { reales: number[]; pronosticos: number[] }>>> = {
    REGULAR: {},
    INTERMITENTE: {},
  };
  for (const metodo of CANDIDATOS) {
    for (const atras of origenes) {
      for (const [tipo, { reales, pronosticos }] of ventana(series, atras, h, (t) => pronosticarCon(metodo, t, h))) {
        const destino = (acumulado[tipo][metodo] ??= { reales: [], pronosticos: [] });
        destino.reales.push(...reales);
        destino.pronosticos.push(...pronosticos);
      }
    }
  }
  const elegidos = { ...METODOS_POR_DEFECTO };
  const errores: Seleccion['errores'] = { REGULAR: {}, INTERMITENTE: {} };
  for (const tipo of ['REGULAR', 'INTERMITENTE'] as const) {
    let mejor: number | null = null;
    for (const metodo of CANDIDATOS) {
      const datos = acumulado[tipo][metodo];
      const error = datos ? wape(datos.reales, datos.pronosticos) : null;
      if (error === null) continue;
      errores[tipo][metodo] = error;
      if (mejor === null || error < mejor) {
        mejor = error;
        elegidos[tipo] = metodo;
      }
    }
  }
  return { elegidos, errores };
}

/**
 * Validación fuera de muestra: entrena cada serie sin sus últimas `semanas`, pronostica
 * esas semanas con los métodos elegidos y compara con lo vendido. El modelo ingenuo
 * repite el promedio de las cuatro semanas previas. `null` sin historia suficiente.
 */
export function validar(
  series: number[][],
  semanas: number,
  metodos: Record<TipoDemanda, MetodoCandidato> = METODOS_POR_DEFECTO,
): { wapeModelo: number; wapeIngenuo: number } | null {
  const largas = series.filter((s) => s.length >= semanas + 8);
  const unir = (porTipo: Map<TipoDemanda, { reales: number[]; pronosticos: number[] }>) => {
    const reales: number[] = [];
    const pronosticos: number[] = [];
    for (const grupo of porTipo.values()) {
      reales.push(...grupo.reales);
      pronosticos.push(...grupo.pronosticos);
    }
    return wape(reales, pronosticos);
  };
  const modelo = unir(ventana(largas, semanas, semanas, (t, tipo) => pronosticarCon(metodos[tipo], t, semanas)));
  const ingenuo = unir(ventana(largas, semanas, semanas, (t) => Array(semanas).fill(media(t.slice(-4)))));
  return modelo === null || ingenuo === null ? null : { wapeModelo: modelo, wapeIngenuo: ingenuo };
}

/** Stock que cubre la variabilidad de la demanda mientras llega la reposición. */
export function stockSeguridad(desviacionSemanal: number, reposicionSemanas: number, z: number): number {
  return z * desviacionSemanal * Math.sqrt(reposicionSemanas);
}

/** Cambio relativo entre dos periodos; `null` si el anterior no tuvo ventas. */
export function variacion(recientes: number, anteriores: number): number | null {
  return anteriores === 0 ? null : (recientes - anteriores) / anteriores;
}

/**
 * Reparte un presupuesto entre compras ya ordenadas por prioridad: toma cada una entera
 * si cabe y sigue con las siguientes, que pueden ser más baratas. Devuelve los índices elegidos.
 */
export function asignarPresupuesto(inversiones: number[], presupuesto: number): Set<number> {
  const elegidas = new Set<number>();
  let restante = presupuesto;
  inversiones.forEach((inversion, i) => {
    if (inversion <= restante) {
      elegidas.add(i);
      restante -= inversion;
    }
  });
  return elegidas;
}
