"""
Cuerpo humano realista para el probador 3D, generado con MPFB (MakeHuman para Blender).

MPFB describe el cuerpo con parámetros de 0 a 1 (altura, peso, musculatura, sexo...) y con
controles de medidas (contornos de busto, cintura y cadera). Este script los ajusta para que el
cuerpo tenga la altura pedida y los contornos pedidos, medidos sobre la malla como con una
huincha. Si no se dan los contornos, se estiman desde la altura y el peso con las mismas fórmulas
que usa la tienda (`src/app/data/probador.ts`), para que el modelo y la recomendación de talla
coincidan.

Requisitos: Blender 4.2 o superior con la extensión MPFB instalada.

Uso (desde una terminal, sin abrir la interfaz):

    blender -b --python cuerpo_mpfb.py -- --altura 175 --peso 78 \
        [--pecho 100 --cintura 86 --cadera 98] [--complexion media] [--sexo 1] \
        [--render cuerpo.png] [--salida cuerpo.glb]

También se puede abrir en la pestaña Scripting de Blender y ejecutar: usa los valores de
MEDIDAS_POR_DEFECTO.
"""

import argparse
import math
import sys
import time

import bmesh
import bpy
from mathutils import Vector

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

# Densidad media del cuerpo humano, en kg/m³: solo para informar el peso del modelo.
DENSIDAD_CUERPO = 985.0

MEDIDAS_POR_DEFECTO = {"altura": 175.0, "peso": 78.0, "sexo": 1.0, "complexion": "media"}

# Las mismas de `estimarCuerpo` en la tienda.
FACTOR_COMPLEXION = {"delgada": 0.95, "media": 1.0, "robusta": 1.05}

# Controles de medidas de MakeHuman: cada uno con su versión que agranda y la que achica.
CONTROLES = {
    "pecho": "measure-bust-circ",
    "cintura": "measure-waist-circ",
    "cadera": "measure-hips-circ",
}

# Hasta dónde puede agrandar un control de medidas (1 es el tope de MakeHuman).
TOPE_CONTROL = 2.0

# Franjas de altura (fracción de la altura) donde se busca cada contorno, y si es el mayor o
# el menor de la franja, como se toma con una huincha.
FRANJAS = {
    # Bajo las axilas: más arriba el corte toma también los brazos.
    "pecho": (0.66, 0.715, max),
    "cintura": (0.58, 0.66, min),
    "cadera": (0.49, 0.56, max),
}


def leer_argumentos():
    argumentos = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    lector = argparse.ArgumentParser(description="Cuerpo MPFB con altura, peso y contornos dados")
    lector.add_argument("--altura", type=float, default=MEDIDAS_POR_DEFECTO["altura"], help="Altura en cm")
    lector.add_argument("--peso", type=float, default=MEDIDAS_POR_DEFECTO["peso"], help="Peso en kg")
    lector.add_argument("--pecho", type=float, help="Contorno de pecho en cm (si falta, se estima)")
    lector.add_argument("--cintura", type=float, help="Contorno de cintura en cm (si falta, se estima)")
    lector.add_argument("--cadera", type=float, help="Contorno de cadera en cm (si falta, se estima)")
    lector.add_argument("--complexion", choices=list(FACTOR_COMPLEXION), default=MEDIDAS_POR_DEFECTO["complexion"])
    lector.add_argument("--sexo", type=float, default=MEDIDAS_POR_DEFECTO["sexo"], help="0 femenino, 1 masculino")
    lector.add_argument("--render", help="Imagen PNG de revisión")
    lector.add_argument("--salida", help="Archivo .glb para la tienda")
    return lector.parse_args(argumentos)


def estimar_contornos(altura, peso, complexion, pecho=None, cintura=None, cadera=None):
    """Como `estimarCuerpo` de la tienda: usa los contornos dados y estima los que faltan."""
    imc = peso / (altura / 100) ** 2
    relacion = imc / 22
    factor = FACTOR_COMPLEXION[complexion]
    return {
        "pecho": pecho or 0.53 * altura * relacion ** 0.45 * factor,
        "cintura": cintura or 0.45 * altura * relacion ** 0.75 * factor,
        "cadera": cadera or 0.54 * altura * relacion ** 0.45 * factor,
    }, imc


# ---------------------------------------------------------------------------------------------
# Medición sobre la malla
# ---------------------------------------------------------------------------------------------

def malla_evaluada(cuerpo):
    """Copia de la malla con modificadores y formas aplicados (sin los ayudantes de MPFB)."""
    # Sin esto, un objeto recién creado o editado se mediría con su forma anterior.
    bpy.context.view_layer.update()
    grafo = bpy.context.evaluated_depsgraph_get()
    evaluado = cuerpo.evaluated_get(grafo)
    malla = evaluado.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(malla)
    bm.transform(evaluado.matrix_world)
    evaluado.to_mesh_clear()
    return bm


def altura_de(cuerpo):
    bm = malla_evaluada(cuerpo)
    alturas = [v.co.z for v in bm.verts]
    bm.free()
    return max(alturas) - min(alturas)


def envolvente(puntos):
    """Perímetro de la envolvente convexa de puntos 2D: lo que mide una huincha."""
    puntos = sorted(set(puntos))
    if len(puntos) < 3:
        return 0.0

    def giro(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    abajo, arriba = [], []
    for p in puntos:
        while len(abajo) >= 2 and giro(abajo[-2], abajo[-1], p) <= 0:
            abajo.pop()
        abajo.append(p)
    for p in reversed(puntos):
        while len(arriba) >= 2 and giro(arriba[-2], arriba[-1], p) <= 0:
            arriba.pop()
        arriba.append(p)
    casco = abajo[:-1] + arriba[:-1]
    return sum(math.dist(casco[i], casco[(i + 1) % len(casco)]) for i in range(len(casco)))


def contorno_torso(bm, z):
    """Contorno (m) del torso a la altura z: el corte que rodea el centro, sin los brazos."""
    copia = bm.copy()
    corte = bmesh.ops.bisect_plane(copia, geom=copia.verts[:] + copia.edges[:] + copia.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    aristas = [e for e in corte["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    # Agrupa el corte en lazos conectados y se queda con el que encierra el eje del cuerpo.
    padre = {}

    def raiz(v):
        while padre.get(v, v) != v:
            v = padre[v]
        return v

    for arista in aristas:
        a, b = (raiz(v.index) for v in arista.verts)
        padre[a] = b
    grupos = {}
    for arista in aristas:
        for v in arista.verts:
            grupos.setdefault(raiz(v.index), set()).add((round(v.co.x, 5), round(v.co.y, 5)))
    copia.free()
    mejor = 0.0
    for puntos in grupos.values():
        xs = [p[0] for p in puntos]
        if min(xs) < 0 < max(xs):
            mejor = max(mejor, envolvente(list(puntos)))
    return mejor


def medir_contorno(cuerpo, medida, altura_m):
    desde, hasta, elegir = FRANJAS[medida]
    bm = malla_evaluada(cuerpo)
    piso = min(v.co.z for v in bm.verts)
    valores = [contorno_torso(bm, piso + altura_m * (desde + (hasta - desde) * i / 8)) for i in range(9)]
    bm.free()
    return elegir(v for v in valores if v > 0) * 100


def peso_de(cuerpo):
    """Peso estimado del modelo (kg) con su volumen, con las aberturas (ojos, boca) cerradas."""
    bm = malla_evaluada(cuerpo)
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
    volumen = bm.calc_volume(signed=False)
    bm.free()
    return volumen * DENSIDAD_CUERPO


# ---------------------------------------------------------------------------------------------
# Ajuste
# ---------------------------------------------------------------------------------------------

def biseccion(funcion, objetivo, bajo, alto, pasos=12):
    """Valor entre `bajo` y `alto` con el que `funcion` (creciente) llega a `objetivo`."""
    for _ in range(pasos):
        medio = (bajo + alto) / 2
        if funcion(medio) < objetivo:
            bajo = medio
        else:
            alto = medio
    return (bajo + alto) / 2


def crear_con_altura(macro, altura_cm):
    """Crea el cuerpo y ajusta el parámetro de altura de MPFB hasta que mida `altura_cm`."""

    def probar(valor):
        prueba = dict(macro, height=valor)
        cuerpo = HumanService.create_human(macro_detail_dict=prueba)
        alto = altura_de(cuerpo)
        bpy.data.objects.remove(cuerpo)
        return alto * 100

    macro["height"] = biseccion(probar, altura_cm, 0.0, 1.0, pasos=14)
    return HumanService.create_human(macro_detail_dict=macro)


def preparar_control(cuerpo, nombre):
    """Carga las dos formas de un control (agranda y achica) y devuelve cómo moverlo de -1 a 1."""
    formas = {}
    for sentido in ("incr", "decr"):
        ruta = TargetService.target_full_path(f"{nombre}-{sentido}")
        TargetService.load_target(cuerpo, ruta, weight=0.0, name=f"{nombre}-{sentido}")
        formas[sentido] = cuerpo.data.shape_keys.key_blocks[f"{nombre}-{sentido}"]
        # Los cuerpos de mucho peso necesitan ir más allá del tope de MakeHuman: se extrapola.
        formas[sentido].slider_max = TOPE_CONTROL

    def mover(valor):
        formas["incr"].value = max(valor, 0.0)
        formas["decr"].value = max(-valor, 0.0)

    return mover


def ajustar_contornos(cuerpo, objetivos, altura_m):
    controles = {medida: preparar_control(cuerpo, CONTROLES[medida]) for medida in objetivos}
    # Los contornos se influyen entre sí (la cadera mueve la cintura): se ajustan por turnos.
    valores = {medida: 0.0 for medida in objetivos}
    for _ in range(2):
        for medida, objetivo in objetivos.items():
            def probar(valor):
                controles[medida](valor)
                return medir_contorno(cuerpo, medida, altura_m)

            valores[medida] = biseccion(probar, objetivo, -1.0, TOPE_CONTROL)
            controles[medida](valores[medida])
    return valores


# ---------------------------------------------------------------------------------------------
# Revisión y salida
# ---------------------------------------------------------------------------------------------

def preparar_escena(cuerpo, ruta):
    escena = bpy.context.scene
    motores = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    escena.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in motores else "BLENDER_EEVEE"
    escena.render.resolution_x = 900
    escena.render.resolution_y = 1200
    escena.render.filepath = ruta
    escena.view_settings.view_transform = "AgX"

    # Maniquí de vitrina: material mate claro, suavizado con una subdivisión.
    material = bpy.data.materials.new("Maniqui")
    material.use_nodes = True
    principal = material.node_tree.nodes.get("Principled BSDF")
    principal.inputs["Base Color"].default_value = (0.55, 0.5, 0.46, 1)
    principal.inputs["Roughness"].default_value = 0.6
    cuerpo.data.materials.clear()
    cuerpo.data.materials.append(material)
    cuerpo.modifiers.new("Suavizado", "SUBSURF").levels = 1
    for poligono in cuerpo.data.polygons:
        poligono.use_smooth = True

    mundo = bpy.data.worlds.new("Fondo")
    mundo.use_nodes = True
    mundo.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.025, 1)
    escena.world = mundo

    alto = max((cuerpo.matrix_world @ Vector(c)).z for c in cuerpo.bound_box)
    centro = Vector((0, 0, alto * 0.52))
    for nombre, energia, posicion in (("Principal", 250, (2.0, -3.0, 3.0)), ("Relleno", 80, (-3.0, -2.0, 1.8)), ("Contraluz", 150, (0.5, 3.0, 2.8))):
        luz = bpy.data.lights.new(nombre, "AREA")
        luz.energy = energia
        luz.size = 2.0
        objeto = bpy.data.objects.new(nombre, luz)
        objeto.location = posicion
        objeto.rotation_euler = (centro - Vector(posicion)).to_track_quat("-Z", "Y").to_euler()
        escena.collection.objects.link(objeto)

    camara = bpy.data.cameras.new("Camara")
    camara.lens = 70
    objeto_camara = bpy.data.objects.new("Camara", camara)
    objeto_camara.location = (1.2, -4.4, alto * 0.55)
    objeto_camara.rotation_euler = (centro - objeto_camara.location).to_track_quat("-Z", "Y").to_euler()
    escena.collection.objects.link(objeto_camara)
    escena.camera = objeto_camara


def main():
    args = leer_argumentos()
    inicio = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    objetivos, imc = estimar_contornos(args.altura, args.peso, args.complexion, args.pecho, args.cintura, args.cadera)

    # El parámetro de peso de MPFB da el relleno general del cuerpo según el IMC; luego los
    # contornos fijan sus medidas.
    macro = TargetService.get_default_macro_info_dict()
    macro.update({"gender": args.sexo, "weight": min(max((imc - 17) / 14, 0.0), 1.0)})
    cuerpo = crear_con_altura(macro, args.altura)
    cuerpo.name = "Cuerpo"
    altura_m = altura_de(cuerpo)
    controles = ajustar_contornos(cuerpo, objetivos, altura_m)

    medidas = {m: medir_contorno(cuerpo, m, altura_m) for m in objetivos}
    print(f"CUERPO altura={altura_m * 100:.1f} cm (pedida {args.altura:.0f})  peso del modelo≈{peso_de(cuerpo):.1f} kg (pedido {args.peso:.0f})")
    for medida in objetivos:
        print(f"CUERPO {medida}: {medidas[medida]:.1f} cm (objetivo {objetivos[medida]:.1f}, control {controles[medida]:+.2f})")
    print(f"CUERPO listo en {time.time() - inicio:.1f} s")

    if args.salida:
        bpy.ops.export_scene.gltf(filepath=args.salida, export_format="GLB", use_selection=False, export_apply=True)
        print(f"GLB {args.salida}")

    if args.render:
        preparar_escena(cuerpo, args.render)
        bpy.ops.render.render(write_still=True)
        print(f"RENDER {args.render}")


# Al importarlo desde otro script (exportar_probador.py) no se ejecuta.
if __name__ == "__main__":
    main()
