## Context

La tienda web (Ionic 8 + Angular 18) muestra una tarjeta por variante (producto + talla + color). Las categorías con tallas son Poleras, Polerones y Chaquetas (XS–XXL), Pantalones (38–50) y Cinturones (Única). El catálogo no guarda medidas de las prendas, solo el nombre de la talla.

## Goals / Non-Goals

**Goals:**
- Mostrar en 3D cómo queda cada talla en un cuerpo con la altura y el peso del cliente.
- Recomendar una talla con reglas simples, explicables y probadas.
- No cargar three.js hasta que el cliente abra el probador.

**Non-Goals:**
- Simulación física de telas o modelos 3D por prenda.
- Medidas exactas del cuerpo: es una estimación, y la pantalla lo dice.

## Decisions

### 1. Medidas del cuerpo estimadas desde altura e IMC
Con la altura `h` y el IMC (`peso / altura²`) se estiman los contornos de pecho, cintura y cadera como `k · h · (IMC/22)^e`. La cintura usa un exponente mayor porque es lo que más crece con el peso. Es unisex y aproximado. Alternativa descartada: pedir medidas con huincha, que agrega pasos y errores de medición para la mayoría de los clientes.

### 2. Tabla de medidas por talla en la tienda
`src/app/data/probador.ts` define para cada tipo de prenda el rango de contorno corporal que cubre cada talla, la holgura de la prenda y su largo. El tipo de prenda se deduce del nombre de la categoría. Una categoría que no calza con ningún tipo no muestra el botón Probar.
- Poleras, polerones y chaquetas: contorno de pecho y largo del cuerpo de la prenda.
- Pantalones: la talla chilena N cubre una cintura de aproximadamente `2N ± 2` cm. El largo de pierna es fijo.
- Cinturones: talla única, siempre calza.

### 3. Maniquí paramétrico hecho con primitivas de three.js
No hay modelos externos. El torso es un `LatheGeometry` cuyo perfil pasa por cadera, cintura, pecho, hombros y cuello, achatado en profundidad para que la sección sea elíptica. Brazos y piernas son cápsulas. La prenda es otra superficie de revolución cuyo radio, en cada altura, es el mayor entre el de la prenda y el del cuerpo más un margen. Así una talla chica se ve ceñida sin atravesar el cuerpo, y una talla grande se ve holgada. Mangas, capucha, cierre y piernas del pantalón se agregan según el tipo.

### 4. Carga diferida
El componente importa `escena-maniqui.ts` con `import()` dinámico, de modo que three.js queda en un archivo aparte. Si el navegador no tiene WebGL, el probador muestra el aviso y deja igual la recomendación de talla.

## Risks / Trade-offs

- **La estimación no calza con todos los cuerpos** → el texto aclara que es una referencia, y el cliente puede comparar todas las tallas.
- **La tabla de tallas es genérica** → está en un solo archivo, fácil de ajustar con las medidas reales del proveedor.
- **Peso de three.js (~600 kB)** → se carga solo al abrir el probador.
