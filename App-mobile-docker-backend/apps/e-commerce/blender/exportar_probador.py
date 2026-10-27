"""
Exporta los cuerpos del probador 3D (masculino y femenino) y sus prendas para la tienda.

Para cada sexo genera con MPFB el cuerpo promedio y sus variantes extremas, y las guarda como
deformaciones (morph targets) de un mismo cuerpo:

    altura_mas / altura_menos     cuerpo más alto / más bajo (parámetro de altura de MakeHuman)
    peso_mas / peso_menos         más / menos relleno (parámetro de peso de MakeHuman)
    pecho_mas / pecho_menos       contorno de busto (control de medidas de MakeHuman)
    cintura_mas / cintura_menos   contorno de cintura
    cadera_mas / cadera_menos     contorno de cadera
    volumen_mas                   más volumen en brazos, piernas y cuello: lleva el cuerpo más allá
                                  del tope de peso de MakeHuman sin que solo crezca el torso

Las prendas (polera, pantalón, polerón y chaqueta) salen de conjuntos de ropa de MakeHuman (CC0),
ajustados con MPFB a cada variante del cuerpo: tienen las mismas deformaciones, así que en la
tienda calzan con cualquier medida. Para agregar un tipo de prenda basta con sumarlo a PRENDAS.

Luego mide en Blender cómo cambian la altura y los contornos al aplicar cada deformación, y
guarda esas tablas en un JSON. Con ellas la tienda calcula, en el navegador y al instante, qué
deformaciones aplicar para una altura, un peso y unos contornos dados.

Salida (en `public/assets/probador/`), para cada sexo:

    cuerpo-<sexo>.glb, cuerpo-<sexo>.json
    <prenda>-<sexo>.glb   (polera, pantalon, poleron, chaqueta)

Uso (requiere los recursos de `recursos/`, ver README.md):

    blender -b --python exportar_probador.py
"""

import json
import os
import sys
import time

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import confeccion  # noqa: E402
import cuerpo_mpfb as cm  # noqa: E402

from bl_ext.blender_org.mpfb.entities.clothes.mhclo import Mhclo  # noqa: E402
from bl_ext.blender_org.mpfb.services.clothesservice import ClothesService  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

CARPETA = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.normpath(os.path.join(CARPETA, "..", "public", "assets", "probador"))
RECURSOS = os.path.join(CARPETA, "recursos", "clothes")

SEXOS = {"masculino": 1.0, "femenino": 0.0}

# De qué conjunto de MakeHuman sale cada tipo de prenda de la tienda, y si es la parte de
# arriba o la de abajo del conjunto. Toda la ropa de MakeHuman se ajusta al mismo cuerpo base,
# así que un conjunto masculino también calza en el cuerpo femenino.
PRENDAS = {
    "polera": {"masculino": ("male_casualsuit06", "arriba"), "femenino": ("female_casualsuit01", "arriba")},
    "pantalon": {"masculino": ("male_casualsuit06", "abajo"), "femenino": ("female_casualsuit01", "abajo")},
    "poleron": {"masculino": ("male_casualsuit02", "arriba"), "femenino": ("male_casualsuit02", "arriba")},
    "chaqueta": {"masculino": ("male_casualsuit05", "arriba"), "femenino": ("male_casualsuit05", "arriba")},
}

CONTORNOS = ("pecho", "cintura", "cadera")

# Formas de MakeHuman que forman la variante "volumen": la grasa de brazos, piernas y cuello, que
# el parámetro de peso deja de agregar en su tope. Se aplican todas juntas, con este peso.
VOLUMEN = {
    **{f"{lado}-{parte}-fat-incr": 1.0 for lado in "lr" for parte in ("upperarm", "lowerarm", "upperleg", "lowerleg")},
    "measure-upperarm-circ-incr": 0.6,
    "measure-thigh-circ-incr": 0.6,
    "measure-calf-circ-incr": 0.5,
    "measure-neck-circ-incr": 0.6,
    "neck-double-incr": 0.5,
    # El abdomen y el ancho del torso: el control de cintura solo no alcanza en los cuerpos pesados.
    "stomach-pregnant-incr": 0.8,
    "measure-underbust-circ-incr": 0.6,
    "torso-scale-depth-incr": 0.5,
}
TOPE_CONTROL = cm.TOPE_CONTROL
# Lado de la textura de relieve de la tela en la tienda.
LADO_TEXTURA = 1024
# Las piezas de un conjunto cuyo centro está sobre esta fracción de la altura son "de arriba".
LIMITE_ARRIBA = 0.55


def coordenadas(objeto):
    """Posiciones de todos los vértices con las formas aplicadas, sin modificadores."""
    for modificador in objeto.modifiers:
        modificador.show_viewport = False
    grafo = bpy.context.evaluated_depsgraph_get()
    evaluado = objeto.evaluated_get(grafo)
    malla = evaluado.to_mesh()
    puntos = [evaluado.matrix_world @ v.co for v in malla.vertices]
    evaluado.to_mesh_clear()
    return puntos


def humano(macro):
    return HumanService.create_human(macro_detail_dict=macro)


def variantes(sexo, conjuntos):
    """
    Cuerpo promedio y las posiciones de cada variante extrema del cuerpo y de cada conjunto de
    ropa ajustado a ella. Todas las variantes de una malla tienen los mismos vértices.
    """
    base = TargetService.get_default_macro_info_dict()
    base["gender"] = sexo
    cuerpo = humano(base)

    ropas = {}
    for conjunto in conjuntos:
        ruta = os.path.join(RECURSOS, conjunto, f"{conjunto}.mhclo")
        objeto = HumanService.add_mhclo_asset(ruta, cuerpo, subdiv_levels=0, set_up_rigging=False,
                                              interpolate_weights=False, import_subrig=False, import_weights=False)
        mhclo = Mhclo()
        mhclo.load(ruta)
        mhclo.clothes = objeto
        ropas[conjunto] = (objeto, mhclo, {})

    def tomar(clave, sobre):
        for objeto, mhclo, posiciones in ropas.values():
            ClothesService.fit_clothes_to_human(objeto, sobre, mhclo=mhclo, set_parent=False)
            posiciones[clave] = coordenadas(objeto)
        cuerpos[clave] = coordenadas(sobre)

    cuerpos = {}
    tomar("base", cuerpo)
    for parametro, nombre in (("height", "altura"), ("weight", "peso")):
        for valor, sentido in ((1.0, "mas"), (0.0, "menos")):
            otro = humano(dict(base, **{parametro: valor}))
            tomar(f"{nombre}_{sentido}", otro)
            bpy.data.objects.remove(otro)

    for nombre, peso in VOLUMEN.items():
        TargetService.load_target(cuerpo, TargetService.target_full_path(nombre), weight=peso, name=nombre)
    tomar("volumen_mas", cuerpo)
    for nombre in VOLUMEN:
        cuerpo.data.shape_keys.key_blocks[nombre].value = 0.0

    for contorno in CONTORNOS:
        for sentido_mh, sentido in (("incr", "mas"), ("decr", "menos")):
            control = f"{cm.CONTROLES[contorno]}-{sentido_mh}"
            TargetService.load_target(cuerpo, TargetService.target_full_path(control), weight=1.0, name=control)
            tomar(f"{contorno}_{sentido}", cuerpo)
            cuerpo.data.shape_keys.key_blocks[control].value = 0.0
    return cuerpo, cuerpos, {c: (o, p) for c, (o, _, p) in ropas.items()}


def con_deformaciones(original, posiciones, nombre):
    """Copia limpia de una malla (sin las formas internas de MPFB) con una forma por variante."""
    malla = original.data.copy()
    malla.materials.clear()
    objeto = bpy.data.objects.new(nombre, malla)
    bpy.context.scene.collection.objects.link(objeto)
    objeto.shape_key_clear()
    for vertice, punto in zip(malla.vertices, posiciones["base"]):
        vertice.co = punto
    objeto.shape_key_add(name="Basis", from_mix=False)
    for clave, puntos in posiciones.items():
        if clave == "base":
            continue
        forma = objeto.shape_key_add(name=clave, from_mix=False)
        forma.slider_min = 0.0
        forma.slider_max = TOPE_CONTROL
        for i, punto in enumerate(puntos):
            forma.data[i].co = punto
    # Todas en cero: así la malla evaluada (la que se mide) es la del cuerpo promedio.
    for forma in objeto.data.shape_keys.key_blocks:
        forma.value = 0.0
    for poligono in malla.polygons:
        poligono.use_smooth = True
    return objeto


def borrar_vertices(objeto, sobra):
    """Borra los vértices para los que `sobra(vértice bmesh)` es verdadero; conserva las formas."""
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    capa = bm.verts.layers.deform.active
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if sobra(v, capa)], context="VERTS")
    bm.to_mesh(objeto.data)
    bm.free()


def vertices_ocultos(conjunto):
    """Vértices del cuerpo de MakeHuman que quedan bajo la ropa (sección delete_verts del .mhclo)."""
    ocultos = set()
    leyendo = False
    with open(os.path.join(RECURSOS, conjunto, f"{conjunto}.mhclo"), encoding="utf8") as archivo:
        for linea in archivo:
            palabras = linea.split()
            if not palabras or palabras[0].startswith("#"):
                continue
            if palabras[0] == "delete_verts":
                leyendo = True
                continue
            if not leyendo:
                continue
            if not palabras[0].isdigit():
                break
            # Números sueltos y rangos "a - b".
            i = 0
            while i < len(palabras):
                if i + 2 < len(palabras) and palabras[i + 1] == "-":
                    ocultos.update(range(int(palabras[i]), int(palabras[i + 2]) + 1))
                    i += 3
                else:
                    ocultos.add(int(palabras[i]))
                    i += 1
    return ocultos


def preparar_cuerpo(original, posiciones, nombre):
    """El cuerpo sin los ayudantes de MPFB, y el índice original de cada vértice que queda."""
    objeto = con_deformaciones(original, posiciones, nombre)
    # Se quitan los ayudantes de MPFB (todo lo que no es el grupo "body").
    grupo = objeto.vertex_groups["body"].index
    originales = [v.index for v in objeto.data.vertices if any(g.group == grupo for g in v.groups)]
    borrar_vertices(objeto, lambda v, capa: grupo not in v[capa])
    objeto.vertex_groups.clear()
    material = bpy.data.materials.new("Maniqui")
    material.use_nodes = True
    principal = material.node_tree.nodes.get("Principled BSDF")
    principal.inputs["Base Color"].default_value = (0.78, 0.72, 0.66, 1)
    principal.inputs["Roughness"].default_value = 0.55
    objeto.data.materials.append(material)
    return objeto, originales


def material_tela(nombre, conjunto, color):
    """Tela con el relieve del conjunto (mapa de normales), reducido para la web."""
    ruta = os.path.join(RECURSOS, conjunto, f"{conjunto}_normal.png")
    imagen = bpy.data.images.get(os.path.basename(ruta)) or bpy.data.images.load(ruta)
    imagen.colorspace_settings.name = "Non-Color"
    if imagen.size[0] > LADO_TEXTURA:
        imagen.scale(LADO_TEXTURA, LADO_TEXTURA)
    material = bpy.data.materials.new(nombre)
    material.use_nodes = True
    nodos = material.node_tree.nodes
    principal = nodos.get("Principled BSDF")
    principal.inputs["Base Color"].default_value = color
    principal.inputs["Roughness"].default_value = 0.9
    textura = nodos.new("ShaderNodeTexImage")
    textura.image = imagen
    mapa = nodos.new("ShaderNodeNormalMap")
    material.node_tree.links.new(textura.outputs["Color"], mapa.inputs["Color"])
    material.node_tree.links.new(mapa.outputs["Normal"], principal.inputs["Normal"])
    return material


def preparar_prenda(original, posiciones, nombre, conjunto, parte, altura_cuerpo):
    """
    La parte de arriba o la de abajo de un conjunto. La pieza más grande lleva el material
    "Principal" (la tienda le pone el color del producto); las demás, como la camisa bajo una
    chaqueta, el material "Secundaria".
    """
    objeto = con_deformaciones(original, posiciones, nombre)
    objeto.vertex_groups.clear()
    objeto.data.materials.append(material_tela("Principal", conjunto, (1, 1, 1, 1)))
    objeto.data.materials.append(material_tela("Secundaria", conjunto, (0.92, 0.9, 0.86, 1)))

    # Piezas sueltas del conjunto (polera, jeans, camisa...): se quedan las de la parte pedida.
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    pieza = {}
    for inicio in bm.verts:
        if inicio in pieza:
            continue
        pila = [inicio]
        pieza[inicio] = inicio.index
        while pila:
            v = pila.pop()
            for arista in v.link_edges:
                otro = arista.other_vert(v)
                if otro not in pieza:
                    pieza[otro] = inicio.index
                    pila.append(otro)
    alturas = {}
    for v in bm.verts:
        alturas.setdefault(pieza[v], []).append(v.co.z)
    arriba = {p for p, zs in alturas.items() if sum(zs) / len(zs) > altura_cuerpo * LIMITE_ARRIBA}
    elegidas = arriba if parte == "arriba" else set(alturas) - arriba
    principal = max(elegidas, key=lambda p: len(alturas[p]))
    for cara in bm.faces:
        cara.material_index = 0 if pieza[cara.verts[0]] == principal else 1
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if pieza[v] not in elegidas], context="VERTS")
    bm.to_mesh(objeto.data)
    bm.free()
    print(f"PRENDA {nombre}: {len(alturas)} piezas en el conjunto, se quedan {len(elegidas)} ({len(objeto.data.vertices)} vértices)")
    return objeto


# ---------------------------------------------------------------------------------------------
# Tablas de calibración
# ---------------------------------------------------------------------------------------------

def aplicar(objetos, pesos):
    for objeto in objetos:
        for forma in objeto.data.shape_keys.key_blocks[1:]:
            forma.value = pesos.get(forma.name, 0.0)


def pesos_de(parametro, valor):
    """Pesos de las dos formas de un parámetro para un valor con signo (+ agranda, - achica)."""
    return {f"{parametro}_mas": max(valor, 0.0), f"{parametro}_menos": max(-valor, 0.0)}


def medir(objeto):
    alto = cm.altura_de(objeto)
    return {"altura": round(alto * 100, 2), **{m: round(cm.medir_contorno(objeto, m, alto), 2) for m in CONTORNOS}}


def tablas(objeto):
    """Altura y contornos al mover cada parámetro por separado, con los demás en cero."""
    pasos = [round(-1 + i * 0.1, 2) for i in range(21)]
    pasos_control = [round(-1 + i * 0.1, 2) for i in range(int((TOPE_CONTROL + 1) / 0.1) + 1)]
    resultado = {}
    pasos_volumen = [round(i * 0.1, 2) for i in range(11)]
    for parametro, valores in (("altura", pasos), ("peso", pasos), ("volumen", pasos_volumen), *((m, pasos_control) for m in CONTORNOS)):
        filas = []
        for valor in valores:
            aplicar([objeto], pesos_de(parametro, valor))
            filas.append({"valor": valor, **medir(objeto)})
        resultado[parametro] = filas
    aplicar([objeto], {})
    return resultado


def contorno_prenda(bm, z):
    """
    Contorno (m) de una prenda a la altura z: el de todos los lazos del corte que pasan por el
    centro del cuerpo (una prenda puede tener la costura del medio abierta, como el tiro de un
    jean), sin las mangas.
    """
    copia = bm.copy()
    corte = bmesh.ops.bisect_plane(copia, geom=copia.verts[:] + copia.edges[:] + copia.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1))
    aristas = [e for e in corte["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
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
            grupos.setdefault(raiz(v.index), []).append((v.co.x, v.co.y))
    copia.free()
    centrales = [p for puntos in grupos.values() if min(x for x, _ in puntos) < 0.03 and max(x for x, _ in puntos) > -0.03 for p in puntos]
    return cm.envolvente(centrales)


def medidas_prenda(cuerpo, prenda, parte):
    """
    Cómo le queda la prenda al cuerpo promedio, en cm: holgura sobre el pecho (arriba) o sobre la
    cadera (abajo), altura de esa medida y extremos de la prenda. La tienda parte de estas medidas
    para agrandar o achicar la prenda según la talla.
    """
    medida = "pecho" if parte == "arriba" else "cadera"
    alto = cm.altura_de(cuerpo)
    bm = cm.malla_evaluada(cuerpo)
    piso = min(v.co.z for v in bm.verts)
    desde, hasta, _ = cm.FRANJAS[medida]
    alturas = [piso + alto * (desde + (hasta - desde) * i / 8) for i in range(9)]
    contornos = [cm.contorno_torso(bm, z) for z in alturas]
    bm.free()
    z_medida = alturas[contornos.index(max(contornos))]
    tela = cm.malla_evaluada(prenda)
    contorno = contorno_prenda(tela, z_medida)
    zs = [v.co.z for v in tela.verts]
    tela.free()
    return {
        "medida": medida,
        "contornoCuerpo": round(max(contornos) * 100, 2),
        "contornoPrenda": round(contorno * 100, 2),
        "holgura": round((contorno - max(contornos)) * 100, 2),
        "alturaMedida": round((z_medida - piso) * 100, 2),
        "largoVertical": round((max(zs) - min(zs)) * 100, 2),
        "bordeInferior": round((min(zs) - piso) * 100, 2),
    }


def interpolar(filas, campo, valor):
    """Valor de `campo` en la tabla para un `valor` del parámetro, interpolando linealmente."""
    for a, b in zip(filas, filas[1:]):
        if a["valor"] <= valor <= b["valor"]:
            t = (valor - a["valor"]) / (b["valor"] - a["valor"])
            return a[campo] + (b[campo] - a[campo]) * t
    return filas[0][campo] if valor < filas[0]["valor"] else filas[-1][campo]


def invertir(filas, campo, objetivo):
    """Valor del parámetro con el que `campo` llega a `objetivo`."""
    for a, b in zip(filas, filas[1:]):
        if min(a[campo], b[campo]) <= objetivo <= max(a[campo], b[campo]) and a[campo] != b[campo]:
            t = (objetivo - a[campo]) / (b[campo] - a[campo])
            return a["valor"] + (b["valor"] - a["valor"]) * t
    return filas[0]["valor"] if objetivo < filas[0][campo] else filas[-1]["valor"]


def volumen_de(imc):
    """Variante de volumen para un IMC: nada hasta 31 (tope del peso de MakeHuman), todo en 43."""
    return min(max((imc - 31) / 12, 0.0), 1.0)


def resolver(tabla, altura, peso, objetivos):
    """
    Pesos de las deformaciones y escala para una altura, un peso y unos contornos. Es el mismo
    cálculo que hace la tienda en el navegador (`resolverCuerpo` en `cuerpo-real.ts`).
    """
    imc = peso / (altura / 100) ** 2
    valor_peso = min(max((imc - 17) / 14, 0.0), 1.0) * 2 - 1
    valor_volumen = volumen_de(imc)
    valor_altura = invertir(tabla["altura"], "altura", altura)
    escala = altura / interpolar(tabla["altura"], "altura", valor_altura)
    valores = {"altura": valor_altura, "peso": valor_peso, "volumen": valor_volumen}
    for m in CONTORNOS:
        base = interpolar(tabla[m], m, 0.0)
        sin_control = (base + (interpolar(tabla["altura"], m, valor_altura) - base) + (interpolar(tabla["peso"], m, valor_peso) - base)
                       + (interpolar(tabla["volumen"], m, valor_volumen) - base))
        diferencia = objetivos[m] / escala - sin_control
        filas = [{"valor": f["valor"], "delta": f[m] - base} for f in tabla[m]]
        valores[m] = invertir(filas, "delta", diferencia)
    return valores, escala


def validar(objeto, tabla):
    casos = [(175, 78, 100, 86, 98), (165, 55, None, None, None), (175, 110, None, None, None), (160, 60, None, None, None),
             (175, 130, None, None, None), (210, 180, None, None, None)]
    for altura, peso, pecho, cintura, cadera in casos:
        objetivos, _ = cm.estimar_contornos(altura, peso, "media", pecho, cintura, cadera)
        valores, escala = resolver(tabla, altura, peso, objetivos)
        pesos = {}
        for parametro, valor in valores.items():
            pesos.update(pesos_de(parametro, valor))
        aplicar([objeto], pesos)
        objeto.scale = (escala, escala, escala)
        bpy.context.view_layer.update()
        real = medir(objeto)
        objeto.scale = (1, 1, 1)
        print(f"VALIDACION {altura} cm {peso} kg -> altura {real['altura']:.1f} | " + " | ".join(
            f"{m} {real[m]:.1f} (objetivo {objetivos[m]:.1f})" for m in CONTORNOS))
    aplicar([objeto], {})


# ---------------------------------------------------------------------------------------------

def exportar(objeto, ruta, *, texturas):
    bpy.ops.object.select_all(action="DESELECT")
    objeto.select_set(True)
    bpy.context.view_layer.objects.active = objeto
    bpy.ops.export_scene.gltf(
        filepath=ruta,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_morph=True,
        export_morph_normal=False,
        export_normals=True,
        export_texcoords=texturas,
        export_yup=True,
        # Los relieves van en JPEG: el de la polera y el polerón mide 2048 px.
        export_image_format="JPEG" if texturas else "AUTO",
        export_image_quality=88,
    )


def main():
    os.makedirs(SALIDA, exist_ok=True)
    for sexo, valor_sexo in SEXOS.items():
        inicio = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        conjuntos = sorted({PRENDAS[tipo][sexo][0] for tipo in PRENDAS})
        original, cuerpos, ropas = variantes(valor_sexo, conjuntos)
        cuerpo, originales = preparar_cuerpo(original, cuerpos, f"cuerpo-{sexo}")
        alto = cm.altura_de(cuerpo)

        tabla = tablas(cuerpo)
        validar(cuerpo, tabla)

        prendas = {}
        for tipo, por_sexo in PRENDAS.items():
            conjunto, parte = por_sexo[sexo]
            objeto_ropa, posiciones = ropas[conjunto]
            prenda = preparar_prenda(objeto_ropa, posiciones, f"{tipo}-{sexo}", conjunto, parte, alto)
            # Polera y polerón: tejido, cuello, dobladillos y costuras en el relieve, y bordes con
            # canto y tela vuelta en la geometría (ver confeccion.py).
            if tipo in confeccion.TERMINACIONES:
                confeccion.confeccionar(prenda, tipo, os.path.join(RECURSOS, conjunto, f"{conjunto}_normal.png"), prenda.data.materials[0])
            # La piel bajo la prenda se oculta en la tienda, como hace MakeHuman con su ropa. La
            # lista del conjunto cubre arriba y abajo: se toma solo la de esta parte.
            ocultos_mh = vertices_ocultos(conjunto)
            ocultos = [nuevo for nuevo, viejo in enumerate(originales) if viejo in ocultos_mh and (
                cuerpo.data.vertices[nuevo].co.z > alto * 0.45 if parte == "arriba" else cuerpo.data.vertices[nuevo].co.z < alto * 0.62)]
            ajuste = medidas_prenda(cuerpo, prenda, parte)
            print(f"PRENDA {tipo}-{sexo}: {ajuste} | piel oculta: {len(ocultos)} vértices")
            exportar(prenda, os.path.join(SALIDA, f"{tipo}-{sexo}.glb"), texturas=True)
            prendas[tipo] = {
                "archivo": f"{tipo}-{sexo}.glb",
                "parte": parte,
                "origen": f"MakeHuman {conjunto} (CC0)",
                "ajuste": ajuste,
                "ocultos": ocultos,
            }

        with open(os.path.join(SALIDA, f"cuerpo-{sexo}.json"), "w", encoding="utf8") as archivo:
            json.dump({
                "sexo": sexo,
                "formas": [f.name for f in cuerpo.data.shape_keys.key_blocks[1:]],
                "tablas": tabla,
                "prendas": prendas,
            }, archivo, ensure_ascii=False)
        exportar(cuerpo, os.path.join(SALIDA, f"cuerpo-{sexo}.glb"), texturas=False)
        print(f"EXPORTADO {sexo}: cuerpo y {len(prendas)} prendas en {time.time() - inicio:.0f} s")


main()
