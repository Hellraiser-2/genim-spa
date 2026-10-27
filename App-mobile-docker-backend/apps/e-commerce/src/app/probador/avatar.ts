import * as THREE from 'three';

/**
 * Cuerpo del maniquí y polera como superficies continuas.
 *
 * Cada parte del cuerpo (torso, pectorales, deltoides, brazos, piernas, manos, pies, cabeza) se
 * describe con una función de distancia con signo: negativa dentro, positiva fuera. Las partes
 * se funden con una unión suave, de modo que hombros, codos, caderas y rodillas pasan de una a
 * otra sin costuras. La malla se extrae de esa función con "surface nets" sobre una grilla.
 *
 * La polera usa el mismo método: es el cuerpo bajo la prenda inflado lo justo para no
 * atravesarlo, unido a una caída que cuelga desde el pecho con el ancho de la talla, con
 * mangas, pliegues según lo holgada que quede y el escote, las mangas y la basta recortados.
 *
 * Todo trabaja en metros, con el suelo en y = 0 y el frente hacia +z.
 */

/** Sección elíptica del torso a una altura: semiejes de ancho (a) y profundidad (b) y centro en z. */
export interface SeccionTorso {
  a: number;
  b: number;
  zc: number;
}

/** Lo que el avatar necesita del esqueleto del maniquí. */
export interface EsqueletoAvatar {
  alto: number;
  seccion: (y: number) => SeccionTorso;
  yTorsoInferior: number;
  yTorsoSuperior: number;
  yEntrepierna: number;
  yPecho: number;
  /** Semiejes del torso a la altura del pecho y de la cadera. */
  pecho: SeccionTorso;
  cadera: SeccionTorso;
  radioCuello: number;
  hombro: THREE.Vector3;
  direccionBrazo: THREE.Vector3;
  largoBrazo: number;
  largoAntebrazo: number;
  radioBrazo: number;
  radioAntebrazo: number;
  piernaX: number;
  radioMuslo: number;
  radioRodilla: number;
  radioTobillo: number;
}

/** Medidas de la polera que se dibuja, en centímetros. */
export interface MedidasPolera {
  /** Contorno de pecho de la prenda. */
  contorno: number;
  /** Largo del cuerpo de la prenda. */
  largo: number;
  /** Diferencia entre el contorno de la prenda y el del pecho del cliente. */
  holgura: number;
  color: string;
}

// ---------------------------------------------------------------------------------------------
// Funciones de distancia
// ---------------------------------------------------------------------------------------------

type Distancia = (x: number, y: number, z: number) => number;

/** Una parte del cuerpo: su distancia, la caja donde influye y cuánto se funde con las demás. */
interface Pieza {
  d: Distancia;
  min: THREE.Vector3;
  max: THREE.Vector3;
  suavizado: number;
  /** Parte del cuerpo que queda bajo la polera. */
  bajoPolera?: boolean;
}

/** Unión suave polinómica: funde dos superficies en una franja de ancho `k`. */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Distancia aproximada a una elipse de semiejes `a` y `b` centrada en el origen. */
function distanciaElipse(x: number, z: number, a: number, b: number): number {
  const k0 = Math.hypot(x / a, z / b);
  const k1 = Math.hypot(x / (a * a), z / (b * b));
  return k1 === 0 ? -Math.min(a, b) : (k0 * (k0 - 1)) / k1;
}

function caja(centro: THREE.Vector3, radio: number): [THREE.Vector3, THREE.Vector3] {
  return [centro.clone().subScalar(radio), centro.clone().addScalar(radio)];
}

/** Elipsoide con ejes propios (`u`, `v`, `w`, unitarios) y radios en cada uno. */
function elipsoide(
  c: THREE.Vector3,
  radios: [number, number, number],
  suavizado: number,
  ejes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
): Pieza {
  const [rx, ry, rz] = radios;
  const [u, v, w] = ejes;
  const d: Distancia = (x, y, z) => {
    const px = x - c.x;
    const py = y - c.y;
    const pz = z - c.z;
    const lx = (px * u.x + py * u.y + pz * u.z) / rx;
    const ly = (px * v.x + py * v.y + pz * v.z) / ry;
    const lz = (px * w.x + py * w.y + pz * w.z) / rz;
    const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const k1 = Math.sqrt((lx / rx) ** 2 + (ly / ry) ** 2 + (lz / rz) ** 2);
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  };
  const [min, max] = caja(c, Math.max(rx, ry, rz));
  return { d, min, max, suavizado };
}

/** Cono de puntas redondeadas de `a` (radio `r1`) a `b` (radio `r2`): brazos y piernas. */
function cono(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, suavizado: number): Pieza {
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const d: Distancia = (x, y, z) => {
    const pax = x - a.x;
    const pay = y - a.y;
    const paz = z - a.z;
    const yv = pax * bax + pay * bay + paz * baz;
    const zv = yv - l2;
    const qx = pax * l2 - bax * yv;
    const qy = pay * l2 - bay * yv;
    const qz = paz * l2 - baz * yv;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yv * yv * l2;
    const z2 = zv * zv * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
  };
  const r = Math.max(r1, r2);
  const min = new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)).subScalar(r);
  const max = new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)).addScalar(r);
  return { d, min, max, suavizado };
}

/** Torso: secciones elípticas que cambian con la altura, cerradas arriba y abajo. */
function torso(esq: EsqueletoAvatar, suavizado: number): Pieza {
  const { yTorsoInferior: abajo, yTorsoSuperior: arriba } = esq;
  const redondeo = 0.02 * esq.alto;
  const d: Distancia = (x, y, z) => {
    const s = esq.seccion(y);
    const lateral = distanciaElipse(x, z - s.zc, s.a, s.b);
    return smax(lateral, Math.max(abajo - y, y - arriba), redondeo);
  };
  const ancho = Math.max(esq.pecho.a, esq.cadera.a, esq.hombro.x) * 1.15;
  const fondo = Math.max(esq.pecho.b, esq.cadera.b) * 1.4;
  return { d, min: new THREE.Vector3(-ancho, abajo - 0.02, -fondo), max: new THREE.Vector3(ancho, arriba + 0.02, fondo), suavizado };
}

/** Base ortonormal con `eje` como segundo vector, para orientar elipsoides a lo largo de un hueso. */
function baseSobre(eje: THREE.Vector3, adelante = new THREE.Vector3(0, 0, 1)): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const v = eje.clone().normalize();
  const u = new THREE.Vector3().crossVectors(v, adelante).normalize();
  const w = new THREE.Vector3().crossVectors(u, v).normalize();
  return [u, v, w];
}

function puntosBrazo(esq: EsqueletoAvatar, lado: 1 | -1) {
  const hombro = esq.hombro.clone().setX(esq.hombro.x * lado);
  const direccion = esq.direccionBrazo.clone().setX(esq.direccionBrazo.x * lado);
  const codo = hombro.clone().addScaledVector(direccion, esq.largoBrazo);
  // El antebrazo sigue la línea del brazo, como en el esqueleto que usan las demás prendas.
  const antebrazo = direccion.clone();
  const muneca = codo.clone().addScaledVector(antebrazo, esq.largoAntebrazo);
  return { hombro, codo, muneca, direccion, antebrazo };
}

/**
 * Glúteos: centro (x y z como fracción de la sección de cadera, y como fracción de la altura) y
 * radios. Quedan sobre la entrepierna para que el pantalón los cubra.
 */
const GLUTEO = { x: 0.42, y: 0.525, z: 0.38, rx: 0.5, ry: 0.05, rz: 0.5 } as const;

/**
 * Hasta dónde llegan los glúteos a una altura, hacia atrás (desde z = 0) y hacia el costado, con
 * el margen del fundido con el torso. Lo usan las prendas que rodean la cadera.
 */
export function alcanceGluteos(esq: EsqueletoAvatar, y: number): { atras: number; costado: number } {
  const g = GLUTEO;
  const t = (y - g.y * esq.alto) / (g.ry * esq.alto);
  if (Math.abs(t) >= 1) return { atras: 0, costado: 0 };
  const s = Math.sqrt(1 - t * t);
  const margen = 0.0075 * esq.alto;
  return {
    atras: Math.abs(esq.cadera.zc - esq.cadera.b * g.z) + esq.cadera.b * g.rz * s + margen,
    costado: esq.cadera.a * (g.x + g.rx * s) + margen,
  };
}

/** Brazo del hombro al codo, con su bíceps. La polera las usa también para envolver el hombro. */
function piezasBrazoSuperior(esq: EsqueletoAvatar, lado: 1 | -1): Pieza[] {
  const h = esq.alto;
  const { hombro, codo, direccion } = puntosBrazo(esq, lado);
  const rB = esq.radioBrazo;
  const biceps = hombro.clone().addScaledVector(direccion, esq.largoBrazo * 0.45).add(new THREE.Vector3(0, 0, rB * 0.22));
  return [
    cono(hombro, codo, rB * 0.95, esq.radioAntebrazo * 0.95, 0.02 * h),
    elipsoide(biceps, [rB * 0.82, esq.largoBrazo * 0.3, rB * 0.85], 0.02 * h, baseSobre(direccion)),
  ];
}

/** Todas las partes del cuerpo del maniquí. */
function piezasCuerpo(esq: EsqueletoAvatar): Pieza[] {
  const h = esq.alto;
  const piezas: Pieza[] = [];
  const agregar = (pieza: Pieza, marcas: Partial<Pick<Pieza, 'bajoPolera'>> = {}) => piezas.push({ ...pieza, ...marcas });
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Torso con pectorales y glúteos sutiles.
  agregar(torso(esq, 0.03 * h), { bajoPolera: true });
  const { pecho, cadera } = esq;
  for (const lado of [1, -1] as const) {
    agregar(elipsoide(v(lado * pecho.a * 0.42, esq.yPecho + 0.005 * h, pecho.zc + pecho.b * 0.5), [pecho.a * 0.4, 0.042 * h, pecho.b * 0.36], 0.025 * h), { bajoPolera: true });
    const g = GLUTEO;
    agregar(elipsoide(v(lado * cadera.a * g.x, g.y * h, cadera.zc - cadera.b * g.z), [cadera.a * g.rx, g.ry * h, cadera.b * g.rz], 0.03 * h), { bajoPolera: true });
  }

  // Cuello y cabeza.
  agregar(cono(v(0, 0.83 * h, -0.006 * h), v(0, 0.9 * h, -0.002 * h), esq.radioCuello * 1.12, esq.radioCuello * 0.98, 0.025 * h));
  agregar(elipsoide(v(0, 0.938 * h, -0.004 * h), [0.043 * h, 0.059 * h, 0.051 * h], 0.03 * h));
  agregar(elipsoide(v(0, 0.9 * h, 0.014 * h), [0.034 * h, 0.042 * h, 0.036 * h], 0.03 * h));
  agregar(elipsoide(v(0, 0.912 * h, 0.051 * h), [0.0055 * h, 0.012 * h, 0.009 * h], 0.008 * h));

  for (const lado of [1, -1] as const) {
    const { hombro, codo, muneca, direccion, antebrazo } = puntosBrazo(esq, lado);
    const rB = esq.radioBrazo;
    const rA = esq.radioAntebrazo;

    // Deltoides, brazo con bíceps, antebrazo y mano.
    // Deltoides: la copa del hombro queda bajo el cuello, para que el hombro caiga desde él.
    agregar(elipsoide(hombro.clone().add(v(-lado * rB * 0.3, -0.01 * h, 0)), [rB * 1.0, rB * 1.05, rB * 1.02], 0.03 * h, baseSobre(direccion)), { bajoPolera: true });
    for (const pieza of piezasBrazoSuperior(esq, lado)) agregar(pieza);

    agregar(cono(codo, muneca, rA * 1.02, rA * 0.62, 0.02 * h));
    const musculoAntebrazo = codo.clone().addScaledVector(antebrazo, esq.largoAntebrazo * 0.25);
    agregar(elipsoide(musculoAntebrazo, [rA * 1.05, esq.largoAntebrazo * 0.3, rA * 0.95], 0.02 * h, baseSobre(antebrazo)));

    // Mano con la palma hacia el muslo, dedos juntos y pulgar.
    const ejesMano = baseSobre(antebrazo);
    agregar(elipsoide(muneca.clone().addScaledVector(antebrazo, 0.042 * h), [0.012 * h, 0.042 * h, 0.024 * h], 0.012 * h, ejesMano));
    agregar(elipsoide(muneca.clone().addScaledVector(antebrazo, 0.085 * h), [0.01 * h, 0.03 * h, 0.021 * h], 0.012 * h, ejesMano));
    const pulgarBase = muneca.clone().addScaledVector(antebrazo, 0.022 * h).add(v(0, 0, 0.016 * h));
    const pulgarPunta = pulgarBase.clone().addScaledVector(antebrazo, 0.045 * h).add(v(-lado * 0.004 * h, 0, 0.01 * h));
    agregar(cono(pulgarBase, pulgarPunta, 0.0085 * h, 0.006 * h, 0.01 * h));

    // Pierna: muslo con cuádriceps, rodilla, pantorrilla, tobillo y pie.
    const caderaP = v(esq.piernaX * lado, 0.5 * h, 0);
    const rodilla = v(esq.piernaX * lado * 0.92, 0.285 * h, 0.004 * h);
    const tobillo = v(esq.piernaX * lado * 0.88, 0.045 * h, 0);
    const rM = esq.radioMuslo;
    const rR = esq.radioRodilla;
    const ejeMuslo = rodilla.clone().sub(caderaP);
    agregar(cono(caderaP, rodilla, rM, rR * 0.95, 0.03 * h));
    agregar(elipsoide(caderaP.clone().addScaledVector(ejeMuslo, 0.45).add(v(0, 0, rM * 0.28)), [rM * 0.72, ejeMuslo.length() * 0.36, rM * 0.7], 0.025 * h, baseSobre(ejeMuslo)));
    agregar(elipsoide(rodilla.clone().add(v(0, 0.004 * h, rR * 0.6)), [rR * 0.55, rR * 0.6, rR * 0.45], 0.012 * h));
    const ejeCanilla = tobillo.clone().sub(rodilla);
    agregar(cono(rodilla, tobillo, rR * 0.9, esq.radioTobillo, 0.02 * h));
    agregar(elipsoide(rodilla.clone().addScaledVector(ejeCanilla, 0.3).add(v(0, 0, -rR * 0.32)), [rR * 0.92, ejeCanilla.length() * 0.27, rR * 0.95], 0.025 * h, baseSobre(ejeCanilla)));
    const pie = elipsoide(v(tobillo.x, 0.024 * h, 0.036 * h), [0.026 * h, 0.021 * h, 0.07 * h], 0.02 * h);
    const talon = elipsoide(v(tobillo.x, 0.024 * h, -0.012 * h), [0.022 * h, 0.022 * h, 0.026 * h], 0.02 * h);
    // La planta queda plana sobre el suelo.
    agregar({ ...pie, d: (x, y, z) => smax(pie.d(x, y, z), -y, 0.004 * h) });
    agregar({ ...talon, d: (x, y, z) => smax(talon.d(x, y, z), -y, 0.004 * h) });
  }
  return piezas;
}

// ---------------------------------------------------------------------------------------------
// Grilla y extracción de la superficie
// ---------------------------------------------------------------------------------------------

/** Valores de una función de distancia en los puntos de una grilla regular. */
interface Campo {
  origen: THREE.Vector3;
  paso: number;
  nx: number;
  ny: number;
  nz: number;
  valores: Float32Array;
}

const LEJOS = 1;

function crearCampo(min: THREE.Vector3, max: THREE.Vector3, paso: number): Campo {
  const nx = Math.ceil((max.x - min.x) / paso) + 1;
  const ny = Math.ceil((max.y - min.y) / paso) + 1;
  const nz = Math.ceil((max.z - min.z) / paso) + 1;
  const valores = new Float32Array(nx * ny * nz).fill(LEJOS);
  return { origen: min.clone(), paso, nx, ny, nz, valores };
}

/** Funde las piezas en el campo. Cada pieza solo se evalúa en su caja, más el margen de fundido. */
function fundirPiezas(campo: Campo, piezas: Pieza[]): void {
  const { origen, paso, nx, ny, nz, valores } = campo;
  for (const pieza of piezas) {
    const margen = pieza.suavizado + 2 * paso;
    const i0 = Math.max(0, Math.floor((pieza.min.x - margen - origen.x) / paso));
    const i1 = Math.min(nx - 1, Math.ceil((pieza.max.x + margen - origen.x) / paso));
    const j0 = Math.max(0, Math.floor((pieza.min.y - margen - origen.y) / paso));
    const j1 = Math.min(ny - 1, Math.ceil((pieza.max.y + margen - origen.y) / paso));
    const k0 = Math.max(0, Math.floor((pieza.min.z - margen - origen.z) / paso));
    const k1 = Math.min(nz - 1, Math.ceil((pieza.max.z + margen - origen.z) / paso));
    for (let k = k0; k <= k1; k++) {
      const z = origen.z + k * paso;
      for (let j = j0; j <= j1; j++) {
        const y = origen.y + j * paso;
        let indice = (k * ny + j) * nx + i0;
        for (let i = i0; i <= i1; i++, indice++) {
          valores[indice] = smin(valores[indice]!, pieza.d(origen.x + i * paso, y, z), pieza.suavizado);
        }
      }
    }
  }
}

/** Valor del campo en un punto cualquiera, interpolado entre los ocho puntos vecinos de la grilla. */
function muestrear(campo: Campo, x: number, y: number, z: number): number {
  const { origen, paso, nx, ny, nz, valores } = campo;
  const fx = Math.min(Math.max((x - origen.x) / paso, 0), nx - 1.001);
  const fy = Math.min(Math.max((y - origen.y) / paso, 0), ny - 1.001);
  const fz = Math.min(Math.max((z - origen.z) / paso, 0), nz - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const k = Math.floor(fz);
  const tx = fx - i;
  const ty = fy - j;
  const tz = fz - k;
  const base = (k * ny + j) * nx + i;
  const capa = nx * ny;
  const v = (desplazamiento: number) => valores[base + desplazamiento]!;
  const c00 = v(0) * (1 - tx) + v(1) * tx;
  const c10 = v(nx) * (1 - tx) + v(nx + 1) * tx;
  const c01 = v(capa) * (1 - tx) + v(capa + 1) * tx;
  const c11 = v(capa + nx) * (1 - tx) + v(capa + nx + 1) * tx;
  return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
}

function gradiente(campo: Campo, x: number, y: number, z: number, salida: THREE.Vector3): THREE.Vector3 {
  const e = campo.paso * 0.5;
  return salida.set(
    muestrear(campo, x + e, y, z) - muestrear(campo, x - e, y, z),
    muestrear(campo, x, y + e, z) - muestrear(campo, x, y - e, z),
    muestrear(campo, x, y, z + e) - muestrear(campo, x, y, z - e),
  ).divideScalar(2 * e);
}

interface Malla {
  posiciones: Float32Array;
  normales: Float32Array;
  /** Cuadriláteros: cuatro índices de vértice cada uno. */
  cuadros: Uint32Array;
}

const ESQUINAS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const ARISTAS: [number, number][] = [];
for (let c = 0; c < 8; c++) {
  for (let bit = 0; bit < 3; bit++) {
    if (!(c & (1 << bit))) ARISTAS.push([c, c | (1 << bit)]);
  }
}

/**
 * Surface nets: un vértice por celda que cruza la superficie, en el promedio de los cruces de
 * sus aristas, y un cuadrilátero por cada arista de la grilla que la superficie atraviesa.
 * Luego se suaviza la malla y se vuelve a apoyar sobre la superficie.
 */
function extraerSuperficie(campo: Campo): Malla {
  const { origen, paso, nx, ny, nz, valores } = campo;
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const verticeDeCelda = new Int32Array(nx * ny * nz).fill(-1);
  const posiciones: number[] = [];
  const esquina = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mascara = 0;
        for (let c = 0; c < 8; c++) {
          const [dx, dy, dz] = ESQUINAS[c]!;
          const valor = valores[idx(i + dx, j + dy, k + dz)]!;
          esquina[c] = valor;
          if (valor < 0) mascara |= 1 << c;
        }
        if (mascara === 0 || mascara === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let cruces = 0;
        for (const [c0, c1] of ARISTAS) {
          const a = esquina[c0]!;
          const b = esquina[c1]!;
          if (a < 0 === b < 0) continue;
          const t = a / (a - b);
          const p0 = ESQUINAS[c0]!;
          const p1 = ESQUINAS[c1]!;
          sx += p0[0] + t * (p1[0] - p0[0]);
          sy += p0[1] + t * (p1[1] - p0[1]);
          sz += p0[2] + t * (p1[2] - p0[2]);
          cruces++;
        }
        verticeDeCelda[idx(i, j, k)] = posiciones.length / 3;
        posiciones.push(origen.x + (i + sx / cruces) * paso, origen.y + (j + sy / cruces) * paso, origen.z + (k + sz / cruces) * paso);
      }
    }
  }

  // Ejes en orden cíclico (a, b, c) para que todas las caras queden hacia afuera.
  const cuadros: number[] = [];
  const n = [nx, ny, nz];
  const ciclos: [number, number, number][] = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  const p = [0, 0, 0];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const dentro = valores[idx(i, j, k)]! < 0;
        p[0] = i;
        p[1] = j;
        p[2] = k;
        for (const [a, b, c] of ciclos) {
          if (p[a]! >= n[a]! - 1 || p[b]! < 1 || p[c]! < 1 || p[b]! >= n[b]! - 1 || p[c]! >= n[c]! - 1) continue;
          const q = [i, j, k];
          q[a]++;
          if (dentro === valores[idx(q[0]!, q[1]!, q[2]!)]! < 0) continue;
          const celda = (db: number, dc: number) => {
            const r = [i, j, k];
            r[b] -= db;
            r[c] -= dc;
            return verticeDeCelda[idx(r[0]!, r[1]!, r[2]!)]!;
          };
          const v0 = celda(0, 0);
          const v1 = celda(1, 0);
          const v2 = celda(1, 1);
          const v3 = celda(0, 1);
          if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) continue;
          if (dentro) cuadros.push(v0, v1, v2, v3);
          else cuadros.push(v0, v3, v2, v1);
        }
      }
    }
  }

  const malla: Malla = {
    posiciones: new Float32Array(posiciones),
    normales: new Float32Array(posiciones.length),
    cuadros: new Uint32Array(cuadros),
  };
  suavizarSobreSuperficie(campo, malla, 2);
  return malla;
}

/** Acerca cada vértice al promedio de sus vecinos y lo devuelve a la superficie; calcula las normales. */
function suavizarSobreSuperficie(campo: Campo, malla: Malla, pasadas: number): void {
  const { posiciones, normales, cuadros } = malla;
  const total = posiciones.length / 3;
  const suma = new Float32Array(posiciones.length);
  const vecinos = new Uint16Array(total);
  const g = new THREE.Vector3();
  for (let pasada = 0; pasada < pasadas; pasada++) {
    suma.fill(0);
    vecinos.fill(0);
    for (let q = 0; q < cuadros.length; q += 4) {
      for (let e = 0; e < 4; e++) {
        const a = cuadros[q + e]!;
        const b = cuadros[q + ((e + 1) % 4)]!;
        for (let eje = 0; eje < 3; eje++) {
          suma[a * 3 + eje] += posiciones[b * 3 + eje]!;
          suma[b * 3 + eje] += posiciones[a * 3 + eje]!;
        }
        vecinos[a]++;
        vecinos[b]++;
      }
    }
    for (let v = 0; v < total; v++) {
      if (!vecinos[v]) continue;
      const x = posiciones[v * 3]! * 0.5 + (suma[v * 3]! / vecinos[v]!) * 0.5;
      const y = posiciones[v * 3 + 1]! * 0.5 + (suma[v * 3 + 1]! / vecinos[v]!) * 0.5;
      const z = posiciones[v * 3 + 2]! * 0.5 + (suma[v * 3 + 2]! / vecinos[v]!) * 0.5;
      const valor = muestrear(campo, x, y, z);
      gradiente(campo, x, y, z, g);
      const largo2 = g.lengthSq() || 1;
      posiciones[v * 3] = x - (valor * g.x) / largo2;
      posiciones[v * 3 + 1] = y - (valor * g.y) / largo2;
      posiciones[v * 3 + 2] = z - (valor * g.z) / largo2;
    }
  }
  for (let v = 0; v < total; v++) {
    gradiente(campo, posiciones[v * 3]!, posiciones[v * 3 + 1]!, posiciones[v * 3 + 2]!, g).normalize();
    normales[v * 3] = g.x;
    normales[v * 3 + 1] = g.y;
    normales[v * 3 + 2] = g.z;
  }
}

function triangulos(cuadros: ArrayLike<number>, conservar?: (q: number) => boolean): Uint32Array {
  const indices: number[] = [];
  for (let q = 0; q < cuadros.length; q += 4) {
    if (conservar && !conservar(q)) continue;
    const [a, b, c, d] = [cuadros[q]!, cuadros[q + 1]!, cuadros[q + 2]!, cuadros[q + 3]!];
    indices.push(a, b, c, a, c, d);
  }
  return new Uint32Array(indices);
}

function cajaDe(piezas: Pieza[], margen: number): [THREE.Vector3, THREE.Vector3] {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const pieza of piezas) {
    min.min(pieza.min);
    max.max(pieza.max);
  }
  return [min.subScalar(margen), max.addScalar(margen)];
}

// ---------------------------------------------------------------------------------------------
// Cuerpo
// ---------------------------------------------------------------------------------------------

/** Malla continua del cuerpo del maniquí. */
export function crearCuerpo(esq: EsqueletoAvatar): THREE.Mesh {
  const piezas = piezasCuerpo(esq);
  const paso = esq.alto / 160;
  const [min, max] = cajaDe(piezas, 0.04);
  min.y = Math.max(min.y, -0.01);
  const campo = crearCampo(min, max, paso);
  fundirPiezas(campo, piezas);
  const malla = extraerSuperficie(campo);

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(malla.posiciones, 3));
  geometria.setAttribute('normal', new THREE.BufferAttribute(malla.normales, 3));
  geometria.setIndex(new THREE.BufferAttribute(triangulos(malla.cuadros), 1));
  // Maniquí de vitrina: fibra de vidrio mate con un leve barniz.
  const material = new THREE.MeshPhysicalMaterial({ color: '#d8cfc4', roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.6 });
  return new THREE.Mesh(geometria, material);
}

// ---------------------------------------------------------------------------------------------
// Polera
// ---------------------------------------------------------------------------------------------

/** Semieje mayor de una elipse con proporción `k` (profundidad / ancho) y el contorno dado, en metros. */
function semiejeElipse(contornoCm: number, k: number): number {
  return contornoCm / 100 / (Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k))));
}

/** Ruido suave en 3D (interpolación de valores al azar en una grilla), entre -1 y 1. */
function ruido(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = x - xi;
  const ty = y - yi;
  const tz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const azar = (i: number, j: number, k: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };
  const mezcla = (a: number, b: number, t: number) => a + (b - a) * s(t);
  const x00 = mezcla(azar(xi, yi, zi), azar(xi + 1, yi, zi), tx);
  const x10 = mezcla(azar(xi, yi + 1, zi), azar(xi + 1, yi + 1, zi), tx);
  const x01 = mezcla(azar(xi, yi, zi + 1), azar(xi + 1, yi, zi + 1), tx);
  const x11 = mezcla(azar(xi, yi + 1, zi + 1), azar(xi + 1, yi + 1, zi + 1), tx);
  return mezcla(mezcla(x00, x10, ty), mezcla(x01, x11, ty), tz);
}

/** Textura de relieve de tejido de punto (jersey), repetible. */
function texturaTejido(): THREE.DataTexture {
  const lado = 64;
  const alto = (x: number, y: number) => {
    // Columnas de puntos en V: la altura sube al centro de cada columna y ondula por fila.
    const columna = (((x % 8) + 8) % 8) / 8;
    const v = Math.abs(columna - 0.5) * 2;
    return Math.cos(Math.PI * v) * 0.5 + Math.sin(2 * Math.PI * (y / 8 + v * 0.5)) * 0.35;
  };
  const datos = new Uint8Array(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const dx = alto(x + 1, y) - alto(x - 1, y);
      const dy = alto(x, y + 1) - alto(x, y - 1);
      const n = new THREE.Vector3(-dx, -dy, 2).normalize();
      const i = (y * lado + x) * 4;
      datos[i] = (n.x * 0.5 + 0.5) * 255;
      datos[i + 1] = (n.y * 0.5 + 0.5) * 255;
      datos[i + 2] = (n.z * 0.5 + 0.5) * 255;
      datos[i + 3] = 255;
    }
  }
  const textura = new THREE.DataTexture(datos, lado, lado, THREE.RGBAFormat);
  textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
  textura.repeat.set(28, 36);
  // Con mipmaps el tejido se promedia a la distancia en vez de formar rayas (moiré).
  textura.generateMipmaps = true;
  textura.minFilter = THREE.LinearMipmapLinearFilter;
  textura.magFilter = THREE.LinearFilter;
  textura.anisotropy = 8;
  textura.needsUpdate = true;
  return textura;
}

/**
 * Medidas de patrón de una camiseta básica de manga corta, en centímetros, a partir de su
 * contorno de pecho. Cada medida crece a su propio ritmo, como en una tabla de tallas real:
 * la polera no se escala de forma uniforme.
 */
function patronCamiseta(contorno: number) {
  return {
    /** Ancho de hombros, de costura a costura. */
    hombros: 0.405 * contorno + 0.5,
    /** Largo de la manga desde la costura del hombro. */
    manga: 18 + (contorno - 110) * 0.12,
    /** Contorno de la manga a la altura de la axila. */
    sisa: 0.36 * contorno + 3,
    /** Contorno de la abertura de la manga. */
    boca: 0.33 * contorno + 2,
  };
}

/** Manga corta de un lado: su pieza y el eje con que se recorta su abertura. */
interface MangaPolera {
  pieza: Pieza;
  lado: 1 | -1;
  inicio: THREE.Vector3;
  eje: THREE.Vector3;
  largo: number;
  radioBoca: number;
}

/**
 * Polera puesta sobre el cuerpo, con el patrón de la talla: ancho de pecho y de hombros, largo
 * del cuerpo y de las mangas y ancho de las mangas. Devuelve el grupo con la tela, el cuello
 * acanalado y los ruedos de basta y mangas.
 */
export function crearPolera(esq: EsqueletoAvatar, medidas: MedidasPolera, yBasta: number): THREE.Group {
  const h = esq.alto;
  const holgada = Math.max(medidas.holgura, 0);
  const holgadaRelativa = Math.min(holgada / 40, 1);
  const patron = patronCamiseta(medidas.contorno);

  const huelgo = 0.0045;
  // Una polera holgada se separa un poco del cuerpo también en hombros y espalda.
  const separacion = huelgo + 0.0008 + Math.min((holgada / 100) * 0.08, 0.008);
  const yBastaReal = Math.max(yBasta, esq.yEntrepierna - 0.02 * h);

  // Caída del tronco: columna elíptica con el contorno de la prenda que cuelga desde el pecho
  // y se abre apenas hacia la basta, como una camiseta recta.
  const proporcion = 0.74;
  const aCaida = semiejeElipse(medidas.contorno, proporcion);
  const zCaida = esq.pecho.zc;
  const yCaidaArriba = esq.yPecho + 0.02 * h;
  const yCaidaAbajo = yBastaReal - 0.05 * h;
  // Los brazos cuelgan junto al torso: la tela que sobra no puede pasar más allá de ellos.
  const coseno = -esq.direccionBrazo.y;
  const tangente = esq.direccionBrazo.x / coseno;
  const limiteBrazos = (y: number) => {
    const ejeX = esq.hombro.x + (esq.hombro.y - y) * tangente;
    // El grosor del brazo pasa de a poco al del antebrazo: sin escalón a la altura del codo.
    const t = Math.min(Math.max((esq.hombro.y - y) / (esq.largoBrazo * coseno), 0), 1);
    const radio = esq.radioBrazo * 1.1 + (esq.radioAntebrazo * 1.05 - esq.radioBrazo * 1.1) * t;
    return ejeX - radio - 0.008;
  };
  const caida: Pieza = {
    d: (x, y, z) => {
      const t = Math.min(Math.max((yCaidaArriba - y) / (yCaidaArriba - yBastaReal), 0), 1);
      const abierta = aCaida * (1 + (0.015 + 0.035 * holgadaRelativa) * t);
      // La caída nunca queda más angosta que el cuerpo a esa altura (caderas y glúteos): así la
      // tela pasa sobre ellos sin formar un escalón.
      const seccion = esq.seccion(y);
      const gluteos = alcanceGluteos(esq, y);
      const anchoCuerpo = Math.max(seccion.a, gluteos.costado) + separacion + 0.004;
      const fondoCuerpo = Math.max(seccion.b + Math.abs(seccion.zc - zCaida), gluteos.atras + zCaida) + separacion + 0.004;
      // El ancho se detiene en los brazos; lo que sobra de tela queda adelante y atrás.
      const a = Math.min(Math.max(abierta, anchoCuerpo), Math.max(limiteBrazos(y), esq.pecho.a, anchoCuerpo));
      const lateral = distanciaElipse(x, z - zCaida, a, Math.max(abierta * proporcion, fondoCuerpo));
      return smax(smax(lateral, y - yCaidaArriba, 0.06 * h), yCaidaAbajo - y, 0.01);
    },
    min: new THREE.Vector3(-aCaida * 1.1, yCaidaAbajo - 0.02, zCaida - aCaida * proporcion * 1.1),
    max: new THREE.Vector3(aCaida * 1.1, yCaidaArriba + 0.03, zCaida + aCaida * proporcion * 1.1),
    suavizado: 0,
  };

  // Mangas: tubos que nacen en la costura del hombro y caen junto al brazo, apenas inclinados
  // hacia afuera, así la abertura queda inclinada y suave.
  const mangas: MangaPolera[] = [];
  const brazosBajoManga: Pieza[] = [];
  for (const lado of [1, -1] as const) {
    const { hombro, direccion } = puntosBrazo(esq, lado);
    const rB = esq.radioBrazo;
    // Hacia afuera y arriba, perpendicular al brazo en su plano.
    const afuera = new THREE.Vector3(-direccion.y * lado, direccion.x * lado, 0);
    // Si la polera es más ancha de hombros que el cuerpo, la costura cae sobre el brazo.
    const puntaHombro = esq.hombro.x + rB * 0.4;
    const bajada = Math.min(Math.max(patron.hombros / 200 - puntaHombro, 0) * 1.2, 0.05);
    const radioSisa = Math.max(patron.sisa / 100 / (2 * Math.PI), rB * 1.18 + separacion + 0.003);
    const radioBoca = Math.max(patron.boca / 100 / (2 * Math.PI), rB * 1.1 + separacion + 0.004);
    // Por su peso, la parte de arriba de la manga descansa sobre el hombro y lo que sobra de
    // ancho queda hacia la axila: el eje se corre hacia adentro en la sisa. El tubo nace lo
    // justo más abajo para que su extremo redondo no asome sobre el hombro.
    const hundimiento = Math.max(radioSisa - rB * 1.05 - separacion, 0);
    const inicio = hombro
      .clone()
      .addScaledVector(direccion, bajada + Math.max(0.01 * h, radioSisa - rB * 0.9))
      .addScaledVector(afuera, -hundimiento);
    const fin = hombro
      .clone()
      .addScaledVector(direccion, bajada + patron.manga / 100)
      // La holgura queda repartida a ambos lados del brazo: la manga cae junto a él, sin acampanarse.
      .addScaledVector(afuera, Math.max(radioBoca - rB * 1.1 - separacion - 0.002, 0) * 0.5);
    const eje = fin.clone().sub(inicio).normalize();
    const largo = fin.distanceTo(inicio);
    mangas.push({ pieza: cono(inicio, fin.clone().addScaledVector(eje, 0.012 * h), radioSisa, radioBoca * 0.97, 0), lado, inicio, eje, largo, radioBoca });

    // El brazo bajo la manga cuenta como cuerpo de la polera hasta la abertura: la tela lo
    // envuelve sin dejarlo asomar y termina justo donde se recorta la manga.
    const hastaAbertura = (pieza: Pieza): Pieza => ({
      ...pieza,
      d: (x, y, z) => Math.max(pieza.d(x, y, z), (x - inicio.x) * eje.x + (y - inicio.y) * eje.y + (z - inicio.z) * eje.z - largo - 0.002),
      bajoPolera: true,
    });
    brazosBajoManga.push(...piezasBrazoSuperior(esq, lado).map(hastaAbertura));
  }

  const piezasCuerpoBajo = [...piezasCuerpo(esq).filter((pieza) => pieza.bajoPolera), ...brazosBajoManga];
  const piezasPrenda = [caida, ...mangas.map((manga) => manga.pieza)];

  const paso = h / 195;
  const [min, max] = cajaDe([...piezasCuerpoBajo, ...piezasPrenda], 0.035);
  min.y = Math.max(min.y, yCaidaAbajo - 0.02);
  max.y = Math.min(max.y, 0.86 * h);

  // Tres campos sobre la misma grilla: el cuerpo bajo la polera, la caída y las mangas.
  const cuerpo = crearCampo(min, max, paso);
  fundirPiezas(cuerpo, piezasCuerpoBajo);
  const prenda = crearCampo(min, max, paso);
  fundirPiezas(prenda, [caida]);
  const mangasCampo = crearCampo(min, max, paso);
  fundirPiezas(mangasCampo, mangas.map((manga) => manga.pieza));

  const pliegue = (x: number, y: number, z: number): number => {
    let desplazamiento = 0;
    const angulo = Math.atan2(x, z - zCaida);
    // Pliegues verticales de la caída: discretos, más marcados hacia la basta, en los costados
    // y cuando sobra tela.
    const bajoPecho = Math.min(Math.max((esq.yPecho - y) / (esq.yPecho - yBastaReal), 0), 1);
    if (bajoPecho > 0) {
      const costados = 0.6 + 0.4 * Math.abs(Math.sin(angulo));
      const onda = Math.sin(angulo * 8 + 1.6 * Math.sin(angulo * 3 + y * 8)) * 0.55 + ruido(x * 12, y * 4, z * 12) * 0.45;
      desplazamiento += onda * (0.0009 + 0.005 * holgadaRelativa) * costados * bajoPecho ** 1.5;
    }
    // Tirones diagonales suaves desde la axila hacia el pecho.
    const axila = Math.max(0, 1 - Math.abs(y - (esq.yPecho + 0.03 * h)) / (0.06 * h)) * Math.max(0, 1 - Math.abs(Math.abs(x) - esq.pecho.a) / 0.05);
    desplazamiento += Math.sin((y + Math.abs(x) * 0.8) * 95) * 0.0012 * axila;
    // Tela tirante: arrugas horizontales finas en el pecho.
    if (medidas.holgura < 0) {
      const pechoZona = Math.max(0, 1 - Math.abs(y - esq.yPecho) / (0.08 * h));
      desplazamiento += Math.sin(y * 140) * 0.0007 * pechoZona;
    }
    // Irregularidad general de la tela.
    return desplazamiento + ruido(x * 30, y * 30, z * 30) * 0.0005;
  };

  // La polera: el cuerpo inflado unido a la caída y a las mangas, con pliegues y nunca más
  // adentro que el cuerpo más un huelgo. Las mangas se funden con un radio corto: la unión
  // con el hombro queda suave pero sin abultarse.
  const polera = crearCampo(min, max, paso);
  const { nx, ny, nz } = polera;
  for (let k = 0; k < nz; k++) {
    const z = min.z + k * paso;
    for (let j = 0; j < ny; j++) {
      const y = min.y + j * paso;
      for (let i = 0; i < nx; i++) {
        const indice = (k * ny + j) * nx + i;
        const dCuerpo = cuerpo.valores[indice]!;
        const dMangas = mangasCampo.valores[indice]!;
        if (dCuerpo > 0.12 && prenda.valores[indice]! > 0.12 && dMangas > 0.12) continue;
        const x = min.x + i * paso;
        // Hacia la basta la tela pasa sobre las caderas con un fundido cada vez más amplio, sin
        // marcar un quiebre donde la caída recta se encuentra con el cuerpo.
        const haciaBasta = Math.min(Math.max((esq.yPecho - y) / (esq.yPecho - yBastaReal), 0), 1);
        const tronco = smin(dCuerpo - separacion, prenda.valores[indice]!, (0.025 + 0.035 * haciaBasta) * h);
        const s = smin(tronco, dMangas, 0.01 * h) - pliegue(x, y, z);
        polera.valores[indice] = Math.min(s, dCuerpo - huelgo);
      }
    }
  }
  const malla = extraerSuperficie(polera);

  // Recortes: basta, escote y abertura de cada manga.
  const seccionCuello = esq.seccion(0.83 * h);
  const escote = { a: esq.radioCuello * 1.45, b: esq.radioCuello * 1.32, zc: seccionCuello.zc + 0.004 * h, desde: 0.78 * h };
  const enEscote = (x: number, y: number, z: number) => y > escote.desde && (x / escote.a) ** 2 + ((z - escote.zc) / escote.b) ** 2 < 1;
  const dManga = (x: number, y: number, z: number) => Math.min(...mangas.map((m) => m.pieza.d(x, y, z)));
  const dTronco = (x: number, y: number, z: number) => Math.min(muestrear(cuerpo, x, y, z) - separacion, caida.d(x, y, z));
  /** Manga a la que pertenece un punto, si está más cerca de una manga que del tronco. */
  const mangaDe = (x: number, y: number, z: number) => {
    if (dManga(x, y, z) >= dTronco(x, y, z)) return null;
    return mangas.find((m) => Math.sign(x) === m.lado) ?? null;
  };
  /** Cuánto pasa un punto de la abertura de su manga, medido a lo largo del eje de la manga. */
  const excesoManga = (manga: MangaPolera, x: number, y: number, z: number) =>
    (x - manga.inicio.x) * manga.eje.x + (y - manga.inicio.y) * manga.eje.y + (z - manga.inicio.z) * manga.eje.z - manga.largo;
  const fuera = (x: number, y: number, z: number): 'basta' | 'escote' | 'manga' | null => {
    const manga = mangaDe(x, y, z);
    // Solo se corta lo que está cerca de la abertura; más allá está la unión con el tronco bajo
    // la axila, que no se debe estirar hasta el borde.
    if (manga) {
      const exceso = excesoManga(manga, x, y, z);
      if (exceso > 0 && exceso < 0.012 * h + manga.radioBoca * 1.1) return 'manga';
    }
    if (y < yBastaReal) return 'basta';
    if (enEscote(x, y, z)) return 'escote';
    return null;
  };

  const { posiciones, cuadros } = malla;
  const conservar = (q: number) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let e = 0; e < 4; e++) {
      const v = cuadros[q + e]!;
      x += posiciones[v * 3]! / 4;
      y += posiciones[v * 3 + 1]! / 4;
      z += posiciones[v * 3 + 2]! / 4;
    }
    return fuera(x, y, z) === null;
  };
  const indices = triangulos(cuadros, conservar);

  // Los vértices de las caras que quedan pero caen fuera se llevan al borde del recorte. La
  // basta queda casi recta, con las pequeñas irregularidades de una tela real.
  const usados = new Uint8Array(posiciones.length / 3);
  indices.forEach((v) => (usados[v] = 1));
  for (let v = 0; v < usados.length; v++) {
    if (!usados[v]) continue;
    const x = posiciones[v * 3]!;
    const y = posiciones[v * 3 + 1]!;
    const z = posiciones[v * 3 + 2]!;
    const motivo = fuera(x, y, z);
    if (motivo === 'basta') {
      posiciones[v * 3 + 1] = yBastaReal + ruido(Math.atan2(x, z - zCaida) * 2.5, 1.3, 0.7) * 0.0025;
    } else if (motivo === 'escote') {
      const r = Math.hypot(x / escote.a, (z - escote.zc) / escote.b) || 1;
      posiciones[v * 3] = x / r;
      posiciones[v * 3 + 2] = escote.zc + (z - escote.zc) / r;
    } else if (motivo === 'manga') {
      const manga = mangaDe(x, y, z)!;
      const exceso = excesoManga(manga, x, y, z);
      posiciones[v * 3] = x - manga.eje.x * exceso;
      posiciones[v * 3 + 1] = y - manga.eje.y * exceso;
      posiciones[v * 3 + 2] = z - manga.eje.z * exceso;
    }
  }

  // Coordenadas de textura cilíndricas para el relieve del tejido, y sombreado de los pliegues:
  // los valles quedan algo más oscuros y las crestas algo más claras, como en una tela real.
  const total = posiciones.length / 3;
  const uv = new Float32Array(total * 2);
  const colores = new Float32Array(total * 3);
  for (let v = 0; v < total; v++) {
    const x = posiciones[v * 3]!;
    const y = posiciones[v * 3 + 1]!;
    const z = posiciones[v * 3 + 2]!;
    uv[v * 2] = Math.atan2(x, z - zCaida) / (2 * Math.PI) + 0.5;
    uv[v * 2 + 1] = y / h;
    const relieve = Math.min(Math.max(pliegue(x, y, z) / 0.004, -1), 1);
    const haciaAbajo = Math.max(-malla.normales[v * 3 + 1]!, 0);
    const tono = (1 + relieve * 0.12) * (1 - haciaAbajo * 0.1);
    colores[v * 3] = tono;
    colores[v * 3 + 1] = tono;
    colores[v * 3 + 2] = tono;
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute('normal', new THREE.BufferAttribute(malla.normales, 3));
  geometria.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometria.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geometria.setIndex(new THREE.BufferAttribute(indices, 1));

  // Algodón mate: casi sin brillo, con un leve terciopelo (sheen) en los bordes de los pliegues
  // y un relieve de punto muy sutil. Sin reflejos metálicos ni plásticos.
  const color = new THREE.Color(medidas.color);
  const opciones: THREE.MeshPhysicalMaterialParameters = {
    color,
    roughness: 0.96,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.9,
    sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.25),
    normalMap: texturaTejido(),
    normalScale: new THREE.Vector2(0.1, 0.1),
    side: THREE.DoubleSide,
  };
  const tela = new THREE.MeshPhysicalMaterial({ ...opciones, vertexColors: true });
  // Cuello y ruedos no tienen sombreado por vértice: usan el mismo algodón sin él.
  const bordeTela = new THREE.MeshPhysicalMaterial(opciones);

  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(geometria, tela));
  for (const borde of bordes(posiciones, indices)) {
    const centro = borde.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(borde.length);
    if (centro.y > escote.desde) grupo.add(cuelloAcanalado(borde, escote.zc, h, bordeTela));
    else grupo.add(ruedo(borde, 0.0026 * (h / 1.75), bordeTela));
  }
  return grupo;
}

/** Bordes abiertos de la malla (aristas que usa un solo triángulo), encadenados en lazos. */
function bordes(posiciones: Float32Array, indices: Uint32Array): THREE.Vector3[][] {
  const usos = new Map<string, number>();
  const clave = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = clave(indices[t + e]!, indices[t + ((e + 1) % 3)]!);
      usos.set(k, (usos.get(k) ?? 0) + 1);
    }
  }
  const siguientes = new Map<number, number[]>();
  for (const [k, n] of usos) {
    if (n !== 1) continue;
    const [a, b] = k.split(',').map(Number) as [number, number];
    siguientes.set(a, [...(siguientes.get(a) ?? []), b]);
    siguientes.set(b, [...(siguientes.get(b) ?? []), a]);
  }
  const visitados = new Set<number>();
  const lazos: THREE.Vector3[][] = [];
  for (const inicio of siguientes.keys()) {
    if (visitados.has(inicio)) continue;
    const lazo: THREE.Vector3[] = [];
    let actual: number | undefined = inicio;
    while (actual !== undefined && !visitados.has(actual)) {
      visitados.add(actual);
      const p = new THREE.Vector3(posiciones[actual * 3], posiciones[actual * 3 + 1], posiciones[actual * 3 + 2]);
      if (!lazo.length || lazo[lazo.length - 1]!.distanceTo(p) > 0.002) lazo.push(p);
      actual = siguientes.get(actual)!.find((v) => !visitados.has(v));
    }
    if (lazo.length >= 12) lazos.push(suavizarLazo(lazo, 4));
  }
  return lazos;
}

/** Promedia cada punto de un lazo cerrado con sus vecinos: quita los escalones de la grilla. */
function suavizarLazo(lazo: THREE.Vector3[], pasadas: number): THREE.Vector3[] {
  let puntos = lazo;
  for (let pasada = 0; pasada < pasadas; pasada++) {
    puntos = puntos.map((p, i) => {
      const anterior = puntos[(i - 1 + puntos.length) % puntos.length]!;
      const siguiente = puntos[(i + 1) % puntos.length]!;
      return p.clone().multiplyScalar(2).add(anterior).add(siguiente).multiplyScalar(0.25);
    });
  }
  return puntos;
}

/** Dobladillo: un tubo fino que sigue el borde, como la basta cosida de la tela. */
function ruedo(borde: THREE.Vector3[], radio: number, material: THREE.Material): THREE.Mesh {
  const curva = new THREE.CatmullRomCurve3(borde, true, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curva, borde.length * 2, radio, 6, true), material);
}

/** Cuello acanalado: una franja que sube desde el escote hacia el cuello, con un borde redondo. */
function cuelloAcanalado(borde: THREE.Vector3[], zCuello: number, h: number, material: THREE.Material): THREE.Group {
  const curva = new THREE.CatmullRomCurve3(borde, true, 'centripetal');
  const puntos = curva.getSpacedPoints(Math.max(borde.length * 2, 64));
  puntos.pop();
  const alto = 0.011 * h;
  const posiciones: number[] = [];
  const superiores: THREE.Vector3[] = [];
  for (const p of puntos) {
    const haciaCuello = new THREE.Vector3(-p.x, 0, zCuello - p.z).normalize();
    const arriba = new THREE.Vector3(0, 1, 0).addScaledVector(haciaCuello, 0.3).normalize();
    const q = p.clone().addScaledVector(arriba, alto);
    superiores.push(q);
    posiciones.push(p.x, p.y, p.z, q.x, q.y, q.z);
  }
  const indices: number[] = [];
  const n = puntos.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(geometria, material));
  const curvaSuperior = new THREE.CatmullRomCurve3(superiores, true, 'centripetal');
  grupo.add(new THREE.Mesh(new THREE.TubeGeometry(curvaSuperior, n, 0.0035 * (h / 1.75), 6, true), material));
  grupo.add(ruedo(borde, 0.003 * (h / 1.75), material));
  return grupo;
}
