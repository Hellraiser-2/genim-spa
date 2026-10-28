/**
 * Cálculos del probador virtual: medidas del cuerpo estimadas a partir de la altura y el peso,
 * tabla de medidas por talla y cómo le queda cada talla a ese cuerpo.
 *
 * Las poleras, los polerones y los pantalones usan las medidas reales de las prendas de la
 * tienda (tablas de medidas de hombre). Las chaquetas y los cinturones usan aún una tabla
 * genérica. Las medidas del cuerpo son una estimación.
 */

/** Tipos de prenda que el probador sabe simular. */
export type TipoPrenda = 'polera' | 'polera_manga_larga' | 'poleron' | 'chaqueta' | 'pantalon' | 'cinturon';

/** Contextura del cuerpo: ajusta los contornos estimados y el grosor de brazos y piernas. */
export type Complexion = 'delgada' | 'media' | 'robusta';

/** Cuerpo que muestra el maniquí. */
export type Sexo = 'masculino' | 'femenino';

/**
 * Lo que ingresa el cliente: altura en centímetros y peso en kilos, y si las conoce, sus
 * medidas de pecho, cintura y cadera en centímetros. Las que faltan se estiman.
 */
export interface MedidasCliente {
  altura: number;
  peso: number;
  pecho?: number | null;
  cintura?: number | null;
  cadera?: number | null;
  complexion?: Complexion;
  sexo?: Sexo;
}

/** Medidas del cuerpo, en centímetros: las que dio el cliente y las estimadas para el resto. */
export interface MedidasCuerpo {
  altura: number;
  imc: number;
  pecho: number;
  cintura: number;
  cadera: number;
  complexion: Complexion;
  sexo: Sexo;
  /** Medidas ingresadas que no eran coherentes con la altura y el peso, y se llevaron al límite. */
  ajustadas: MedidaAjustada[];
}

export type Contorno = 'pecho' | 'cintura' | 'cadera';

/** Una medida ingresada que se corrigió: lo que se escribió y lo que se usa. */
export interface MedidaAjustada {
  medida: Contorno;
  ingresada: number;
  usada: number;
}

/** Medidas de una talla de un tipo de prenda, en centímetros. */
export interface MedidasTalla {
  talla: string;
  /** Rango del contorno del cuerpo que cubre la talla: desde (incluido) hasta (excluido). */
  desde: number;
  hasta: number;
  /** Contorno de la prenda: el del pecho en prendas de arriba y el de la cintura en pantalones. */
  contornoPrenda: number;
  /** Largo del cuerpo de la prenda, o largo de pierna en pantalones. */
  largo: number;
  /** Largo de manga, en las prendas de manga larga con medida real. */
  manga?: number;
  /** Contorno de cadera del pantalón. */
  cadera?: number;
  /** Talla de la tabla del fabricante, cuando la tienda la vende con otra numeración (pantalón 42 = 32). */
  equivalencia?: string;
}

export type AjusteAncho = 'apretada' | 'justa' | 'holgada';
export type AjusteLargo = 'corta' | 'adecuada' | 'larga';

export interface Ajuste {
  talla: string;
  ancho: AjusteAncho;
  largo: AjusteLargo;
  /** Diferencia entre el contorno de la prenda y el del cuerpo, en centímetros. */
  holgura: number;
  /** Largo de manga; solo en las prendas con medida de manga. */
  manga?: AjusteLargo;
}

export const LIMITES = {
  altura: { min: 140, max: 210 },
  peso: { min: 35, max: 180 },
  pecho: { min: 60, max: 160 },
  cintura: { min: 50, max: 160 },
  cadera: { min: 60, max: 170 },
} as const;

export const MEDIDAS_POR_DEFECTO: MedidasCliente = { altura: 170, peso: 70 };

/** Cuerpo de referencia con todas sus medidas, para comprobar el maniquí y el ajuste. */
export const MEDIDAS_EJEMPLO: MedidasCliente = { altura: 175, peso: 78, pecho: 100, cintura: 86, cadera: 98, complexion: 'media' };

const NOMBRE_CONTORNO = { pecho: 'El pecho', cintura: 'La cintura', cadera: 'La cadera' } as const;

/** Indica qué está fuera de rango, o `null` si las medidas sirven. Las medidas opcionales vacías se aceptan. */
export function validarMedidas({ altura, peso, ...contornos }: MedidasCliente): string | null {
  if (!Number.isFinite(altura) || altura < LIMITES.altura.min || altura > LIMITES.altura.max) {
    return `La altura debe estar entre ${LIMITES.altura.min} y ${LIMITES.altura.max} cm.`;
  }
  if (!Number.isFinite(peso) || peso < LIMITES.peso.min || peso > LIMITES.peso.max) {
    return `El peso debe estar entre ${LIMITES.peso.min} y ${LIMITES.peso.max} kg.`;
  }
  for (const medida of ['pecho', 'cintura', 'cadera'] as const) {
    const valor = contornos[medida];
    if (valor === undefined || valor === null) continue;
    const { min, max } = LIMITES[medida];
    if (!Number.isFinite(valor) || valor < min || valor > max) {
      return `${NOMBRE_CONTORNO[medida]} debe estar entre ${min} y ${max} cm.`;
    }
  }
  return null;
}

/** Cuánto agranda o achica la contextura los contornos estimados. */
const FACTOR_COMPLEXION: Record<Complexion, number> = { delgada: 0.95, media: 1, robusta: 1.05 };

/** A igual altura y peso, el cuerpo femenino suele tener menos cintura y más cadera. */
const FACTOR_SEXO: Record<Sexo, { cintura: number; cadera: number }> = {
  masculino: { cintura: 1, cadera: 1 },
  femenino: { cintura: 0.92, cadera: 1.07 },
};

/**
 * Cuánto puede alejarse una medida ingresada de la estimada para esa altura, peso y sexo (sin
 * contextura): más allá, el cuerpo sería imposible y el maniquí se deformaría. Los rangos cubren
 * cuerpos atléticos y con más volumen en una zona.
 */
const RANGO_COHERENTE: Record<Contorno, { min: number; max: number }> = {
  pecho: { min: 0.8, max: 1.3 },
  cintura: { min: 0.72, max: 1.3 },
  cadera: { min: 0.8, max: 1.3 },
};

/** Proporciones entre contornos que un cuerpo real no supera. */
const CINTURA_MAXIMA_SOBRE_CADERA = 1.15;
const CINTURA_MAXIMA_SOBRE_PECHO = 1.15;

/**
 * Usa las medidas que dio el cliente y estima las que faltan. Los contornos estimados son
 * proporcionales a la altura y se corrigen por el IMC respecto de uno de referencia (22) y por
 * la contextura. La cintura es lo que más cambia con el peso, por eso usa un exponente mayor.
 *
 * Una medida ingresada que no es coherente con la altura y el peso (por ejemplo, 50 cm de
 * cintura con 180 kg) se lleva al límite del rango coherente, y queda anotada en `ajustadas`.
 */
export function estimarCuerpo({ altura, peso, pecho, cintura, cadera, complexion = 'media', sexo = 'masculino' }: MedidasCliente): MedidasCuerpo {
  const imc = peso / (altura / 100) ** 2;
  const relacion = imc / 22;
  const factor = FACTOR_COMPLEXION[complexion];
  const redondear = (valor: number) => Math.round(valor * 10) / 10;
  const dada = (valor: number | null | undefined) => (valor === undefined || valor === null ? null : valor);
  const estimado: Record<Contorno, number> = {
    pecho: 0.53 * altura * relacion ** 0.45,
    cintura: 0.45 * altura * relacion ** 0.75 * FACTOR_SEXO[sexo].cintura,
    cadera: 0.54 * altura * relacion ** 0.45 * FACTOR_SEXO[sexo].cadera,
  };
  const ingresadas: Record<Contorno, number | null> = { pecho: dada(pecho), cintura: dada(cintura), cadera: dada(cadera) };
  const ajustadas: MedidaAjustada[] = [];
  const medidas = {} as Record<Contorno, number>;
  // La cintura va al final: su tope depende de la cadera y el pecho ya resueltos.
  for (const medida of ['pecho', 'cadera', 'cintura'] as const) {
    const valor = ingresadas[medida];
    if (valor === null) {
      medidas[medida] = redondear(estimado[medida] * factor);
      continue;
    }
    const rango = RANGO_COHERENTE[medida];
    let max = estimado[medida] * rango.max;
    if (medida === 'cintura') {
      max = Math.min(max, medidas.cadera * CINTURA_MAXIMA_SOBRE_CADERA, medidas.pecho * CINTURA_MAXIMA_SOBRE_PECHO);
    }
    const min = Math.min(estimado[medida] * rango.min, max);
    const usada = redondear(Math.min(Math.max(valor, min), max));
    if (usada !== redondear(valor)) ajustadas.push({ medida, ingresada: redondear(valor), usada });
    medidas[medida] = usada;
  }

  return { altura, imc: redondear(imc), ...medidas, complexion, sexo, ajustadas };
}

/** Medidas ingresadas que siguen al peso y a la altura; las demás quedan como se escribieron. */
const MEDIDAS_QUE_CAMBIAN: readonly Contorno[] = ['cadera'];

/**
 * Medidas ingresadas al cambiar la altura o el peso: la cadera cambia en la misma proporción que
 * su estimación (si se sube de peso, crece como crecería la estimada); el pecho y la cintura
 * escritos quedan fijos. Las vacías siguen vacías: se estiman solas.
 */
export function reescalarMedidas(antes: MedidasCliente, despues: Pick<MedidasCliente, 'altura' | 'peso'>): MedidasCliente {
  const nuevo: MedidasCliente = { ...antes, altura: despues.altura, peso: despues.peso };
  if (validarMedidas({ altura: antes.altura, peso: antes.peso }) || validarMedidas({ altura: despues.altura, peso: despues.peso })) {
    return nuevo;
  }
  const base = { complexion: antes.complexion, sexo: antes.sexo };
  const previo = estimarCuerpo({ altura: antes.altura, peso: antes.peso, ...base });
  const actual = estimarCuerpo({ altura: despues.altura, peso: despues.peso, ...base });
  for (const medida of MEDIDAS_QUE_CAMBIAN) {
    const valor = antes[medida];
    if (valor === undefined || valor === null) continue;
    const { min, max } = LIMITES[medida];
    nuevo[medida] = Math.min(Math.max(Math.round((valor * actual[medida]) / previo[medida]), min), max);
  }
  return nuevo;
}

/** Texto en minúsculas y sin tildes, para comparar nombres. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Tipo de prenda según el nombre de la categoría, o `null` si el probador no la simula. Una
 * polera es de manga larga si lo dice su categoría o su nombre (`nombre`, opcional).
 */
export function tipoDePrenda(categoria: string, nombreProducto = ''): TipoPrenda | null {
  const nombre = normalizar(categoria);
  // `polerón` va antes que `polera`: comparten el comienzo.
  if (nombre.includes('poleron') || nombre.includes('hoodie')) return 'poleron';
  if (nombre.includes('polera') || nombre.includes('camiseta')) {
    return `${nombre} ${normalizar(nombreProducto)}`.includes('manga larga') ? 'polera_manga_larga' : 'polera';
  }
  if (nombre.includes('chaqueta')) return 'chaqueta';
  if (nombre.includes('pantalon') || nombre.includes('jeans')) return 'pantalon';
  if (nombre.includes('cinturon')) return 'cinturon';
  return null;
}

// --- Medidas reales de las prendas (tablas de medidas de hombre de la tienda) ---
// Se miden con la prenda estirada sobre una mesa: el ancho, la cintura y la cadera son de un
// solo lado, así que el contorno es el doble.

/** Polera manga corta: ancho de axila a axila y alto desde el hombro. */
const POLERA_MANGA_CORTA: [talla: string, ancho: number, alto: number][] = [
  ['S', 50, 70],
  ['M', 53.5, 73],
  ['L', 57, 76],
  ['XL', 60.5, 79],
  ['XXL', 64, 82],
  ['XXXL', 68.5, 85],
];

/**
 * Polera manga larga: ancho, alto y manga. En la tabla original la XXL repite el ancho y el
 * alto de la XL; aquí se estiman con la progresión de las demás tallas (+5 y +3 cm) hasta medir
 * una prenda real.
 */
const POLERA_MANGA_LARGA: [talla: string, ancho: number, alto: number, manga: number][] = [
  ['S', 46, 71, 51],
  ['M', 51, 74, 56],
  ['L', 56, 76, 61],
  ['XL', 61, 79, 66],
  ['XXL', 66, 82, 71],
];

/** Polerón: ancho (A), largo (B) y manga (C). */
const POLERON: [talla: string, ancho: number, largo: number, manga: number][] = [
  ['S', 53, 67, 63],
  ['M', 55.5, 70, 64],
  ['L', 58, 73, 65],
  ['XL', 60.5, 76, 66],
  ['XXL', 63, 79, 67],
];

/**
 * Pantalón: la tienda lo vende en talla chilena; la tabla del fabricante viene en talla
 * americana (30 a 38). Media cintura, media cadera y largo de pierna.
 */
const PANTALON: [talla: string, americana: string, cintura: number, cadera: number, largoPierna: number][] = [
  ['40', '30', 41, 51, 76],
  ['42', '32', 42.5, 53, 77],
  ['44', '34', 44.5, 54, 77],
  ['46', '36', 46.5, 56, 78],
  ['48', '38', 48, 58, 79],
];

/**
 * Holgura mínima de la prenda sobre el cuerpo para que no quede apretada, y ancho del rango de
 * cuerpo que cubre la talla más chica. Un polerón se usa más suelto que una polera.
 */
const HOLGURA_MINIMA = { polera: 6, polera_manga_larga: 6, poleron: 10, pantalon: 1 } as const;
const RANGO_PRIMERA_TALLA = 7;

/** Rangos de cuerpo contiguos a partir del contorno real de cada talla. */
function conRangos(tipo: keyof typeof HOLGURA_MINIMA, tallas: Omit<MedidasTalla, 'desde' | 'hasta'>[]): MedidasTalla[] {
  let anterior: number | null = null;
  return tallas.map((t) => {
    const hasta = t.contornoPrenda - HOLGURA_MINIMA[tipo];
    const desde: number = anterior ?? hasta - RANGO_PRIMERA_TALLA;
    anterior = hasta;
    return { ...t, desde, hasta };
  });
}

// --- Tabla genérica, para lo que aún no tiene medidas reales (chaquetas) ---

/** Contorno de pecho del cuerpo que cubre cada talla de letras. */
const RANGOS_PECHO: [talla: string, desde: number, hasta: number, largo: number][] = [
  ['XS', 82, 88, 66],
  ['S', 88, 96, 69],
  ['M', 96, 104, 72],
  ['L', 104, 112, 75],
  ['XL', 112, 120, 77],
  ['XXL', 120, 128, 79],
];
const HOLGURA_CHAQUETA = 10;

/** Medidas de cada talla del tipo de prenda, de menor a mayor. */
export function tablaDeTallas(tipo: TipoPrenda): MedidasTalla[] {
  switch (tipo) {
    case 'polera':
      return conRangos(tipo, POLERA_MANGA_CORTA.map(([talla, ancho, alto]) => ({ talla, contornoPrenda: 2 * ancho, largo: alto })));
    case 'polera_manga_larga':
      return conRangos(tipo, POLERA_MANGA_LARGA.map(([talla, ancho, alto, manga]) => ({ talla, contornoPrenda: 2 * ancho, largo: alto, manga })));
    case 'poleron':
      return conRangos(tipo, POLERON.map(([talla, ancho, largo, manga]) => ({ talla, contornoPrenda: 2 * ancho, largo, manga })));
    case 'pantalon':
      return conRangos(
        tipo,
        PANTALON.map(([talla, americana, cintura, cadera, largoPierna]) => ({
          talla,
          contornoPrenda: 2 * cintura,
          cadera: 2 * cadera,
          largo: largoPierna,
          equivalencia: americana,
        })),
      );
    case 'chaqueta':
      return RANGOS_PECHO.map(([talla, desde, hasta, largo]) => ({ talla, desde, hasta, contornoPrenda: hasta + HOLGURA_CHAQUETA, largo }));
    case 'cinturon':
      return [{ talla: 'Única', desde: 60, hasta: 130, contornoPrenda: 130, largo: 0 }];
  }
}

export function medidasDeTalla(tipo: TipoPrenda, talla: string): MedidasTalla | null {
  const buscada = normalizar(talla);
  return tablaDeTallas(tipo).find((medidas) => normalizar(medidas.talla) === buscada) ?? null;
}

/** Parte del cuerpo con que se elige la talla. */
export type ZonaDeReferencia = 'pecho' | 'abdomen' | 'cintura';

/**
 * Las poleras, de manga corta o larga. Por ahora solo en ellas el probador deja puesta la talla
 * al cambiar el peso, la muestra subida si queda chica y aconseja otra.
 */
export function esPolera(tipo: TipoPrenda): boolean {
  return tipo === 'polera' || tipo === 'polera_manga_larga';
}

/**
 * Dónde se mide el cuerpo para elegir la talla: la cintura en pantalones y cinturones; arriba, el
 * pecho, salvo en las poleras cuando el abdomen es mayor (con más peso la cintura crece más
 * rápido que el pecho): entonces la polera tiene que rodear el abdomen.
 */
export function zonaDeReferencia(cuerpo: MedidasCuerpo, tipo: TipoPrenda): ZonaDeReferencia {
  if (tipo === 'pantalon' || tipo === 'cinturon') return 'cintura';
  return esPolera(tipo) && cuerpo.cintura > cuerpo.pecho ? 'abdomen' : 'pecho';
}

/** El contorno del cuerpo con que se elige la talla (ver `zonaDeReferencia`). */
export function contornoDeReferencia(cuerpo: MedidasCuerpo, tipo: TipoPrenda): number {
  return zonaDeReferencia(cuerpo, tipo) === 'pecho' ? cuerpo.pecho : cuerpo.cintura;
}

/** Largo que le queda bien a ese cuerpo: del hombro a la cadera arriba, de la entrepierna al tobillo abajo. */
export function largoIdeal(cuerpo: MedidasCuerpo, tipo: TipoPrenda): number {
  return tipo === 'pantalon' ? 0.455 * cuerpo.altura : 0.41 * cuerpo.altura;
}

/**
 * Largo de manga que le queda bien a ese cuerpo. Las tablas se miden distinto según la prenda,
 * así que se toma como referencia que la talla M de cada una le calza a una persona de 175 cm,
 * y se escala con la altura.
 */
export function mangaIdeal(cuerpo: MedidasCuerpo, tipo: TipoPrenda): number | null {
  const referencia = medidasDeTalla(tipo, 'M')?.manga;
  return referencia === undefined ? null : (referencia * cuerpo.altura) / 175;
}

/** Cuánto más chico que el rango de la talla puede ser el cuerpo antes de que la prenda quede holgada. */
const MARGEN_HOLGADA: Record<TipoPrenda, number> = { polera: 4, polera_manga_larga: 4, poleron: 4, chaqueta: 4, pantalon: 2, cinturon: 0 };

function comparaLargo(diferencia: number, corta: number, larga: number): AjusteLargo {
  if (diferencia < -corta) return 'corta';
  if (diferencia > larga) return 'larga';
  return 'adecuada';
}

export function evaluarAjuste(cuerpo: MedidasCuerpo, tipo: TipoPrenda, talla: string): Ajuste | null {
  const medidas = medidasDeTalla(tipo, talla);
  if (!medidas) return null;
  const contorno = contornoDeReferencia(cuerpo, tipo);

  let ancho: AjusteAncho = 'justa';
  // Un pantalón también aprieta si la cadera del cuerpo no cabe en la de la prenda.
  const aprietaCadera = medidas.cadera !== undefined && cuerpo.cadera >= medidas.cadera;
  if (contorno >= medidas.hasta || aprietaCadera) ancho = 'apretada';
  else if (contorno < medidas.desde - MARGEN_HOLGADA[tipo]) ancho = 'holgada';

  const largo = tipo === 'cinturon' ? 'adecuada' : comparaLargo(medidas.largo - largoIdeal(cuerpo, tipo), 4, 5);
  const ideal = mangaIdeal(cuerpo, tipo);
  const manga = medidas.manga !== undefined && ideal !== null ? comparaLargo(medidas.manga - ideal, 4, 4) : undefined;

  return {
    talla: medidas.talla,
    ancho,
    largo,
    holgura: Math.round(medidas.contornoPrenda - contorno),
    ...(manga ? { manga } : {}),
  };
}

/** La talla cuyo rango contiene el contorno del cuerpo; fuera de la tabla, la del extremo más cercano. */
export function recomendarTalla(cuerpo: MedidasCuerpo, tipo: TipoPrenda): string {
  const tabla = tablaDeTallas(tipo);
  const contorno = contornoDeReferencia(cuerpo, tipo);
  const dentro = tabla.find((medidas) => contorno >= medidas.desde && contorno < medidas.hasta);
  if (dentro) return dentro.talla;
  return contorno < tabla[0]!.desde ? tabla[0]!.talla : tabla[tabla.length - 1]!.talla;
}

export function mismaTalla(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}

/**
 * Qué hacer cuando la talla puesta no le queda bien a ese cuerpo: `subir` si queda apretada y
 * `bajar` si queda holgada, a la talla más cercana que ya no queda así. Si ninguna calza, la
 * del extremo (la más grande o la más chica), con `calza` en falso; `talla` es `null` si la puesta
 * ya es la del extremo. Si la talla queda justa, no hay consejo.
 */
export interface ConsejoTalla {
  cambio: 'subir' | 'bajar';
  talla: string | null;
  calza: boolean;
}

export function aconsejarTalla(cuerpo: MedidasCuerpo, tipo: TipoPrenda, talla: string): ConsejoTalla | null {
  const ajuste = evaluarAjuste(cuerpo, tipo, talla);
  if (!ajuste || ajuste.ancho === 'justa') return null;
  const tabla = tablaDeTallas(tipo);
  const actual = tabla.findIndex((medidas) => mismaTalla(medidas.talla, talla));
  const cambio = ajuste.ancho === 'apretada' ? 'subir' : 'bajar';
  const candidatas = cambio === 'subir' ? tabla.slice(actual + 1) : tabla.slice(0, actual).reverse();
  // Al subir basta con que deje de apretar (un pantalón que calza de cadera puede sobrar de
  // cintura); al bajar, con que deje de sobrar.
  const calza = candidatas.find((medidas) => evaluarAjuste(cuerpo, tipo, medidas.talla)?.ancho !== ajuste.ancho);
  if (calza) return { cambio, talla: calza.talla, calza: true };
  return { cambio, talla: candidatas[candidatas.length - 1]?.talla ?? null, calza: false };
}

const COLORES: [nombre: string, hex: string][] = [
  ['negro', '#1c1c1f'],
  ['blanco', '#ececec'],
  ['gris', '#6b6b72'],
  ['azul', '#2c4a7a'],
  ['celeste', '#7fb2d9'],
  ['rojo', '#a11d24'],
  ['burdeo', '#5e1a24'],
  ['verde', '#2f5d3a'],
  ['cafe', '#5a3b26'],
  ['beige', '#cdbb9a'],
  ['morado', '#4b2a6b'],
  ['amarillo', '#d8b23a'],
  ['naranj', '#c8642a'],
  ['rosad', '#d07a96'],
];

/** Color con que se dibuja la prenda, a partir del nombre del color de la variante. */
export function colorDePrenda(color: string): string {
  const nombre = normalizar(color);
  return COLORES.find(([clave]) => nombre.includes(clave))?.[1] ?? '#3a3a40';
}
