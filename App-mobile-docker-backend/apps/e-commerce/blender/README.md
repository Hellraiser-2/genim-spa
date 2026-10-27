# Modelos 3D del probador (Blender + MakeHuman)

Scripts que generan los cuerpos realistas del probador 3D (masculino y femenino) y sus prendas, y los exportan a
`public/assets/probador/` para la tienda.

| Script | Qué hace |
| --- | --- |
| `cuerpo_mpfb.py` | Genera un cuerpo con una altura, un peso y (opcionales) contornos de pecho, cintura y cadera. Sirve para revisar cómo se ve un cuerpo: deja un render y, si se pide, un `.glb`. |
| `confeccion.py` | Detalles de confección de la polera y el polerón, en el modelo: tejido de punto, cuello acanalado, dobladillos con doble costura y pespuntes en el mapa de relieve, y cantos redondeados con la tela vuelta hacia adentro en la geometría. Lo usa `exportar_probador.py`. |
| `exportar_probador.py` | Exporta lo que usa la tienda: para cada sexo, el cuerpo y cada prenda (polera, pantalón, polerón, chaqueta) con sus deformaciones (altura, peso, pecho, cintura, cadera), y un JSON con las tablas de calibración. |

## Requisitos

1. **Blender 4.2 o superior** (probado con 5.2): <https://www.blender.org/download/>
2. **Extensión MPFB** (MakeHuman para Blender): en Blender, *Edit → Preferences → Get Extensions*, buscar
   **MPFB** e instalar.
3. **Recursos de MakeHuman** (solo para `exportar_probador.py`): el paquete de sistema, con licencia CC0.
   Se descarga una vez y se copian cuatro conjuntos de ropa a `recursos/clothes/` (la carpeta no se sube al
   repositorio):

   ```bash
   curl -L -o sistema.zip https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
   unzip sistema.zip "clothes/male_casualsuit06/*" "clothes/male_casualsuit02/*" "clothes/male_casualsuit05/*" "clothes/female_casualsuit01/*" -d recursos
   ```

## Uso

Desde esta carpeta, sin abrir la interfaz de Blender (en Windows, la ruta suele ser
`"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"`):

```bash
# Un cuerpo de prueba, con render para revisarlo
blender -b --python cuerpo_mpfb.py -- --altura 175 --peso 78 --pecho 100 --cintura 86 --cadera 98 --render cuerpo.png

# Los modelos de la tienda (tarda unos 5 minutos)
blender -b --python exportar_probador.py
```

`exportar_probador.py` muestra una validación: reconstruye algunos cuerpos con las tablas, igual que la
tienda, y compara sus medidas con las pedidas. La altura queda exacta y los contornos a unos 3 cm; en pesos
muy altos la cintura queda corta, porque los controles de MakeHuman llegan a su límite.

## Cómo lo usa la tienda

`src/app/probador/cuerpo-real.ts` carga el cuerpo del sexo elegido y el modelo de la prenda, calcula con las
tablas del JSON cuánto aplicar de cada deformación y deforma ambos en el navegador, al instante. La piel que
queda bajo la prenda no se dibuja (como hace MakeHuman con su ropa), así el cuerpo nunca asoma a través de la
tela. La talla ensancha o angosta la prenda y, en las de arriba, alarga o acorta su basta. El cinturón no
tiene modelo: se arma sobre la cadera del cuerpo deformado.

| Tipo de prenda (categoría de la tienda) | Modelo |
| --- | --- |
| Polera | polera de `male_casualsuit06` / `female_casualsuit01` |
| Pantalón | jeans de `male_casualsuit06` / `female_casualsuit01` |
| Polerón | polerón de manga larga de `male_casualsuit02` |
| Chaqueta | chaqueta (con camisa) de `male_casualsuit05` |
| Cinturón | se arma en la tienda sobre el cuerpo |

### Prendas nuevas

El modelo se elige por la **categoría** de la prenda (`tipoDePrenda` en `src/app/data/probador.ts`) y se pinta
con el **color** de su variante. Por eso toda prenda nueva que se agregue a la tienda en una categoría
conocida (por ejemplo, otra polera de otra banda) se ve en el probador sin hacer nada.

Para un **tipo nuevo** (por ejemplo, shorts):

1. Sumarlo a `PRENDAS` en `exportar_probador.py`, con el conjunto de MakeHuman del que sale y si es la parte
   de arriba o la de abajo, y volver a correr el script.
2. Sumarlo a `tipoDePrenda` y a `tablaDeTallas` en `src/app/data/probador.ts`.

Si un tipo no tiene modelo realista, el probador usa el maniquí de figuras de `escena-maniqui.ts`.

## Licencias

- El cuerpo base de MakeHuman y los conjuntos de ropa usados son **CC0** (dominio público).
- MPFB es GPL-3.0; es solo la herramienta: los modelos que genera no quedan sujetos a esa licencia.
