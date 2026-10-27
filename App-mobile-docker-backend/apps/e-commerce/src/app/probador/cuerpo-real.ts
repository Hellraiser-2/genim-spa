import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { MedidasCuerpo, Sexo, TipoPrenda } from '../data/probador';

/**
 * Cuerpo realista del probador y sus prendas: el cuerpo de MakeHuman y ropa de conjuntos de
 * MakeHuman (CC0), exportados desde Blender (`blender/exportar_probador.py`) con las mismas
 * deformaciones de altura, peso y contornos.
 *
 * Las deformaciones se aplican en el procesador y luego se recalculan las normales, para que la
 * luz siga la forma también en los cuerpos más alejados del promedio. Qué tanto aplicar cada una
 * sale de las tablas medidas en Blender (el JSON junto al cuerpo), con el mismo cálculo que
 * `resolver()` del script. Como las prendas tienen las mismas deformaciones, calzan con el cuerpo.
 *
 * El modelo de cada prenda es el de su tipo (polera, pantalón...): toda prenda nueva de la tienda
 * de un tipo conocido se muestra con ese modelo y con el color de su variante.
 */

const CONTORNOS = ['pecho', 'cintura', 'cadera'] as const;
type Parametro = 'altura' | 'peso' | 'volumen' | (typeof CONTORNOS)[number];

interface Fila {
  valor: number;
  altura: number;
  pecho: number;
  cintura: number;
  cadera: number;
}

/** Cómo le queda la prenda del modelo al cuerpo promedio, medido en Blender (cm). */
interface AjustePrenda {
  /** Contorno con que se midió la holgura: pecho en las de arriba, cadera en pantalones. */
  medida: 'pecho' | 'cadera';
  holgura: number;
  alturaMedida: number;
  largoVertical: number;
  bordeInferior: number;
}

interface PrendaCalibrada {
  archivo: string;
  parte: 'arriba' | 'abajo';
  ajuste: AjustePrenda;
  /** Vértices del cuerpo que quedan bajo la prenda: se ocultan, como hace MakeHuman con su ropa. */
  ocultos: number[];
}

interface Calibracion {
  sexo: Sexo;
  formas: string[];
  /** `volumen` falta en los modelos anteriores a esa variante. */
  tablas: Record<Exclude<Parametro, 'volumen'>, Fila[]> & { volumen?: Fila[] };
  prendas: Partial<Record<TipoPrenda, PrendaCalibrada>>;
}

/** Una malla con sus deformaciones, lista para deformarse en el procesador. */
interface MallaDeformable {
  base: Float32Array;
  /** Desplazamiento de cada vértice por forma (relativo a la base), por nombre de forma. */
  formas: Map<string, Float32Array>;
  indices: THREE.BufferAttribute | null;
  uv: THREE.BufferAttribute | null;
  material: THREE.MeshStandardMaterial | null;
}

/** Cuerpo de un sexo, con las tablas de calibración. */
export interface ModeloReal {
  sexo: Sexo;
  cuerpo: MallaDeformable;
  calibracion: Calibracion;
}

const RUTA = 'assets/probador';
/**
 * Puesta, una prenda de arriba mide en vertical, del hombro a la basta, un 90 % de su largo
 * medido en plano: la tela se reparte sobre el hombro y el pecho.
 */
const CAIDA_PUESTA = 0.9;
/** Holgura máxima de la pretina de un pantalón sobre la cintura, en centímetros (como si llevara cinturón). */
const HOLGURA_PRETINA = 4;
/** Holgura máxima con que se dibuja la cadera de un pantalón, en centímetros. */
const HOLGURA_MAXIMA_DIBUJADA = 14;
const modelos = new Map<Sexo, Promise<ModeloReal>>();
const prendas = new Map<string, Promise<MallaDeformable[]>>();

/** Todas las mallas de un .glb (una por material), con sus deformaciones. */
async function cargarMallas(ruta: string): Promise<MallaDeformable[]> {
  const gltf = await new GLTFLoader().loadAsync(ruta);
  const mallas: MallaDeformable[] = [];
  gltf.scene.traverse((objeto) => {
    if (!(objeto instanceof THREE.Mesh)) return;
    const { geometry, morphTargetDictionary, material } = objeto;
    const deltas = geometry.morphAttributes['position'] ?? [];
    const formas = new Map<string, Float32Array>();
    for (const [nombre, indice] of Object.entries(morphTargetDictionary ?? {})) {
      formas.set(nombre, new Float32Array((deltas[indice] as THREE.BufferAttribute).array));
    }
    mallas.push({
      base: new Float32Array(geometry.getAttribute('position').array),
      formas,
      indices: geometry.getIndex(),
      uv: (geometry.getAttribute('uv') as THREE.BufferAttribute | undefined) ?? null,
      material: (Array.isArray(material) ? material[0] : material) as THREE.MeshStandardMaterial,
    });
  });
  if (!mallas.length) throw new Error(`El modelo ${ruta} no tiene mallas`);
  return mallas;
}

/** Recuerda una carga en curso o terminada; si falla, la olvida para poder reintentar. */
function recordar<T>(cache: Map<string, Promise<T>>, clave: string, cargar: () => Promise<T>): Promise<T> {
  let pendiente = cache.get(clave);
  if (!pendiente) {
    pendiente = cargar();
    pendiente.catch(() => cache.delete(clave));
    cache.set(clave, pendiente);
  }
  return pendiente;
}

/** Carga (una sola vez por sexo) el cuerpo y sus tablas. */
export function cargarModeloReal(sexo: Sexo): Promise<ModeloReal> {
  return recordar(modelos as Map<string, Promise<ModeloReal>>, sexo, async () => {
    const [mallas, calibracion] = await Promise.all([
      cargarMallas(`${RUTA}/cuerpo-${sexo}.glb`),
      fetch(`${RUTA}/cuerpo-${sexo}.json`).then((r) => {
        if (!r.ok) throw new Error(`No se encontró la calibración del cuerpo ${sexo}`);
        return r.json() as Promise<Calibracion>;
      }),
    ]);
    return { sexo, cuerpo: mallas[0]!, calibracion };
  });
}

/** Si hay modelo realista para un tipo de prenda (el cinturón se arma sobre el cuerpo). */
export function tieneModeloReal(modelo: ModeloReal, tipo: TipoPrenda): boolean {
  return tipo === 'cinturon' || Boolean(modelo.calibracion.prendas[tipo]);
}

/** Carga (una sola vez) el modelo de un tipo de prenda para el sexo del cuerpo. */
export function cargarPrendaReal(modelo: ModeloReal, tipo: TipoPrenda): Promise<MallaDeformable[]> {
  const prenda = modelo.calibracion.prendas[tipo];
  if (!prenda) return Promise.reject(new Error(`No hay modelo realista de ${tipo}`));
  return recordar(prendas, `${modelo.sexo}:${tipo}`, () => cargarMallas(`${RUTA}/${prenda.archivo}`));
}


function interpolar(filas: Fila[], campo: keyof Fila, valor: number): number {
  for (let i = 0; i < filas.length - 1; i++) {
    const a = filas[i]!;
    const b = filas[i + 1]!;
    if (a.valor <= valor && valor <= b.valor) {
      const t = (valor - a.valor) / (b.valor - a.valor);
      return a[campo] + (b[campo] - a[campo]) * t;
    }
  }
  return valor < filas[0]!.valor ? filas[0]![campo] : filas[filas.length - 1]![campo];
}

/** Valor del parámetro con el que la medida llega a `objetivo` en la tabla. */
function invertir(filas: { valor: number; medida: number }[], objetivo: number): number {
  for (let i = 0; i < filas.length - 1; i++) {
    const a = filas[i]!;
    const b = filas[i + 1]!;
    if (Math.min(a.medida, b.medida) <= objetivo && objetivo <= Math.max(a.medida, b.medida) && a.medida !== b.medida) {
      const t = (objetivo - a.medida) / (b.medida - a.medida);
      return a.valor + (b.valor - a.valor) * t;
    }
  }
  return objetivo < filas[0]!.medida ? filas[0]!.valor : filas[filas.length - 1]!.valor;
}

/** Cuánto aplicar de cada parámetro (con signo) y la escala final, para un cuerpo dado. */
export function resolverCuerpo(calibracion: Calibracion, cuerpo: MedidasCuerpo): { valores: Record<Parametro, number>; escala: number } {
  const { tablas } = calibracion;
  const peso = Math.min(Math.max((cuerpo.imc - 17) / 14, 0), 1) * 2 - 1;
  // Pasado el tope del peso de MakeHuman (IMC 31), el volumen engrosa brazos, piernas y cuello.
  const volumen = tablas.volumen ? Math.min(Math.max((cuerpo.imc - 31) / 12, 0), 1) : 0;
  const altura = invertir(tablas.altura.map((f) => ({ valor: f.valor, medida: f.altura })), cuerpo.altura);
  const escala = cuerpo.altura / interpolar(tablas.altura, 'altura', altura);
  const valores = { altura, peso, volumen } as Record<Parametro, number>;
  for (const m of CONTORNOS) {
    const base = interpolar(tablas[m], m, 0);
    const porVolumen = tablas.volumen ? interpolar(tablas.volumen, m, volumen) - base : 0;
    const sinControl = base + (interpolar(tablas.altura, m, altura) - base) + (interpolar(tablas.peso, m, peso) - base) + porVolumen;
    const diferencia = cuerpo[m] / escala - sinControl;
    valores[m] = invertir(tablas[m].map((f) => ({ valor: f.valor, medida: f[m] - base })), diferencia);
  }
  return { valores, escala };
}

/** Posiciones de una malla deformada para unos valores de parámetros, ya escaladas. */
function deformar(malla: MallaDeformable, valores: Record<Parametro, number>, escala: number): Float32Array {
  const posiciones = new Float32Array(malla.base);
  for (const [parametro, valor] of Object.entries(valores)) {
    for (const [sentido, peso] of [['mas', Math.max(valor, 0)], ['menos', Math.max(-valor, 0)]] as const) {
      const delta = malla.formas.get(`${parametro}_${sentido}`);
      if (!delta || peso === 0) continue;
      for (let i = 0; i < posiciones.length; i++) posiciones[i]! += delta[i]! * peso;
    }
  }
  for (let i = 0; i < posiciones.length; i++) posiciones[i]! *= escala;
  return posiciones;
}

function geometria(malla: MallaDeformable, posiciones: Float32Array): THREE.BufferGeometry {
  const resultado = new THREE.BufferGeometry();
  resultado.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  if (malla.uv) resultado.setAttribute('uv', malla.uv.clone());
  if (malla.indices) resultado.setIndex(malla.indices.clone());
  resultado.computeVertexNormals();
  return resultado;
}

/** Posiciones del cuerpo deformado para unas medidas. */
export function posicionesCuerpo(modelo: ModeloReal, cuerpo: MedidasCuerpo): Float32Array {
  const { valores, escala } = resolverCuerpo(modelo.calibracion, cuerpo);
  return deformar(modelo.cuerpo, valores, escala);
}

/** Qué piel queda cubierta por la prenda puesta: se oculta para que nunca asome por la tela. */
export interface Cobertura {
  ocultos: number[];
  cubre: (x: number, y: number, z: number) => boolean;
}

/** Malla del cuerpo deformado, con material de maniquí y sin la piel que cubre la prenda. */
export function crearCuerpoReal(modelo: ModeloReal, posiciones: Float32Array, coberturas: Cobertura[] = []): THREE.Mesh {
  const resultado = geometria(modelo.cuerpo, posiciones);
  const indices = resultado.getIndex();
  if (coberturas.length && indices) {
    // La piel se oculta si la cubre cualquiera de las prendas puestas.
    const conjuntos = coberturas.map((c) => ({ ocultos: new Set(c.ocultos), cubre: c.cubre }));
    const oculto = (v: number) =>
      conjuntos.some((c) => c.ocultos.has(v) && c.cubre(posiciones[v * 3]!, posiciones[v * 3 + 1]!, posiciones[v * 3 + 2]!));
    const visibles: number[] = [];
    for (let t = 0; t < indices.count; t += 3) {
      const a = indices.getX(t);
      const b = indices.getX(t + 1);
      const c = indices.getX(t + 2);
      if (!(oculto(a) && oculto(b) && oculto(c))) visibles.push(a, b, c);
    }
    resultado.setIndex(visibles);
  }
  const material = new THREE.MeshPhysicalMaterial({ color: '#d8cfc4', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.6 });
  return new THREE.Mesh(resultado, material);
}

/** Medidas de la talla de la prenda, en centímetros, y su color. */
export interface TallaPrenda {
  tipo: TipoPrenda;
  /** Contorno de la prenda: pecho en las de arriba, cintura en pantalones. */
  contorno: number;
  /** Largo del cuerpo de la prenda, o largo de pierna en pantalones. */
  largo: number;
  color: string;
}

/** Material de cada tipo de prenda, con el relieve de tela del modelo y el color del producto. */
function materialPrenda(tipo: TipoPrenda, malla: MallaDeformable, color: THREE.Color): THREE.MeshPhysicalMaterial {
  const cuero = tipo === 'chaqueta';
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: cuero ? 0.42 : 0.95,
    metalness: 0,
    clearcoat: cuero ? 0.35 : 0,
    clearcoatRoughness: 0.5,
    sheen: cuero ? 0 : 0.3,
    sheenRoughness: 0.9,
    sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.25),
    normalMap: malla.material?.normalMap ?? null,
    normalScale: new THREE.Vector2(0.8, 0.8),
    side: THREE.DoubleSide,
  });
}

/**
 * Prenda del modelo puesta sobre el cuerpo deformado y ajustada a la talla. La parte principal
 * lleva el color del producto; las secundarias (la camisa bajo una chaqueta) un tono neutro.
 */
export function crearPrendaReal(
  modelo: ModeloReal,
  mallas: MallaDeformable[],
  cuerpo: MedidasCuerpo,
  talla: TallaPrenda,
  posicionesDelCuerpo?: Float32Array,
  /** Prendas ya puestas debajo (el pantalón bajo una polera): esta queda por fuera de ellas. */
  debajo: THREE.Group[] = [],
): { grupo: THREE.Group; cobertura: Cobertura } {
  const calibrada = modelo.calibracion.prendas[talla.tipo]!;
  const { valores, escala } = resolverCuerpo(modelo.calibracion, cuerpo);
  const partes = mallas.map((malla) => ({ malla, posiciones: deformar(malla, valores, escala) }));
  const cobertura =
    calibrada.parte === 'arriba'
      ? ajustarArriba(
          partes.map((p) => p.posiciones),
          calibrada,
          cuerpo,
          talla,
          { prenda: mallas.map((m) => m.base), cuerpo: modelo.cuerpo.base, pecho: interpolar(modelo.calibracion.tablas.pecho, 'pecho', 0) },
          posicionesDelCuerpo,
        )
      : ajustarAbajo(partes.map((p) => p.posiciones), calibrada, cuerpo, talla);
  // Lo que quede dentro del cuerpo (un abdomen o un brazo más grueso que la tela) sale a la piel.
  if (posicionesDelCuerpo) sacarDelCuerpo(partes.map((p) => p.posiciones), posicionesDelCuerpo, modelo.cuerpo.indices);
  for (const otra of debajo) {
    otra.traverse((hijo) => {
      if (!(hijo instanceof THREE.Mesh)) return;
      const geometria = hijo.geometry as THREE.BufferGeometry;
      sacarDelCuerpo(partes.map((p) => p.posiciones), geometria.getAttribute('position').array as Float32Array, geometria.getIndex(), SEPARACION_CAPAS, 1);
    });
  }

  const grupo = new THREE.Group();
  for (const { malla, posiciones } of partes) {
    const secundaria = malla.material?.name.startsWith('Secundaria');
    const color = new THREE.Color(secundaria ? '#e9e4da' : talla.color);
    grupo.add(new THREE.Mesh(geometria(malla, posiciones), materialPrenda(talla.tipo, malla, color)));
  }
  return { grupo, cobertura: { ocultos: calibrada.ocultos, cubre: cobertura } };
}

/** Separación mínima entre la tela y la piel al sacarla del cuerpo, en metros. */
const SEPARACION_COLISION = 0.006;
/** Separación entre una prenda y la que lleva debajo, en metros. */
const SEPARACION_CAPAS = 0.004;
/** Lado de cada celda de la grilla con que se buscan los vértices del cuerpo, en metros. */
const CELDA = 0.03;
/**
 * Cuántas celdas a la redonda se busca la piel más cercana, como máximo. Entre dos prendas se busca
 * solo en las vecinas: más lejos, la de abajo ya no está debajo (la pretina del pantalón no está
 * bajo el abdomen de la polera).
 */
const ALCANCE_MAXIMO = 5;

/**
 * Colisión de la tela con el cuerpo: cada punto de la prenda que esté dentro del cuerpo (o a menos
 * de `SEPARACION_COLISION` de la piel) se lleva afuera, a lo largo de la normal de la piel más
 * cercana. Así ningún trozo de piel atraviesa la tela, sea cual sea la talla o el cuerpo.
 */
function sacarDelCuerpo(
  posiciones: Float32Array[],
  cuerpo: Float32Array,
  indices: THREE.BufferAttribute | null,
  separacion = SEPARACION_COLISION,
  alcanceMaximo = ALCANCE_MAXIMO,
): void {
  const malla = new THREE.BufferGeometry();
  malla.setAttribute('position', new THREE.BufferAttribute(cuerpo, 3));
  if (indices) malla.setIndex(indices);
  malla.computeVertexNormals();
  const normales = malla.getAttribute('normal').array as Float32Array;

  const grilla = new Map<string, number[]>();
  const clave = (x: number, y: number, z: number) => `${Math.floor(x / CELDA)},${Math.floor(y / CELDA)},${Math.floor(z / CELDA)}`;
  for (let i = 0; i < cuerpo.length; i += 3) {
    const k = clave(cuerpo[i]!, cuerpo[i + 1]!, cuerpo[i + 2]!);
    const lista = grilla.get(k);
    if (lista) lista.push(i);
    else grilla.set(k, [i]);
  }

  cadaVertice(posiciones, (p, i) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    const z = p[i + 2]!;
    const cx = Math.floor(x / CELDA);
    const cy = Math.floor(y / CELDA);
    const cz = Math.floor(z / CELDA);
    let cercano = -1;
    let distancia = Infinity;
    // Primero las celdas vecinas; si no hay piel cerca (la tela quedó muy adentro de un abdomen
    // grande), se busca más lejos.
    for (let alcance = 1; cercano < 0 && alcance <= alcanceMaximo; alcance++) {
      for (let dx = -alcance; dx <= alcance; dx++) {
        for (let dy = -alcance; dy <= alcance; dy++) {
          for (let dz = -alcance; dz <= alcance; dz++) {
            // Las celdas ya revisadas con un alcance menor se saltan.
            if (alcance > 1 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < alcance) continue;
            for (const j of grilla.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
              const d = (cuerpo[j]! - x) ** 2 + (cuerpo[j + 1]! - y) ** 2 + (cuerpo[j + 2]! - z) ** 2;
              if (d < distancia) {
                distancia = d;
                cercano = j;
              }
            }
          }
        }
      }
    }
    if (cercano < 0) return;
    const nx = normales[cercano]!;
    const ny = normales[cercano + 1]!;
    const nz = normales[cercano + 2]!;
    // Altura sobre la piel, medida a lo largo de su normal.
    const sobre = (x - cuerpo[cercano]!) * nx + (y - cuerpo[cercano + 1]!) * ny + (z - cuerpo[cercano + 2]!) * nz;
    if (sobre >= separacion) return;
    // Curva creciente entre media separación y la separación completa: lo que estaba más adentro
    // sigue más adentro, así las dos capas del dobladillo no se cruzan ni se superponen.
    const nuevo = separacion * (0.5 + 0.5 * Math.exp((sobre - separacion) / separacion));
    const empuje = nuevo - sobre;
    p[i] = x + nx * empuje;
    p[i + 1] = y + ny * empuje;
    p[i + 2] = z + nz * empuje;
  });
  malla.dispose();
}

/** Recorre los vértices de todas las partes de una prenda. */
function cadaVertice(posiciones: Float32Array[], accion: (p: Float32Array, i: number, parte: number) => void): void {
  posiciones.forEach((p, parte) => {
    for (let i = 0; i < p.length; i += 3) accion(p, i, parte);
  });
}

/**
 * Prendas de arriba: el tronco se ensancha o se angosta alrededor del cuerpo según la holgura de
 * la talla comparada con la del modelo, y la basta baja o sube según su largo. Hombros, cuello y
 * mangas no cambian. Devuelve qué piel cubre: la que queda sobre la basta en cada dirección.
 */
function ajustarArriba(
  posiciones: Float32Array[],
  calibrada: PrendaCalibrada,
  cuerpo: MedidasCuerpo,
  talla: TallaPrenda,
  /** La prenda y el cuerpo sin deformar, y el pecho de ese cuerpo en centímetros. */
  base: { prenda: Float32Array[]; cuerpo: Float32Array; pecho: number },
  posicionesDelCuerpo?: Float32Array,
): (x: number, y: number, z: number) => boolean {
  const { ajuste } = calibrada;
  const { abajo, arriba, pecho, axila } = alturasDelTronco(posiciones, ajuste);

  // Nunca queda a menos de 2 cm de holgura del pecho.
  const holguraTalla = Math.max(talla.contorno - cuerpo.pecho, 2);
  const factor = (cuerpo.pecho + holguraTalla) / (cuerpo.pecho + Math.max(ajuste.holgura, 2));
  const centroZ = centroDelTronco(posiciones, pecho);
  // Qué es tronco y qué es manga se decide en el modelo sin deformar (ver `separarTronco`).
  const { tronco, brazos } = separarTronco(base.prenda, base.cuerpo, ajuste, base.pecho);
  cadaVertice(posiciones, (p, i, parte) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    // Pleno bajo el pecho, se desvanece hacia la axila y hacia los costados (donde nacen las mangas).
    const vertical = Math.min(Math.max((axila - y) / (axila - pecho), 0), 1);
    const lateral = tronco[parte]![i / 3]!;
    const s = 1 + (factor - 1) * vertical * lateral;
    p[i] = x * s;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * s;
  });

  // Largo: la prenda puesta mide, del hombro a la basta, el largo de la talla (medido en plano)
  // por lo que cae al usarla. Bajo el pecho, cada vértice del tronco baja (o sube) en proporción a
  // su distancia del pecho; las mangas no se mueven.
  const pesoTronco = (i: number, parte: number) => tronco[parte]![i / 3]!;
  let bastaActual = Infinity;
  cadaVertice(posiciones, (p, i, parte) => {
    if (pesoTronco(i, parte) === 1) bastaActual = Math.min(bastaActual, p[i + 1]!);
  });
  if (!Number.isFinite(bastaActual)) bastaActual = abajo;
  const alargue = (talla.largo * CAIDA_PUESTA) / 100 - (arriba - bastaActual);
  cadaVertice(posiciones, (p, i, parte) => {
    const y = p[i + 1]!;
    if (y < pecho) p[i + 1] = y - alargue * Math.min((pecho - y) / (pecho - bastaActual), 1) * pesoTronco(i, parte);
  });

  // Una talla chica no alcanza a rodear el abdomen: la tela se sube hasta donde el cuerpo todavía
  // cabe en ella (estirándose un poco) y deja ver la piel de más abajo. Si el que no cabe es el
  // pecho, la tela estirada a lo ancho se acorta. La chaqueta no: es rígida y lleva una camisa
  // debajo, que se cruzaría con ella; una chaqueta chica se ve ceñida.
  if (posicionesDelCuerpo && talla.tipo !== 'chaqueta') {
    const tope = alturaQueNoCabe(posicionesDelCuerpo, pecho, centroZ, brazos, (talla.contorno / 100) * ESTIRAMIENTO);
    const basta = bastaActual - alargue;
    const porAbdomen = tope > basta ? (pecho - tope) / (pecho - basta) : 1;
    const porPecho = 1 - (Math.max(cuerpo.pecho - talla.contorno, 0) / talla.contorno) * ACORTE_POR_ESTIRAMIENTO;
    // La tela no se recoge más que hasta la mitad del tronco.
    const k = Math.max(Math.min(porAbdomen, porPecho), COBERTURA_MINIMA);
    if (k < 1) {
      cadaVertice(posiciones, (p, i, parte) => {
        const y = p[i + 1]!;
        if (y < pecho) p[i + 1] = y + (pecho - (pecho - y) * k - y) * pesoTronco(i, parte);
      });
    }
  }

  const sectores = 48;
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * sectores) % sectores;
  // La chaqueta es estructurada y lleva una camisa debajo: no cae como una polera, y hacer caer
  // ambas capas las cruza.
  if (posicionesDelCuerpo && talla.tipo !== 'chaqueta') {
    dejarCaer(posiciones, posicionesDelCuerpo, { pecho, axila, centroZ, brazos, pesoTronco, sector, sectores });
  }

  // Altura de la basta en cada dirección alrededor del cuerpo: no es pareja (los costados suelen
  // quedar más altos), y la piel solo se oculta donde la prenda de verdad la cubre.
  const bastaPorSector = new Float32Array(sectores).fill(Infinity);
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! > pecho) return;
    const s = sector(p[i]!, p[i + 2]!);
    bastaPorSector[s] = Math.min(bastaPorSector[s]!, p[i + 1]!);
  });
  const bastaMasBaja = Math.min(...bastaPorSector);
  return (x, y, z) => {
    // Con los vecinos se toma la más alta: es preferible ocultar un poco menos que dejar un hueco.
    const s = sector(x, z);
    let basta = -Infinity;
    for (const d of [-1, 0, 1]) {
      const valor = bastaPorSector[(s + d + sectores) % sectores]!;
      basta = Math.max(basta, Number.isFinite(valor) ? valor : bastaMasBaja);
    }
    // Margen: la basta puede tener un doblez hacia adentro que la hace parecer más baja.
    return y > basta + 0.04;
  };
}

/**
 * Alturas de una prenda de arriba: sus extremos, la del pecho (la de la calibración, llevada al
 * alto de la prenda) y la de la axila, donde empieza el tronco; más arriba quedan hombros, cuello
 * y mangas.
 */
function alturasDelTronco(posiciones: Float32Array[], ajuste: AjustePrenda): { abajo: number; arriba: number; pecho: number; axila: number } {
  let abajo = Infinity;
  let arriba = -Infinity;
  cadaVertice(posiciones, (p, i) => {
    abajo = Math.min(abajo, p[i + 1]!);
    arriba = Math.max(arriba, p[i + 1]!);
  });
  const pecho = abajo + ((ajuste.alturaMedida - ajuste.bordeInferior) / ajuste.largoVertical) * (arriba - abajo);
  return { abajo, arriba, pecho, axila: pecho + (arriba - pecho) * 0.3 };
}

/** Profundidad media del tronco de la prenda bajo el pecho: el centro alrededor del que se ensancha. */
function centroDelTronco(posiciones: Float32Array[], pecho: number): number {
  let suma = 0;
  let cuenta = 0;
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! < pecho) {
      suma += p[i + 2]!;
      cuenta++;
    }
  });
  return suma / (cuenta || 1);
}

/**
 * Cuánto es tronco cada vértice de la prenda (1) o manga (0), y qué vértices del cuerpo son de los
 * brazos. Se decide en el modelo sin deformar, el cuerpo promedio: ahí siempre hay espacio entre
 * el torso y el brazo. En un cuerpo de mucho peso el brazo queda pegado al torso, y los costados
 * de la prenda se confundían con mangas: quedaban a medio ensanchar, como alas.
 *
 * Donde hay espacio entre el torso y el brazo, el límite va al medio de ese espacio; más arriba,
 * cerca de la axila, se usa un ancho fijo.
 */
function separarTronco(prenda: Float32Array[], cuerpo: Float32Array, ajuste: AjustePrenda, pechoCuerpo: number): { tronco: Float32Array[]; brazos: Uint8Array } {
  const { axila } = alturasDelTronco(prenda, ajuste);
  const semiancho = (pechoCuerpo + Math.max(ajuste.holgura, 2)) / 100 / 5.47;
  const limiteTronco = separacionTronco(cuerpo, axila);
  const tronco = prenda.map((p) => {
    const pesos = new Float32Array(p.length / 3);
    for (let i = 0; i < p.length; i += 3) {
      const x = Math.abs(p[i]!);
      const limite = limiteTronco(p[i + 1]!);
      pesos[i / 3] =
        limite === null
          ? Math.min(Math.max((semiancho * 1.25 - x) / (semiancho * 0.25), 0), 1)
          : Math.min(Math.max((limite + TRANSICION_MANGA / 2 - x) / TRANSICION_MANGA, 0), 1);
    }
    return pesos;
  });
  const brazos = new Uint8Array(cuerpo.length / 3);
  for (let i = 0; i < cuerpo.length; i += 3) {
    const limite = cuerpo[i + 1]! < axila ? limiteTronco(cuerpo[i + 1]!) : null;
    brazos[i / 3] = limite !== null && Math.abs(cuerpo[i]!) > limite ? 1 : 0;
  }
  return { tronco, brazos };
}

/** Cuánto se estira el tejido de una polera alrededor del cuerpo antes de subirse. */
const ESTIRAMIENTO = 1.06;
/** Cuánto se acorta el tronco por cada parte en que el pecho supera a la prenda (10 % más de pecho: 20 % más corta). */
const ACORTE_POR_ESTIRAMIENTO = 2;
/** Parte del tronco bajo el pecho que sigue cubriendo una polera chica, como mínimo. */
const COBERTURA_MINIMA = 0.5;

/**
 * Altura más alta bajo el pecho en que el contorno del tronco supera `contornoMaximo` (en metros),
 * o `-Infinity` si cabe entero. El contorno de cada franja se mide alrededor del centro, con el
 * radio más afuera en cada dirección, sin contar los vértices de los brazos (marcados en `brazos`).
 */
function alturaQueNoCabe(cuerpo: Float32Array, pecho: number, centroZ: number, brazos: Uint8Array, contornoMaximo: number): number {
  const sectores = 48;
  const franjas = new Map<number, Float32Array>();
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = cuerpo[i]!;
    const y = cuerpo[i + 1]!;
    if (y > pecho || brazos[i / 3]) continue;
    const z = cuerpo[i + 2]! - centroZ;
    const f = Math.floor(y / FRANJA);
    let fila = franjas.get(f);
    if (!fila) franjas.set(f, (fila = new Float32Array(sectores)));
    const s = Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * sectores) % sectores;
    fila[s] = Math.max(fila[s]!, Math.hypot(x, z));
  }
  const desdeArriba = [...franjas.keys()].sort((a, b) => b - a);
  for (const f of desdeArriba) {
    const fila = franjas.get(f)!;
    // Las direcciones sin vértices toman el radio de la vecina; si la franja tiene pocas, no se mide.
    if (fila.filter((r) => r > 0).length < sectores / 2) continue;
    let contorno = 0;
    for (let s = 0; s < sectores; s++) {
      const r = fila[s] || Math.max(fila[(s + 1) % sectores]!, fila[(s - 1 + sectores) % sectores]!);
      contorno += (r * 2 * Math.PI) / sectores;
    }
    if (contorno > contornoMaximo) return (f + 1) * FRANJA;
  }
  return -Infinity;
}

/** Separación mínima entre la tela y la piel, en metros. */
const SEPARACION_TELA = 0.008;
/**
 * Cuánto más allá de su caída puede apoyarse la tela sobre el cuerpo, en metros: lo que sobresale
 * un abdomen grande. Los brazos no cuentan (ver `separarTronco`).
 */
const APOYO_MAXIMO = 0.2;
/** Alto de cada franja con que se mide el cuerpo, en metros. */
const FRANJA = 0.02;

/** Espacio mínimo entre el torso y el brazo para distinguirlos, en metros. */
const ESPACIO_BRAZO = 0.025;
/** Medio ancho mínimo del torso: un espacio más cerca del centro es entre vértices del propio torso. */
const MEDIO_TORSO_MINIMO = 0.08;
/** Alto de cada franja con que se busca el espacio entre torso y brazo: más que la distancia entre anillos de la malla. */
const FRANJA_BRAZO = 0.04;
/** Ancho de la transición entre tronco y manga en el límite, en metros. */
const TRANSICION_MANGA = 0.01;

/**
 * Distancia al centro que separa el torso de los brazos a cada altura bajo la axila: la mitad del
 * espacio que el cuerpo deja entre ambos. `null` donde no hay espacio (cerca de la axila).
 *
 * Se usa con el cuerpo promedio (ver `separarTronco`): en un abdomen grande la malla se estira y
 * sus vértices quedan más separados que el espacio buscado.
 */
function separacionTronco(cuerpo: Float32Array, axila: number): (y: number) => number | null {
  const porFranja = new Map<number, number[]>();
  for (let i = 0; i < cuerpo.length; i += 3) {
    const y = cuerpo[i + 1]!;
    if (y > axila) continue;
    const f = Math.floor(y / FRANJA_BRAZO);
    let lista = porFranja.get(f);
    if (!lista) porFranja.set(f, (lista = []));
    lista.push(Math.abs(cuerpo[i]!));
  }
  const limites = new Map<number, number>();
  for (const [f, lista] of porFranja) {
    lista.sort((a, b) => a - b);
    for (let k = 1; k < lista.length; k++) {
      if (lista[k - 1]! >= MEDIO_TORSO_MINIMO && lista[k]! - lista[k - 1]! > ESPACIO_BRAZO) {
        limites.set(f, (lista[k]! + lista[k - 1]!) / 2);
        break;
      }
    }
  }
  // Con las franjas vecinas, el límite más afuera: así no hay saltos entre una altura y otra.
  return (y) => {
    const f = Math.floor(y / FRANJA_BRAZO);
    let limite: number | null = null;
    for (const df of [-1, 0, 1]) {
      const valor = limites.get(f + df);
      if (valor !== undefined) limite = Math.max(limite ?? 0, valor);
    }
    return limite;
  };
}

/**
 * Caída de la tela: bajo el pecho, una prenda de arriba cuelga recta desde lo más saliente del
 * tronco (el pecho adelante, los omóplatos atrás) en vez de abrirse hacia afuera, y nunca entra
 * en el cuerpo: si la cadera o el abdomen sobresalen, la tela se apoya sobre ellos.
 */
function dejarCaer(
  posiciones: Float32Array[],
  cuerpo: Float32Array,
  zona: {
    pecho: number;
    axila: number;
    centroZ: number;
    brazos: Uint8Array;
    pesoTronco: (i: number, parte: number) => number;
    sector: (x: number, z: number) => number;
    sectores: number;
  },
): void {
  const { pecho, axila, centroZ, brazos, pesoTronco, sector, sectores } = zona;
  const radio = (x: number, z: number) => Math.hypot(x, z - centroZ);

  // Hasta dónde llega la tela en cada dirección entre el pecho y la axila: desde ahí cuelga.
  // Adelante y atrás se mide hasta la axila (el pecho y los omóplatos); en los costados solo a la
  // altura del pecho, porque más arriba ya está la parte de abajo de la manga.
  const colgado = new Float32Array(sectores);
  cadaVertice(posiciones, (p, i, parte) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    const r = radio(x, p[i + 2]!);
    const costado = r > 0 && Math.abs(x) / r > 0.7;
    const tope = costado ? pecho + (axila - pecho) * 0.2 : axila;
    if (y < pecho || y > tope || pesoTronco(i, parte) < 1) return;
    const s = sector(x, p[i + 2]!);
    colgado[s] = Math.max(colgado[s]!, r);
  });

  // El contorno del tronco del cuerpo por franjas de altura bajo el pecho, en cada dirección.
  const franjas = new Map<number, Float32Array>();
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = cuerpo[i]!;
    const y = cuerpo[i + 1]!;
    if (y > pecho || brazos[i / 3]) continue;
    const f = Math.floor(y / FRANJA);
    let fila = franjas.get(f);
    if (!fila) franjas.set(f, (fila = new Float32Array(sectores)));
    const s = sector(x, cuerpo[i + 2]!);
    fila[s] = Math.max(fila[s]!, radio(x, cuerpo[i + 2]!));
  }
  const piel = (y: number, s: number) => {
    let r = 0;
    for (const df of [-1, 0, 1]) {
      const fila = franjas.get(Math.floor(y / FRANJA) + df);
      if (!fila) continue;
      for (const ds of [-1, 0, 1]) r = Math.max(r, fila[(s + ds + sectores) % sectores]!);
    }
    return r;
  };

  // La tela puede tener dos capas (el dobladillo vuelto hacia adentro): en cada franja de altura y
  // dirección todos sus puntos se mueven lo mismo, así las capas no se cruzan. La capa de afuera
  // no pasa de la caída; la de adentro se apoya sobre lo que sobresale bajo el pecho (glúteos,
  // cadera, abdomen).
  const limiteEn = (s: number) => {
    let limite = 0;
    for (const ds of [-1, 0, 1]) limite = Math.max(limite, colgado[(s + ds + sectores) % sectores]!);
    return limite;
  };
  const extremos = new Map<number, { afuera: number; adentro: number }>();
  const celda = (f: number, s: number) => f * sectores + s;
  cadaVertice(posiciones, (p, i, parte) => {
    const y = p[i + 1]!;
    if (y >= pecho || pesoTronco(i, parte) === 0) return;
    const r = radio(p[i]!, p[i + 2]!);
    const clave = celda(Math.floor(y / FRANJA), sector(p[i]!, p[i + 2]!));
    const e = extremos.get(clave);
    if (e) {
      e.afuera = Math.max(e.afuera, r);
      e.adentro = Math.min(e.adentro, r);
    } else {
      extremos.set(clave, { afuera: r, adentro: r });
    }
  });
  const corrimientos = new Map<number, number>();
  for (const [clave, { afuera, adentro }] of extremos) {
    const f = Math.floor(clave / sectores);
    const s = clave - f * sectores;
    const limite = limiteEn(s);
    if (limite === 0) continue;
    const exceso = Math.max(afuera - limite, 0);
    const apoyo = Math.min(piel((f + 0.5) * FRANJA, s) + SEPARACION_TELA, limite + APOYO_MAXIMO);
    const falta = Math.max(apoyo - (adentro - exceso), 0);
    corrimientos.set(clave, falta - exceso);
  }
  // Corrimiento suavizado entre franjas y direcciones vecinas: sin escalones.
  const corrimiento = (y: number, s: number) => {
    const f = y / FRANJA - 0.5;
    const f0 = Math.floor(f);
    const t = f - f0;
    let suma = 0;
    let pesos = 0;
    for (const [df, wf] of [[0, 1 - t], [1, t]] as const) {
      for (const [ds, ws] of [[-1, 0.25], [0, 0.5], [1, 0.25]] as const) {
        const valor = corrimientos.get(celda(f0 + df, (s + ds + sectores) % sectores));
        if (valor === undefined) continue;
        suma += valor * wf * ws;
        pesos += wf * ws;
      }
    }
    return pesos > 0 ? suma / pesos : 0;
  };
  cadaVertice(posiciones, (p, i, parte) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    const peso = pesoTronco(i, parte);
    if (y >= pecho || peso === 0) return;
    const z = p[i + 2]!;
    const r = radio(x, z);
    if (r === 0) return;
    const k = 1 + (corrimiento(y, sector(x, z)) / r) * peso;
    p[i] = x * k;
    p[i + 2] = centroZ + (z - centroZ) * k;
  });
}

/**
 * Pantalones: sobre la entrepierna, la pretina y la cadera se ensanchan o se angostan según la
 * holgura de la talla comparada con la del modelo. Devuelve qué piel cubre: entre los ruedos y
 * la pretina.
 */
function ajustarAbajo(
  posiciones: Float32Array[],
  calibrada: PrendaCalibrada,
  cuerpo: MedidasCuerpo,
  talla: TallaPrenda,
): (x: number, y: number, z: number) => boolean {
  const { ajuste } = calibrada;
  let abajo = Infinity;
  let arriba = -Infinity;
  let centroZ = 0;
  let total = 0;
  cadaVertice(posiciones, (p, i) => {
    abajo = Math.min(abajo, p[i + 1]!);
    arriba = Math.max(arriba, p[i + 1]!);
    centroZ += p[i + 2]!;
    total++;
  });
  centroZ /= total || 1;
  const entrepierna = (cuerpo.altura / 100) * 0.47;
  const cadera = abajo + ((ajuste.alturaMedida - ajuste.bordeInferior) / ajuste.largoVertical) * (arriba - abajo);

  // La talla de pantalón se elige por la cintura: esa holgura se lleva a la cadera del modelo.
  // Se dibuja entre un mínimo y un máximo: con menos la piel atraviesa la tela y con más las
  // caderas se inflan. Lo apretado o lo holgado de la talla lo indica el texto del ajuste.
  const holguraTalla = Math.min(Math.max(talla.contorno - cuerpo.cintura, HOLGURA_PRETINA), HOLGURA_MAXIMA_DIBUJADA);
  const base = cuerpo.cadera + Math.max(ajuste.holgura, 1);
  const factor = (cuerpo.cadera + holguraTalla) / base;
  // Una pretina holgada no se queda abierta alrededor del cuerpo: cae y se ajusta con el
  // cinturón. Sobre la cadera, la holgura se va cerrando hasta quedar en no más de 4 cm.
  const factorPretina = (cuerpo.cadera + Math.min(holguraTalla, HOLGURA_PRETINA)) / base;
  cadaVertice(posiciones, (p, i) => {
    const y = p[i + 1]!;
    const peso = Math.min(Math.max((y - entrepierna) / Math.max(cadera - entrepierna, 0.01), 0), 1);
    const haciaPretina = Math.min(Math.max((y - cadera) / Math.max(arriba - cadera, 0.01), 0), 1);
    const s = 1 + (factor + (factorPretina - factor) * haciaPretina - 1) * peso;
    p[i] = p[i]! * s;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * s;
  });

  // Altura de la pretina en cada dirección alrededor del cuerpo: no es pareja (atrás suele ser
  // más alta), y la piel solo se oculta bajo ella.
  const sectores = 48;
  const pretinaPorSector = new Float32Array(sectores).fill(-Infinity);
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * sectores) % sectores;
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! < cadera) return;
    const s = sector(p[i]!, p[i + 2]!);
    pretinaPorSector[s] = Math.max(pretinaPorSector[s]!, p[i + 1]!);
  });
  return (x, y, z) => {
    if (y < abajo + 0.04) return false;
    // Con los vecinos se toma la más baja: es preferible ocultar un poco menos que dejar un hueco.
    const s = sector(x, z);
    let pretina = Infinity;
    for (const d of [-1, 0, 1]) {
      const valor = pretinaPorSector[(s + d + sectores) % sectores]!;
      pretina = Math.min(pretina, Number.isFinite(valor) ? valor : arriba);
    }
    return y < pretina - 0.02;
  };
}

/**
 * Cinturón armado sobre el cuerpo deformado: una correa que sigue el contorno de la cadera, con
 * hebilla y tachas metálicas.
 */
export function crearCinturonReal(posiciones: Float32Array, cuerpo: MedidasCuerpo, color: string): THREE.Group {
  const h = cuerpo.altura / 100;
  const y = 0.575 * h;
  const ancho = 0.035;
  // Radio del cuerpo en cada dirección a la altura del cinturón, sin manos ni brazos.
  const sectores = 64;
  const radios = new Float32Array(sectores);
  let centroZ = 0;
  let cuenta = 0;
  for (let i = 0; i < posiciones.length; i += 3) {
    if (Math.abs(posiciones[i + 1]! - y) < 0.015 && Math.abs(posiciones[i]!) < 0.25 * h) {
      centroZ += posiciones[i + 2]!;
      cuenta++;
    }
  }
  centroZ /= cuenta || 1;
  for (let i = 0; i < posiciones.length; i += 3) {
    const x = posiciones[i]!;
    const z = posiciones[i + 2]! - centroZ;
    const r = Math.hypot(x, z);
    if (Math.abs(posiciones[i + 1]! - y) > 0.015 || r > 0.2 * h) continue;
    const s = Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * sectores) % sectores;
    radios[s] = Math.max(radios[s]!, r);
  }
  // Sectores sin vértices toman el de sus vecinos, y el contorno se suaviza.
  for (let s = 0; s < sectores; s++) if (!radios[s]) radios[s] = radios[(s + 1) % sectores] || radios[(s - 1 + sectores) % sectores] || 0.15 * h;
  const suave = radios.map((_, s) => (radios[(s - 1 + sectores) % sectores]! + 2 * radios[s]! + radios[(s + 1) % sectores]!) / 4 + 0.006);

  const puntos: number[] = [];
  const indices: number[] = [];
  for (let s = 0; s <= sectores; s++) {
    const angulo = (s / sectores - 0.5) * 2 * Math.PI;
    const r = suave[s % sectores]!;
    const x = Math.sin(angulo) * r;
    const z = centroZ + Math.cos(angulo) * r;
    puntos.push(x, y - ancho / 2, z, x, y + ancho / 2, z);
    if (s < sectores) indices.push(s * 2, s * 2 + 2, s * 2 + 1, s * 2 + 1, s * 2 + 2, s * 2 + 3);
  }
  const correa = new THREE.BufferGeometry();
  correa.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3));
  correa.setIndex(indices);
  correa.computeVertexNormals();

  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(correa, new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide })));
  const metal = new THREE.MeshStandardMaterial({ color: '#c9c9d1', metalness: 0.95, roughness: 0.25 });
  const frente = suave[Math.floor(sectores / 2)]!;
  const hebilla = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.01), metal);
  hebilla.position.set(0, y, centroZ + frente + 0.004);
  grupo.add(hebilla);
  for (let s = 0; s < sectores; s += 4) {
    if (Math.abs(s - sectores / 2) < 4) continue;
    const angulo = (s / sectores - 0.5) * 2 * Math.PI;
    const tacha = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), metal);
    tacha.position.set(Math.sin(angulo) * (suave[s]! + 0.002), y, centroZ + Math.cos(angulo) * (suave[s]! + 0.002));
    grupo.add(tacha);
  }
  return grupo;
}
