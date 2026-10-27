## 1. Cálculo de tallas

- [x] 1.1 Crear `src/app/data/probador.ts` con la estimación de medidas del cuerpo, la tabla de medidas por tipo de prenda, la evaluación de ajuste y la recomendación de talla
- [x] 1.2 Configurar Vitest en la tienda y cubrir con pruebas la estimación, el tipo de prenda por categoría, el ajuste de cada talla, la recomendación y la validación de rangos

## 2. Escena 3D

- [x] 2.1 Agregar `three` y crear `src/app/probador/escena-maniqui.ts` con el maniquí paramétrico, las prendas por tipo, la cámara orbitable y la liberación de recursos al cerrar

## 3. Probador en la tienda

- [x] 3.1 Crear el componente del probador con altura y peso recordados, selector de tallas, ajuste, recomendación y botón para agregar al carrito, cargando la escena con `import()` dinámico
- [x] 3.2 Agregar el botón Probar en las tarjetas de la tienda y abrir el probador en una ventana modal
- [x] 3.3 Verificar la compilación de producción y probar el flujo en el contenedor de la tienda
