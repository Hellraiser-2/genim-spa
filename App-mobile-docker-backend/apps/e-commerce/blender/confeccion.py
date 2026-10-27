"""
Detalles de confección de las prendas de punto (polera y polerón), hechos en el modelo.

1. Mapa de relieve: sobre los pliegues del conjunto de MakeHuman se suman el tejido de punto
   jersey, el cuello acanalado, los dobladillos con doble costura (o los puños y la basta
   acanalados del polerón) y los pespuntes de las costuras. Se dibuja en el espacio del mapa (UV)
   a partir de la malla: los bordes abiertos son el cuello, las mangas y la basta; las aristas
   donde el mapa se corta son las costuras.

2. Geometría: cada borde abierto deja de ser un canto plano. Se le da un canto redondeado de
   2,5 mm y la tela vuelta hacia adentro (el dobladillo o la franja acanalada), igual en todas las
   deformaciones de la prenda, para que en la tienda calce con cualquier cuerpo.

Se usa desde `exportar_probador.py` con `confeccionar(prenda, tipo, conjunto)`.
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

# Terminación de cada tipo de prenda, en metros: ancho del cuello acanalado, ancho del acanalado
# de mangas y basta (None = dobladillo con doble costura) y largo de la tela vuelta hacia adentro
# en la geometría (en el polerón, solo el canto: el puño acanalado ya es un tubo ceñido).
TERMINACIONES = {
    "polera": {"cuello": 0.018, "acanalado": None, "vuelta": 0.025},
    "poleron": {"cuello": 0.022, "acanalado": 0.06, "vuelta": 0.01},
}
GROSOR = 0.0025
# Lado del mapa de relieve con los detalles: los canales del acanalado (3 mm) miden unos 3 px.
LADO = 2048
# Inclinación de la superficie en las paredes de un canal o una costura (0 plano, 1 vertical).
INCLINACION = 0.55
# Tejido jersey: puntos por mosaico y ancho de cada punto en la tela (m).
PUNTOS_ANCHO = 8
PUNTOS_ALTO = 10
PUNTO = 0.003
INTENSIDAD_PUNTO = 0.5


# ---------------------------------------------------------------------------------------------
# Mapa de relieve
# ---------------------------------------------------------------------------------------------

def leer_imagen(imagen):
    ancho, alto = imagen.size
    pixeles = np.empty(ancho * alto * 4, dtype=np.float32)
    imagen.pixels.foreach_get(pixeles)
    return pixeles.reshape(alto, ancho, 4)


def mosaico_punto(ancho_px, alto_px):
    """Relieve del tejido jersey (normales en -1..1): columnas de puntos en V, cada uno con dos patas."""
    w = ancho_px / PUNTOS_ANCHO
    h = alto_px / PUNTOS_ALTO
    y, x = np.mgrid[0:alto_px, 0:ancho_px].astype(np.float32) + 0.5
    columna = np.floor(x / w)
    fila = np.floor(y / h)
    altura = np.zeros_like(x)
    for dc in (-1, 0, 1):
        for df in (-1, 0, 1):
            cx = (columna + dc + 0.5) * w
            cy = (fila + df + 0.5) * h
            for lado in (-1, 1):
                px = x - (cx + lado * w * 0.22)
                py = y - cy
                angulo = lado * 0.5
                u = (px * math.cos(angulo) - py * math.sin(angulo)) / (w * 0.2)
                v = (px * math.sin(angulo) + py * math.cos(angulo)) / (h * 0.62)
                altura = np.maximum(altura, np.maximum(1 - u * u - v * v, 0))
    altura = np.sqrt(altura)
    dx = (np.roll(altura, -1, axis=1) - np.roll(altura, 1, axis=1)) * 1.6
    dy = (np.roll(altura, -1, axis=0) - np.roll(altura, 1, axis=0)) * 1.6
    normal = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
    return normal / np.linalg.norm(normal, axis=-1, keepdims=True)


def color_inclinado(direccion, cuanto):
    """Normal (0..1) de una superficie inclinada hacia `direccion` (unitaria, en el mapa)."""
    nx, ny = direccion[0] * cuanto, direccion[1] * cuanto
    nz = math.sqrt(max(1 - nx * nx - ny * ny, 0))
    return np.array([nx, ny, nz], dtype=np.float32) * 0.5 + 0.5


def trazo(imagen, a, b, ancho, color, guion=None):
    """Segmento de `ancho` px de a a b; con `guion` (largo, espacio) en px, punteado."""
    alto_img, ancho_img = imagen.shape[:2]
    margen = ancho / 2 + 1
    x0 = int(max(min(a[0], b[0]) - margen, 0))
    x1 = int(min(max(a[0], b[0]) + margen, ancho_img - 1))
    y0 = int(max(min(a[1], b[1]) - margen, 0))
    y1 = int(min(max(a[1], b[1]) + margen, alto_img - 1))
    if x1 < x0 or y1 < y0:
        return
    y, x = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32) + 0.5
    d = np.array(b, dtype=np.float32) - np.array(a, dtype=np.float32)
    largo = float(np.hypot(*d))
    if largo < 1e-6:
        return
    u = d / largo
    t = (x - a[0]) * u[0] + (y - a[1]) * u[1]
    distancia = np.abs((x - a[0]) * -u[1] + (y - a[1]) * u[0])
    mascara = (distancia <= ancho / 2) & (t >= 0) & (t <= largo)
    if guion:
        mascara &= np.mod(t, guion[0] + guion[1]) < guion[0]
    imagen[y0:y1 + 1, x0:x1 + 1, :3][mascara] = color


def canal(imagen, borde, distancia, ancho, guion=None):
    """Canal o costura paralela al borde, a `distancia` m del canto: dos paredes inclinadas."""
    a, b, adentro, px_m = borde["a"], borde["b"], borde["adentro"], borde["px_m"]
    for lado in (-1, 1):
        desplazamiento = adentro * (distancia + lado * ancho / 4) * px_m
        trazo(imagen, a + desplazamiento, b + desplazamiento, max(ancho / 2 * px_m, 1.0),
              color_inclinado(adentro * lado, INCLINACION),
              guion=tuple(g * px_m for g in guion) if guion else None)


def acanalado(imagen, borde, ancho):
    """Canales perpendiculares al borde, cada 3 mm, en una franja de `ancho` m."""
    a, b, adentro, px_m = borde["a"], borde["b"], borde["adentro"], borde["px_m"]
    largo = float(np.hypot(*(b - a)))
    if largo < 1e-6:
        return
    direccion = (b - a) / largo
    paso = 0.003 * px_m
    if paso < 1.5:
        return
    t = paso / 2
    while t < largo:
        base = a + direccion * t
        desde = base + adentro * 0.0015 * px_m
        hasta = base + adentro * (ancho - 0.0015) * px_m
        for lado in (-1, 1):
            corrimiento = direccion * lado * paso / 6
            trazo(imagen, desde + corrimiento, hasta + corrimiento, max(paso / 4, 1.0),
                  color_inclinado(direccion * lado, INCLINACION * 0.8))
        t += paso
    canal(imagen, borde, ancho, 0.0025)


def dobladillo(imagen, borde, vuelta):
    """El canto doblado, el borde de la tela vuelta y la doble costura."""
    canal(imagen, borde, 0.0015, 0.003)
    canal(imagen, borde, vuelta - 0.001, 0.005)
    canal(imagen, borde, vuelta * 0.52, 0.0012, (0.0025, 0.001))
    canal(imagen, borde, vuelta * 0.76, 0.0012, (0.0025, 0.001))


def bordes_en_mapa(bm, uv, lado, principal, tipo_de_abertura):
    """
    Aberturas (cuello, mangas, basta) y costuras de la tela principal, en píxeles del mapa: cada
    una con el lado de adentro de su cara y los píxeles por metro de tela.
    """
    resultado = []
    for arista in bm.edges:
        caras = [c for c in arista.link_faces if c.material_index == principal]
        if not caras:
            continue
        v1, v2 = arista.verts
        largo = (v1.co - v2.co).length
        if largo < 1e-6:
            continue
        uvs = []
        for cara in caras:
            mapa = {bucle.vert: Vector(bucle[uv].uv) for bucle in cara.loops}
            uvs.append((cara, mapa[v1], mapa[v2]))
        if len(caras) == 1 and arista.is_boundary:
            tipo = tipo_de_abertura((v1.co + v2.co) / 2)
        elif len(caras) == 2 and ((uvs[0][1] - uvs[1][1]).length > 1e-5 or (uvs[0][2] - uvs[1][2]).length > 1e-5):
            tipo = "costura"
        else:
            continue
        for cara, a, b in uvs:
            a_px = np.array(a, dtype=np.float32) * lado
            b_px = np.array(b, dtype=np.float32) * lado
            centro = sum((Vector(bucle[uv].uv) for bucle in cara.loops), Vector((0, 0))) / len(cara.loops)
            centro_px = np.array(centro, dtype=np.float32) * lado
            direccion = b_px - a_px
            largo_px = float(np.hypot(*direccion))
            if largo_px < 1e-6:
                continue
            direccion /= largo_px
            adentro = np.array([-direccion[1], direccion[0]], dtype=np.float32)
            if np.dot(centro_px - a_px, adentro) < 0:
                adentro = -adentro
            resultado.append({"a": a_px, "b": b_px, "adentro": adentro, "px_m": largo_px / largo, "tipo": tipo})
    return resultado


def metros_por_unidad_uv(bm, uv, principal):
    """Cuántos metros de tela cubre una unidad del mapa (raíz de la razón de áreas)."""
    area, area_uv = 0.0, 0.0
    for cara in bm.faces:
        if cara.material_index != principal:
            continue
        area += cara.calc_area()
        puntos = [bucle[uv].uv for bucle in cara.loops]
        for i in range(1, len(puntos) - 1):
            u1, u2 = puntos[i] - puntos[0], puntos[i + 1] - puntos[0]
            area_uv += abs(u1.x * u2.y - u1.y * u2.x) / 2
    return math.sqrt(area / area_uv) if area_uv > 0 else 0.0


def mapa_de_relieve(objeto, tipo, ruta_original, tipo_de_abertura, principal=0):
    """Imagen nueva con los pliegues originales, el tejido y los detalles de confección."""
    original = bpy.data.images.load(ruta_original, check_existing=False)
    original.colorspace_settings.name = "Non-Color"
    # Algunos conjuntos traen el relieve en 4096 px: para la web basta con LADO.
    if original.size[0] > LADO:
        original.scale(LADO, LADO)
    pixeles = leer_imagen(original)
    alto, ancho = pixeles.shape[:2]
    normal = pixeles[..., :3] * 2 - 1

    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    uv = bm.loops.layers.uv.active

    # Tejido jersey: un mosaico que se repite, del tamaño que tiene en la tela.
    metros = metros_por_unidad_uv(bm, uv, principal)
    if metros > 0:
        mosaico_px = max(int(round(ancho * PUNTOS_ANCHO * PUNTO / metros)), PUNTOS_ANCHO * 2)
        alto_mosaico = max(int(round(mosaico_px * PUNTOS_ALTO / PUNTOS_ANCHO * 0.8)), PUNTOS_ALTO * 2)
        punto = mosaico_punto(mosaico_px, alto_mosaico)
        punto = np.tile(punto, (alto // alto_mosaico + 1, ancho // mosaico_px + 1, 1))[:alto, :ancho]
        # Mezcla "whiteout": se suman las inclinaciones y se multiplican las alturas.
        normal = np.concatenate([normal[..., :2] + punto[..., :2] * INTENSIDAD_PUNTO, normal[..., 2:] * punto[..., 2:]], axis=-1)
        normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    pixeles[..., :3] = normal * 0.5 + 0.5

    terminacion = TERMINACIONES[tipo]
    cuenta = {}
    for borde in bordes_en_mapa(bm, uv, ancho, principal, tipo_de_abertura):
        cuenta[borde["tipo"]] = cuenta.get(borde["tipo"], 0) + 1
        if borde["tipo"] == "cuello":
            acanalado(pixeles, borde, terminacion["cuello"])
        elif borde["tipo"] in ("manga", "basta"):
            if terminacion["acanalado"] is None:
                dobladillo(pixeles, borde, terminacion["vuelta"])
            else:
                acanalado(pixeles, borde, terminacion["acanalado"])
        else:
            canal(pixeles, borde, 0.0005, 0.002)
            canal(pixeles, borde, 0.005, 0.001, (0.0025, 0.001))
    bm.free()
    print(f"CONFECCION {objeto.name}: mapa {ancho}px, {metros:.2f} m por unidad, bordes {cuenta}")

    imagen = bpy.data.images.new(f"{objeto.name}_relieve", ancho, alto, alpha=False)
    imagen.colorspace_settings.name = "Non-Color"
    imagen.pixels.foreach_set(pixeles.ravel())
    imagen.pack()
    bpy.data.images.remove(original)
    return imagen


# ---------------------------------------------------------------------------------------------
# Geometría: canto redondeado y tela vuelta
# ---------------------------------------------------------------------------------------------

def mover(vertice, capas, desplazamiento):
    vertice.co += desplazamiento
    for capa in capas:
        vertice[capa] += desplazamiento


def vueltas(objeto, tipo, tipo_de_abertura, principal=0):
    """
    Cada borde abierto de la tela principal se dobla hacia adentro: un canto redondeado de
    `GROSOR` y la tela vuelta (dobladillo o franja acanalada). Se aplica igual a todas las formas.
    """
    terminacion = TERMINACIONES[tipo]
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    capas = list(bm.verts.layers.shape.values())
    bm.normal_update()
    bm.verts.ensure_lookup_table()

    # Las normales de la malla miran hacia afuera si, en el tronco, se alejan del eje del cuerpo.
    hacia_afuera = sum(v.normal.x * v.co.x + v.normal.y * v.co.y for v in bm.verts if abs(v.co.x) < 0.15)
    signo = -1.0 if hacia_afuera > 0 else 1.0

    bordes = [e for e in bm.edges if e.is_boundary and e.link_faces[0].material_index == principal]
    zs = [v.co.z for v in bm.verts]
    centro = Vector((0.0, 0.0, (min(zs) + max(zs)) / 2))
    # Por vértice del borde: hacia adentro del cuerpo y hacia adentro de la tela (sobre su superficie).
    datos = {}
    for arista in bordes:
        for v in arista.verts:
            if v in datos:
                continue
            adentro = v.normal * signo
            tela = Vector((0, 0, 0))
            for e in v.link_edges:
                if not e.is_boundary:
                    tela += e.other_vert(v).co - v.co
            tela -= adentro * tela.dot(adentro)
            if tela.length < 1e-9:
                continue
            tela.normalize()
            # La tela vuelta va hacia el centro de la prenda (desde el puño hacia el hombro, desde la
            # basta hacia arriba). Si la tela vecina apunta hacia afuera, el borde ya es el interior
            # de un dobladillo que trae el modelo: no se le agrega otro.
            if tela.dot(centro - v.co) <= 0:
                continue
            abertura = tipo_de_abertura(v.co)
            largo = min(terminacion["cuello"], terminacion["vuelta"]) if abertura == "cuello" else terminacion["vuelta"]
            datos[v] = (adentro, tela, largo)

    # Solo los bordes que se doblan: sin caras de área cero en los que ya traen dobladillo.
    bordes = [e for e in bordes if all(v in datos for v in e.verts)]

    # Anillos sucesivos: el canto redondeado (media vuelta de radio GROSOR / 2) y la tela vuelta.
    radio = GROSOR / 2
    pasos = []
    for grados in (60, 120, 180):
        th = math.radians(grados)
        pasos.append((radio * (1 - math.cos(th)), -radio * math.sin(th), 0.0))
    pasos.append((GROSOR, 0.0, 1.0))

    actuales = bordes
    origen = {v: v for arista in bordes for v in arista.verts}
    previo = {v: Vector((0, 0, 0)) for v in origen}
    for hacia_adentro, hacia_afuera_tela, fraccion_vuelta in pasos:
        resultado = bmesh.ops.extrude_edge_only(bm, edges=actuales)
        nuevos_v = [g for g in resultado["geom"] if isinstance(g, bmesh.types.BMVert)]
        nuevas_e = [g for g in resultado["geom"] if isinstance(g, bmesh.types.BMEdge)]
        # Cada vértice nuevo nace donde estaba el que extruyó: se reconoce por la posición.
        por_posicion = {}
        for v in previo:
            por_posicion[tuple(round(c, 7) for c in v.co)] = v
        siguiente = {}
        for v in nuevos_v:
            anterior = por_posicion.get(tuple(round(c, 7) for c in v.co))
            if anterior is None:
                continue
            # Las formas del vértice nuevo parten de las del que lo originó.
            for capa in capas:
                v[capa] = anterior[capa].copy()
            base = origen[anterior]
            origen[v] = base
            if base not in datos:
                siguiente[v] = previo[anterior]
                continue
            adentro, tela, largo = datos[base]
            objetivo = adentro * hacia_adentro + tela * (hacia_afuera_tela + largo * fraccion_vuelta)
            mover(v, capas, objetivo - previo[anterior])
            siguiente[v] = objetivo
        for cara in (g for g in resultado["geom"] if isinstance(g, bmesh.types.BMFace)):
            cara.material_index = principal
            cara.smooth = True
        actuales = [e for e in nuevas_e if all(v in siguiente for v in e.verts) and e.is_boundary]
        previo = siguiente

    bm.to_mesh(objeto.data)
    bm.free()
    objeto.data.update()
    print(f"CONFECCION {objeto.name}: {len(bordes)} aristas de borde con canto y vuelta ({len(objeto.data.vertices)} vértices)")


# ---------------------------------------------------------------------------------------------

def confeccionar(objeto, tipo, ruta_relieve, material_principal):
    """Detalles de confección de una polera o un polerón: relieve y geometría de los bordes."""
    zs = [v.co.z for v in objeto.data.vertices]
    z_min, alto = min(zs), max(zs) - min(zs)

    def tipo_de_abertura(punto):
        if abs(punto.x) < 0.12 and punto.z > z_min + alto * 0.6:
            return "cuello"
        if punto.z < z_min + alto * 0.12:
            return "basta"
        return "manga"

    imagen = mapa_de_relieve(objeto, tipo, ruta_relieve, tipo_de_abertura)
    for nodo in material_principal.node_tree.nodes:
        if nodo.type == "TEX_IMAGE":
            nodo.image = imagen
    vueltas(objeto, tipo, tipo_de_abertura)
