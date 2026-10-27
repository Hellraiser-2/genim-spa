import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { Complexion, MedidasCuerpo, TipoPrenda } from '../data/probador';
import { medidasDeTalla, recomendarTalla } from '../data/probador';
import { EsqueletoAvatar, SeccionTorso, alcanceGluteos, crearCuerpo, crearPolera } from './avatar';
import {
  Cobertura,
  ModeloReal,
  cargarModeloReal,
  cargarPrendaReal,
  crearCinturonReal,
  crearCuerpoReal,
  crearPrendaReal,
  posicionesCuerpo,
  tieneModeloReal,
} from './cuerpo-real';

/**
 * Escena 3D del probador: un maniquí con las proporciones del cliente, y la prenda dibujada
 * encima con las medidas de la talla elegida. El cuerpo y la polera son superficies continuas
 * (ver `avatar.ts`); las demás prendas se arman con figuras simples.
 *
 * Las medidas llegan en centímetros; la escena trabaja en metros. Este módulo carga three.js,
 * así que el probador lo importa solo cuando se abre.
 */

/** Prenda a dibujar: medidas de la talla en centímetros y color en hexadecimal. */
export interface PrendaEnEscena {
  tipo: TipoPrenda;
  /** Contorno de la prenda: pecho en las de arriba, cintura en pantalones. */
  contorno: number;
  /** Largo del cuerpo de la prenda, o largo de pierna en pantalones. */
  largo: number;
  color: string;
}

/** Profundidad del torso respecto de su ancho: la sección del cuerpo es una elipse. */
const PROFUNDIDAD = 0.72;
/** La prenda medida en plano cuelga más corta de lo que mide, porque rodea el cuerpo. */
const CAIDA = 0.82;
const SEGMENTOS = 48;

/** Semieje mayor de la elipse de la sección cuyo perímetro es el contorno dado (fórmula de Ramanujan). */
function semiejeDesdeContorno(contornoCm: number): number {
  const k = PROFUNDIDAD;
  const factor = Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k)));
  return contornoCm / 100 / factor;
}

const suavizar = (t: number) => t * t * (3 - 2 * t);
const mezclar = (a: number, b: number, t: number) => a + (b - a) * t;

/** Proporciones del maniquí, en metros, derivadas de las medidas del cuerpo. */
interface Esqueleto extends EsqueletoAvatar {
  yCadera: number;
  yCintura: number;
  yHombro: number;
  yCuello: number;
  semiPecho: number;
  semiCintura: number;
}

/** Grosor de brazos, piernas, cuello y hombros según la contextura. */
const GROSOR_COMPLEXION: Record<Complexion, number> = { delgada: 0.93, media: 1, robusta: 1.08 };

/** Semiejes de una sección elíptica con proporción `k` (profundidad / ancho) y el contorno dado. */
function seccionDesdeContorno(contornoCm: number, k: number, zc: number): SeccionTorso {
  const a = contornoCm / 100 / (Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k))));
  return { a, b: a * k, zc };
}

/**
 * Secciones del torso entre las alturas clave, interpoladas con curvas suaves (Hermite) y
 * guardadas en una tabla. Devuelve siempre el mismo objeto para no crear basura en los
 * millones de consultas que hace la malla: hay que leerlo de inmediato.
 */
function crearSeccionTorso(claves: (SeccionTorso & { y: number })[]): (y: number) => SeccionTorso {
  const muestras = 512;
  const y0 = claves[0]!.y;
  const y1 = claves[claves.length - 1]!.y;
  const tabla = { a: new Float32Array(muestras + 1), b: new Float32Array(muestras + 1), zc: new Float32Array(muestras + 1) };
  const componentes = ['a', 'b', 'zc'] as const;
  for (let s = 0; s <= muestras; s++) {
    const y = y0 + ((y1 - y0) * s) / muestras;
    let i = 0;
    while (i < claves.length - 2 && y > claves[i + 1]!.y) i++;
    const p0 = claves[i]!;
    const p1 = claves[i + 1]!;
    const tramoY = p1.y - p0.y;
    const t = Math.min(Math.max((y - p0.y) / tramoY, 0), 1);
    const anterior = claves[Math.max(i - 1, 0)]!;
    const siguiente = claves[Math.min(i + 2, claves.length - 1)]!;
    for (const c of componentes) {
      const m0 = ((p1[c] - anterior[c]) / (p1.y - anterior.y)) * tramoY;
      const m1 = ((siguiente[c] - p0[c]) / (siguiente.y - p0.y)) * tramoY;
      const t2 = t * t;
      const t3 = t2 * t;
      tabla[c][s] = (2 * t3 - 3 * t2 + 1) * p0[c] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1[c] + (t3 - t2) * m1;
    }
  }
  const salida: SeccionTorso = { a: 0, b: 0, zc: 0 };
  return (y: number) => {
    const f = (Math.min(Math.max((y - y0) / (y1 - y0), 0), 1) * muestras);
    const i = Math.min(Math.floor(f), muestras - 1);
    const t = f - i;
    salida.a = tabla.a[i]! + (tabla.a[i + 1]! - tabla.a[i]!) * t;
    salida.b = tabla.b[i]! + (tabla.b[i + 1]! - tabla.b[i]!) * t;
    salida.zc = tabla.zc[i]! + (tabla.zc[i + 1]! - tabla.zc[i]!) * t;
    return salida;
  };
}

function armarEsqueleto(cuerpo: MedidasCuerpo): Esqueleto {
  // La altura da la escala; el volumen sale de los contornos (los que dio el cliente o los
  // estimados desde el peso). Brazos, piernas, cuello y hombros crecen más lento que el torso,
  // para que un cuerpo de más peso no termine con extremidades exageradas.
  const h = cuerpo.altura / 100;
  const volumenPecho = cuerpo.pecho / (0.53 * cuerpo.altura);
  const volumenCadera = cuerpo.cadera / (0.54 * cuerpo.altura);
  // La contextura ya influye en los contornos estimados; aquí solo afina el grosor de los huesos.
  const grosor = Math.sqrt(GROSOR_COMPLEXION[cuerpo.complexion]);
  const semiPecho = semiejeDesdeContorno(cuerpo.pecho);
  const semiCintura = semiejeDesdeContorno(cuerpo.cintura);
  const semiCadera = semiejeDesdeContorno(cuerpo.cadera);
  const anchoHombro = Math.max(0.112 * h * volumenPecho ** 0.35 * grosor, semiPecho * 1.05);
  const radioCuello = 0.034 * h * volumenPecho ** 0.5 * grosor;

  const y = {
    entrepierna: 0.465 * h,
    cadera: 0.52 * h,
    cintura: 0.62 * h,
    pecho: 0.72 * h,
    hombro: 0.8 * h,
    cuello: 0.845 * h,
  };

  // Secciones reales del torso a partir de los contornos. La cintura se vuelve más redonda
  // (y el abdomen avanza) cuanto mayor es respecto de la altura. Pecho y cadera se achican un
  // poco porque pectorales y glúteos les suman volumen.
  const redondezCintura = 0.7 + 0.12 * Math.min(Math.max((cuerpo.cintura / cuerpo.altura - 0.45) / 0.15, 0), 1);
  const pechoReal = seccionDesdeContorno(cuerpo.pecho * 0.96, 0.7, 0.004 * h);
  const cinturaReal = seccionDesdeContorno(cuerpo.cintura, redondezCintura, 0.002 * h + (redondezCintura - 0.7) * 0.12 * h);
  const caderaReal = seccionDesdeContorno(cuerpo.cadera * 0.94, 0.74, -0.006 * h);
  const mezcla = (a: SeccionTorso, b: SeccionTorso, t: number, yy: number) => ({
    y: yy,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
    zc: a.zc + (b.zc - a.zc) * t,
  });
  const seccion = crearSeccionTorso([
    { y: 0.455 * h, a: caderaReal.a * 0.74, b: caderaReal.b * 0.78, zc: -0.005 * h },
    { y: 0.5 * h, a: caderaReal.a * 0.97, b: caderaReal.b * 0.97, zc: caderaReal.zc },
    { y: 0.53 * h, ...caderaReal },
    mezcla(caderaReal, cinturaReal, 0.55, 0.575 * h),
    { y: 0.615 * h, ...cinturaReal },
    mezcla(cinturaReal, pechoReal, 0.55, 0.665 * h),
    { y: 0.715 * h, ...pechoReal },
    { y: 0.75 * h, a: pechoReal.a * 0.99, b: pechoReal.b * 0.97, zc: 0.002 * h },
    { y: 0.785 * h, a: anchoHombro * 0.9, b: pechoReal.b * 0.82, zc: -0.002 * h },
    { y: 0.81 * h, a: anchoHombro * 0.72, b: pechoReal.b * 0.66, zc: -0.004 * h },
    // Hacia el cuello las secciones siempre se angostan: en cuellos gruesos no forman un anillo.
    { y: 0.83 * h, a: Math.min(radioCuello * 1.9, anchoHombro * 0.6), b: Math.min(radioCuello * 1.6, pechoReal.b * 0.6), zc: -0.004 * h },
    { y: 0.845 * h, a: Math.min(radioCuello * 1.15, anchoHombro * 0.5), b: Math.min(radioCuello * 1.05, pechoReal.b * 0.55), zc: -0.002 * h },
  ]);

  const radioBrazo = 0.025 * h * volumenPecho ** 0.9 * grosor;
  const radioAntebrazo = 0.019 * h * volumenPecho ** 0.7 * grosor;
  const radioMuslo = 0.044 * h * volumenCadera * grosor;
  const hombroX = Math.max(anchoHombro, semiPecho) + radioBrazo * 0.35;
  const yArticulacionHombro = 0.79 * h;
  // El brazo se abre lo justo para no atravesar la cadera, con un mínimo de 6 grados.
  const despeje = (semiCadera + 0.01 + radioBrazo - hombroX) / (yArticulacionHombro - y.cadera);
  const angulo = Math.max(Math.atan(despeje), (6 * Math.PI) / 180);

  return {
    alto: h,
    seccion,
    yTorsoInferior: 0.455 * h,
    yTorsoSuperior: 0.845 * h,
    pecho: pechoReal,
    cadera: caderaReal,
    yEntrepierna: y.entrepierna,
    yCadera: y.cadera,
    yCintura: y.cintura,
    yPecho: y.pecho,
    yHombro: y.hombro,
    yCuello: y.cuello,
    semiPecho,
    semiCintura,
    radioCuello,
    hombro: new THREE.Vector3(hombroX, yArticulacionHombro, 0),
    direccionBrazo: new THREE.Vector3(Math.sin(angulo), -Math.cos(angulo), 0),
    largoBrazo: 0.186 * h,
    largoAntebrazo: 0.146 * h,
    radioBrazo,
    radioAntebrazo,
    piernaX: Math.max(semiCadera * 0.48, radioMuslo * 0.92),
    radioMuslo,
    radioRodilla: radioMuslo * 0.6,
    radioTobillo: 0.013 * h * volumenCadera ** 0.5 * grosor,
  };
}

/**
 * Radio del cuerpo a una altura, para las prendas armadas con figuras de sección `PROFUNDIDAD`:
 * el menor que contiene la sección real del torso (con un margen por pectorales y glúteos) o,
 * bajo la entrepierna, el borde exterior de las piernas.
 */
function radioCuerpo(esqueleto: Esqueleto, y: number): number {
  if (y <= esqueleto.yEntrepierna) return esqueleto.piernaX + esqueleto.radioMuslo;
  const { a, b, zc } = esqueleto.seccion(y);
  // Los glúteos sobresalen de la sección del torso: atrás y a los costados.
  const gluteos = alcanceGluteos(esqueleto, y);
  return Math.max(a, gluteos.costado, (Math.max(b + Math.abs(zc), gluteos.atras)) / PROFUNDIDAD) * 1.05;
}

/** Cilindro, abierto o cerrado, que va de `a` a `b` con radio `radioA` en `a` y `radioB` en `b`. */
function tramo(a: THREE.Vector3, b: THREE.Vector3, radioA: number, radioB: number, material: THREE.Material, abierto = false): THREE.Mesh {
  const direccion = new THREE.Vector3().subVectors(b, a);
  const largo = direccion.length();
  // El extremo superior del cilindro (+Y) queda en `b`.
  const malla = new THREE.Mesh(new THREE.CylinderGeometry(radioB, radioA, largo, 28, 1, abierto), material);
  malla.position.copy(a).addScaledVector(direccion, 0.5);
  malla.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direccion.normalize());
  return malla;
}

function esfera(centro: THREE.Vector3, radio: number, material: THREE.Material): THREE.Mesh {
  const malla = new THREE.Mesh(new THREE.SphereGeometry(radio, 24, 16), material);
  malla.position.copy(centro);
  return malla;
}

/** Superficie de revolución con sección elíptica, como el torso. */
function revolucion(perfil: THREE.Vector2[], material: THREE.Material): THREE.Mesh {
  const malla = new THREE.Mesh(new THREE.LatheGeometry(perfil, SEGMENTOS), material);
  malla.scale.z = PROFUNDIDAD;
  return malla;
}

/** Puntos del brazo de un lado (1 derecho, -1 izquierdo): hombro, codo y muñeca. */
function puntosBrazo(esqueleto: Esqueleto, lado: 1 | -1) {
  const hombro = esqueleto.hombro.clone().setX(esqueleto.hombro.x * lado);
  const direccion = esqueleto.direccionBrazo.clone().setX(esqueleto.direccionBrazo.x * lado);
  const codo = hombro.clone().addScaledVector(direccion, esqueleto.largoBrazo);
  const muneca = codo.clone().addScaledVector(direccion, esqueleto.largoAntebrazo);
  return { hombro, codo, muneca, direccion };
}

/** El maniquí: un solo cuerpo continuo con las proporciones del esqueleto (ver `avatar.ts`). */
function armarManiqui(esqueleto: Esqueleto): THREE.Group {
  const grupo = new THREE.Group();
  grupo.add(crearCuerpo(esqueleto));
  return grupo;
}

function armarParteSuperior(esqueleto: Esqueleto, prenda: PrendaEnEscena, tela: THREE.MeshStandardMaterial): THREE.Group {
  const grupo = new THREE.Group();
  const h = esqueleto.alto;
  const semiPrenda = semiejeDesdeContorno(prenda.contorno);
  const yEscote = 0.838 * h;
  const yBasta = yEscote - (prenda.largo / 100) * CAIDA;
  const esPoleron = prenda.tipo === 'poleron';

  // El radio de la prenda nunca baja del cuerpo: una talla chica se ve ceñida, no atravesada.
  const perfil: THREE.Vector2[] = [];
  const pasos = 40;
  for (let i = 0; i <= pasos; i++) {
    const y = mezclar(yBasta, yEscote, i / pasos);
    let radio: number;
    if (y <= esqueleto.yPecho) {
      const t = (y - yBasta) / (esqueleto.yPecho - yBasta || 1);
      radio = semiPrenda * mezclar(esPoleron ? 0.9 : 0.97, 1, suavizar(Math.min(Math.max(t, 0), 1)));
    } else {
      const t = (y - esqueleto.yPecho) / (yEscote - esqueleto.yPecho);
      radio = mezclar(semiPrenda, radioCuerpo(esqueleto, y) * 1.05 + 0.005, suavizar(t));
    }
    radio = Math.max(radio, radioCuerpo(esqueleto, y) * 1.02 + 0.004);
    perfil.push(new THREE.Vector2(radio, y));
  }
  perfil.push(new THREE.Vector2(esqueleto.radioCuello * 1.25, yEscote + 0.004 * h));
  grupo.add(revolucion(perfil, tela));

  // Mangas: cortas en la polera, hasta la muñeca en polerón y chaqueta.
  const holgura = Math.max(semiPrenda - esqueleto.semiPecho, 0) * 0.5 + 0.008;
  for (const lado of [1, -1] as const) {
    const { hombro, codo, muneca, direccion } = puntosBrazo(esqueleto, lado);
    const inicio = hombro.clone().addScaledVector(direccion, -0.02 * h);
    if (prenda.tipo === 'polera') {
      const fin = hombro.clone().addScaledVector(direccion, esqueleto.largoBrazo * 0.5);
      grupo.add(tramo(inicio, fin, esqueleto.radioBrazo + holgura + 0.02, esqueleto.radioBrazo + holgura, tela, true));
    } else {
      const radioCodo = esqueleto.radioAntebrazo + holgura * 0.8 + 0.006;
      grupo.add(esfera(hombro, esqueleto.radioBrazo + holgura + 0.012, tela));
      grupo.add(tramo(inicio, codo, esqueleto.radioBrazo + holgura + 0.012, radioCodo, tela, true));
      grupo.add(esfera(codo, radioCodo, tela));
      grupo.add(tramo(codo, muneca, radioCodo, esqueleto.radioAntebrazo * 0.7 + 0.008, tela, true));
      if (esPoleron) {
        const puno = new THREE.Mesh(new THREE.TorusGeometry(esqueleto.radioAntebrazo * 0.7 + 0.008, 0.006, 8, 24), tela);
        puno.position.copy(muneca);
        puno.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direccion);
        grupo.add(puno);
      }
    }
  }

  if (esPoleron) {
    // Capucha recogida en la espalda y bolsillo canguro.
    const capucha = new THREE.Mesh(new THREE.TorusGeometry(esqueleto.radioCuello * 2.1, 0.022 * h, 12, 32, Math.PI * 1.25), tela);
    // El arco del toro se gira para quedar centrado atrás del cuello.
    capucha.rotation.set(Math.PI / 2, 0, Math.PI * 0.875);
    capucha.position.set(0, yEscote - 0.008 * h, -0.012 * h);
    grupo.add(capucha);
    const yBolsillo = mezclar(yBasta, esqueleto.yCintura, 0.55);
    const bolsillo = new THREE.Mesh(new THREE.BoxGeometry(semiPrenda * 1.1, 0.075 * h, 0.01), tela);
    bolsillo.position.set(0, yBolsillo, radioCuerpoPrenda(perfil, yBolsillo) * PROFUNDIDAD + 0.003);
    grupo.add(bolsillo);
  }

  if (prenda.tipo === 'chaqueta') {
    // Cuello levantado y cierre metálico.
    const cuello = new THREE.Mesh(new THREE.TorusGeometry(esqueleto.radioCuello * 1.55, 0.012 * h, 10, 32), tela);
    cuello.rotation.x = Math.PI / 2;
    cuello.scale.y = PROFUNDIDAD;
    cuello.position.y = yEscote;
    grupo.add(cuello);
    const metal = new THREE.MeshStandardMaterial({ color: '#b8b8c0', metalness: 0.9, roughness: 0.3 });
    for (let i = 0; i <= 12; i++) {
      const y = mezclar(yBasta + 0.01, esqueleto.yPecho + 0.04 * h, i / 12);
      const diente = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.004), metal);
      diente.position.set(0, y, radioCuerpoPrenda(perfil, y) * PROFUNDIDAD + 0.001);
      grupo.add(diente);
    }
  }
  return grupo;
}

/** Radio de la prenda a una altura, leído de su propio perfil. */
function radioCuerpoPrenda(perfil: THREE.Vector2[], y: number): number {
  for (let i = 1; i < perfil.length; i++) {
    if (y <= perfil[i]!.y) {
      const anterior = perfil[i - 1]!;
      const t = (y - anterior.y) / (perfil[i]!.y - anterior.y || 1);
      return mezclar(anterior.x, perfil[i]!.x, t);
    }
  }
  return perfil[perfil.length - 1]!.x;
}

function armarPantalon(esqueleto: Esqueleto, prenda: PrendaEnEscena, tela: THREE.MeshStandardMaterial): THREE.Group {
  const grupo = new THREE.Group();
  const h = esqueleto.alto;
  const semiPretina = semiejeDesdeContorno(prenda.contorno);
  const holgura = Math.max(semiPretina - esqueleto.semiCintura, 0);
  const yPretina = 0.6 * h;
  // La parte de la cadera termina en la entrepierna; de ahí para abajo siguen las piernas.
  const yInicio = esqueleto.yEntrepierna + 0.005 * h;

  // El primer punto, en el eje, cierra el tiro entre las piernas.
  const perfil: THREE.Vector2[] = [new THREE.Vector2(0.001, esqueleto.yEntrepierna - 0.025 * h)];
  const pasos = 16;
  for (let i = 0; i <= pasos; i++) {
    const y = mezclar(yInicio, yPretina, i / pasos);
    const ajustado = radioCuerpo(esqueleto, y) * 1.03 + 0.006;
    perfil.push(new THREE.Vector2(i === pasos ? Math.max(semiPretina, ajustado) : ajustado + holgura * 0.8, y));
  }
  grupo.add(revolucion(perfil, tela));
  const pretina = new THREE.Mesh(new THREE.TorusGeometry(perfil[perfil.length - 1]!.x, 0.006, 8, SEGMENTOS), tela);
  pretina.rotation.x = Math.PI / 2;
  pretina.scale.y = PROFUNDIDAD;
  pretina.position.y = yPretina;
  grupo.add(pretina);

  // El largo de pierna es fijo: en alguien alto deja ver el tobillo, en alguien bajo llega al suelo.
  const yBasta = Math.max(esqueleto.yEntrepierna - prenda.largo / 100, 0.012);
  const radioBasta = Math.max(esqueleto.radioTobillo * 1.6, 0.03 * h) + holgura * 0.3;
  for (const lado of [1, -1] as const) {
    const arriba = new THREE.Vector3(esqueleto.piernaX * lado, 0.5 * h, 0);
    const abajo = new THREE.Vector3(esqueleto.piernaX * lado * 0.88, yBasta, 0);
    grupo.add(esfera(arriba, esqueleto.radioMuslo * 1.06 + 0.006 + holgura * 0.5, tela));
    grupo.add(tramo(arriba, abajo, esqueleto.radioMuslo * 1.06 + 0.006 + holgura * 0.5, radioBasta, tela, true));
  }
  return grupo;
}

function armarCinturon(esqueleto: Esqueleto, tela: THREE.MeshStandardMaterial): THREE.Group {
  const grupo = new THREE.Group();
  const h = esqueleto.alto;
  const y = 0.585 * h;
  const radio = radioCuerpo(esqueleto, y) * 1.03 + 0.006;
  const correa = new THREE.Mesh(new THREE.CylinderGeometry(radio, radio, 0.035, SEGMENTOS, 1, true), tela);
  correa.position.y = y;
  correa.scale.z = PROFUNDIDAD;
  grupo.add(correa);
  const metal = new THREE.MeshStandardMaterial({ color: '#c9c9d1', metalness: 0.95, roughness: 0.25 });
  const hebilla = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.01), metal);
  hebilla.position.set(0, y, radio * PROFUNDIDAD + 0.004);
  grupo.add(hebilla);
  // Tachas a lo largo de la correa.
  for (let i = 1; i < 18; i++) {
    const angulo = (i / 18) * Math.PI * 2;
    const tacha = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), metal);
    tacha.position.set(Math.sin(angulo) * radio * 1.01, y, Math.cos(angulo) * radio * PROFUNDIDAD * 1.01);
    grupo.add(tacha);
  }
  return grupo;
}

function armarPrenda(esqueleto: Esqueleto, prenda: PrendaEnEscena, cuerpo: MedidasCuerpo): THREE.Group {
  if (prenda.tipo === 'polera') {
    // La polera se ajusta al cuerpo real: superficie continua con mangas, cuello y pliegues.
    const yBasta = 0.838 * esqueleto.alto - (prenda.largo / 100) * CAIDA;
    return crearPolera(esqueleto, { contorno: prenda.contorno, largo: prenda.largo, holgura: prenda.contorno - cuerpo.pecho, color: prenda.color }, yBasta);
  }
  const tela = new THREE.MeshStandardMaterial({
    color: prenda.color,
    roughness: prenda.tipo === 'chaqueta' || prenda.tipo === 'cinturon' ? 0.38 : 0.85,
    metalness: prenda.tipo === 'chaqueta' ? 0.08 : 0,
    side: THREE.DoubleSide,
  });
  switch (prenda.tipo) {
    case 'pantalon':
      return armarPantalon(esqueleto, prenda, tela);
    case 'cinturon':
      return armarCinturon(esqueleto, tela);
    default:
      return armarParteSuperior(esqueleto, prenda, tela);
  }
}

/** Libera la memoria de la tarjeta gráfica que ocupan las geometrías y materiales de un grupo. */
function liberar(objeto: THREE.Object3D): void {
  objeto.traverse((hijo) => {
    if (hijo instanceof THREE.Mesh) {
      hijo.geometry.dispose();
      const materiales: THREE.Material[] = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
      materiales.forEach((material) => material.dispose());
    }
  });
}

/** Colores neutros de la prenda que acompaña a la que se prueba. */
const COLOR_PANTALON = '#2b3346';
const COLOR_POLERA = '#8e9097';

/**
 * Prenda que acompaña a la que se prueba, para no mostrar el cuerpo a medio vestir: un pantalón
 * bajo las prendas de arriba y el cinturón, y una polera sobre el pantalón. Va en la talla que le
 * corresponde al cuerpo y en un color neutro.
 */
function complementoDe(prenda: PrendaEnEscena, cuerpo: MedidasCuerpo): PrendaEnEscena | null {
  const tipo: TipoPrenda = prenda.tipo === 'pantalon' ? 'polera' : 'pantalon';
  const medidas = medidasDeTalla(tipo, recomendarTalla(cuerpo, tipo));
  if (!medidas) return null;
  return { tipo, contorno: medidas.contornoPrenda, largo: medidas.largo, color: tipo === 'pantalon' ? COLOR_PANTALON : COLOR_POLERA };
}

export class EscenaManiqui {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(35, 1, 0.05, 30);
  private readonly controles: OrbitControls;
  private figura: THREE.Group | null = null;
  /** Maniquí ya armado y las medidas con que se armó: si solo cambia la talla, se reutiliza. */
  private maniqui: { clave: string; grupo: THREE.Group } | null = null;
  private prendaActual: THREE.Group | null = null;
  private pendiente: { cuerpo: MedidasCuerpo; prenda: PrendaEnEscena | null } | null = null;
  private temporizador: number | null = null;
  /** Número de la última reconstrucción pedida: las respuestas de cargas anteriores se ignoran. */
  private solicitud = 0;
  private encuadrada = false;
  private cuadro = 0;

  /** Falla si el navegador no tiene WebGL. */
  constructor(lienzo: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.escena.add(new THREE.HemisphereLight('#ffffff', '#2a2a2a', 1.6));
    const principal = new THREE.DirectionalLight('#ffffff', 2.2);
    principal.position.set(2, 3, 3);
    this.escena.add(principal);
    // Contraluz rojo, el acento de la tienda.
    const contraluz = new THREE.DirectionalLight('#ff4d4d', 1.2);
    contraluz.position.set(-2, 2, -3);
    this.escena.add(contraluz);
    const piso = new THREE.Mesh(new THREE.CircleGeometry(0.65, 48), new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.9 }));
    piso.rotation.x = -Math.PI / 2;
    this.escena.add(piso);

    this.controles = new OrbitControls(this.camara, lienzo);
    this.controles.enableDamping = true;
    this.controles.enablePan = false;
    this.controles.minDistance = 1;
    this.controles.maxDistance = 7;
    this.controles.maxPolarAngle = Math.PI * 0.85;
    this.controles.autoRotate = true;
    this.controles.autoRotateSpeed = 1.5;
    // El giro automático se detiene apenas el cliente toma el control.
    this.controles.addEventListener('start', () => (this.controles.autoRotate = false));

    const animar = () => {
      this.cuadro = requestAnimationFrame(animar);
      this.controles.update();
      this.renderer.render(this.escena, this.camara);
    };
    animar();
  }

  /**
   * Redibuja el maniquí con las medidas del cuerpo y, si hay, la prenda encima. Armar las
   * superficies toma unas décimas de segundo, así que los cambios seguidos (un deslizador en
   * movimiento) se juntan y se dibuja solo el último.
   */
  mostrar(cuerpo: MedidasCuerpo, prenda: PrendaEnEscena | null): void {
    this.pendiente = { cuerpo, prenda };
    if (this.temporizador !== null) return;
    this.temporizador = window.setTimeout(() => {
      this.temporizador = null;
      const pendiente = this.pendiente;
      this.pendiente = null;
      if (pendiente) this.reconstruir(pendiente.cuerpo, pendiente.prenda);
    }, 16);
  }

  /**
   * Se muestra el cuerpo realista (MakeHuman) con el modelo realista de la prenda; ambos se
   * descargan la primera vez. Si un tipo de prenda no tiene modelo realista, o si no se pueden
   * cargar, se usa el maniquí de figuras.
   */
  private reconstruir(cuerpo: MedidasCuerpo, prenda: PrendaEnEscena | null): void {
    const numero = ++this.solicitud;
    const vigente = () => numero === this.solicitud;
    cargarModeloReal(cuerpo.sexo)
      .then(async (modelo) => {
        if (!prenda) return vigente() && this.dibujarReal(modelo, cuerpo, null, null);
        if (!tieneModeloReal(modelo, prenda.tipo)) return vigente() && this.dibujarManiqui(cuerpo, prenda);
        const complemento = complementoDe(prenda, cuerpo);
        const [mallas, mallasComplemento] = await Promise.all([
          prenda.tipo === 'cinturon' ? null : cargarPrendaReal(modelo, prenda.tipo),
          complemento && tieneModeloReal(modelo, complemento.tipo) ? cargarPrendaReal(modelo, complemento.tipo).catch(() => null) : null,
        ]);
        // Si mientras cargaba llegaron otras medidas u otra talla, se dibujan esas.
        return vigente() && this.dibujarReal(modelo, cuerpo, prenda, mallas, complemento && mallasComplemento ? { prenda: complemento, mallas: mallasComplemento } : null);
      })
      .catch(() => vigente() && this.dibujarManiqui(cuerpo, prenda));
  }

  private dibujarReal(
    modelo: ModeloReal,
    cuerpo: MedidasCuerpo,
    prenda: PrendaEnEscena | null,
    mallas: Parameters<typeof crearPrendaReal>[1] | null,
    complemento: { prenda: PrendaEnEscena; mallas: Parameters<typeof crearPrendaReal>[1] } | null = null,
  ): void {
    const posiciones = posicionesCuerpo(modelo, cuerpo);
    const coberturas: Cobertura[] = [];
    const ropa = new THREE.Group();
    const puestas: { abajo: boolean; grupo: THREE.Group }[] = [];
    const vestir = (p: PrendaEnEscena, m: Parameters<typeof crearPrendaReal>[1]) => {
      const abajo = p.tipo === 'pantalon';
      // La parte de arriba va por fuera del pantalón: se saca de él además del cuerpo.
      const debajo = abajo ? [] : puestas.filter((x) => x.abajo).map((x) => x.grupo);
      const resultado = crearPrendaReal(modelo, m, cuerpo, { tipo: p.tipo, contorno: p.contorno, largo: p.largo, color: p.color }, posiciones, debajo);
      ropa.add(resultado.grupo);
      puestas.push({ abajo, grupo: resultado.grupo });
      coberturas.push(resultado.cobertura);
    };
    // Primero el pantalón (va debajo), luego la parte de arriba.
    const lista = [complemento ? { prenda: complemento.prenda, mallas: complemento.mallas } : null, prenda && mallas && prenda.tipo !== 'cinturon' ? { prenda, mallas } : null]
      .filter((x): x is { prenda: PrendaEnEscena; mallas: Parameters<typeof crearPrendaReal>[1] } => x !== null)
      .sort((a, b) => Number(b.prenda.tipo === 'pantalon') - Number(a.prenda.tipo === 'pantalon'));
    for (const { prenda: p, mallas: m } of lista) vestir(p, m);
    if (prenda?.tipo === 'cinturon') ropa.add(crearCinturonReal(posiciones, cuerpo, prenda.color));
    // La piel bajo las prendas se oculta según dónde queden: el cuerpo depende de las tallas.
    const talla = [prenda, complemento?.prenda].map((p) => (p ? `${p.tipo}:${p.contorno}:${p.largo}` : '')).join('|');
    this.cambiarFigura(`real:${JSON.stringify(cuerpo)}:${talla}`, () => crearCuerpoReal(modelo, posiciones, coberturas), () =>
      ropa.children.length ? ropa : null,
    );
    this.encuadrar(cuerpo.altura / 100);
  }

  private dibujarManiqui(cuerpo: MedidasCuerpo, prenda: PrendaEnEscena | null): void {
    const esqueleto = armarEsqueleto(cuerpo);
    this.cambiarFigura(`figuras:${JSON.stringify(cuerpo)}`, () => armarManiqui(esqueleto), () =>
      prenda ? armarPrenda(esqueleto, prenda, cuerpo) : null,
    );
    this.encuadrar(esqueleto.alto);
  }

  /** Cambia el cuerpo (solo si cambió) y la prenda, liberando los anteriores. */
  private cambiarFigura(clave: string, crearCuerpo: () => THREE.Object3D, crearPrenda: () => THREE.Object3D | null): void {
    if (!this.figura) {
      this.figura = new THREE.Group();
      this.escena.add(this.figura);
    }
    if (this.maniqui?.clave !== clave) {
      if (this.maniqui) {
        this.figura.remove(this.maniqui.grupo);
        liberar(this.maniqui.grupo);
      }
      const grupo = new THREE.Group();
      grupo.add(crearCuerpo());
      this.maniqui = { clave, grupo };
      this.figura.add(grupo);
    }
    if (this.prendaActual) {
      this.figura.remove(this.prendaActual);
      liberar(this.prendaActual);
      this.prendaActual = null;
    }
    const nueva = crearPrenda();
    if (nueva) {
      this.prendaActual = new THREE.Group();
      this.prendaActual.add(nueva);
      this.figura.add(this.prendaActual);
    }
  }

  private encuadrar(h: number): void {
    this.controles.target.set(0, h * 0.52, 0);
    if (!this.encuadrada) {
      // De frente y un poco de lado, con el cuerpo entero a la vista.
      this.camara.position.set(h * 0.55, h * 0.62, h * 1.75);
      this.encuadrada = true;
    }
  }

  redimensionar(ancho: number, alto: number): void {
    if (ancho === 0 || alto === 0) return;
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  destruir(): void {
    if (this.temporizador !== null) window.clearTimeout(this.temporizador);
    cancelAnimationFrame(this.cuadro);
    this.controles.dispose();
    liberar(this.escena);
    this.renderer.dispose();
  }
}
