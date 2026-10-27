## Why

Comprar ropa por internet sin probársela obliga al cliente a adivinar la talla. Una talla equivocada termina en devolución o en un cliente que no vuelve. La tienda web solo muestra el nombre de la talla (S, M, 42…), sin ninguna referencia de cómo le quedará la prenda a quien compra.

## What Changes

- Se agrega un **probador virtual 3D** a la tienda web. Desde cada prenda, el botón **Probar** abre un maniquí en 3D que el cliente puede girar.
- El cliente ingresa su **altura y su peso**. El maniquí toma esas proporciones y la prenda se dibuja encima con las medidas de la talla elegida, de modo que se ve si queda ceñida, justa u holgada.
- El probador **recomienda una talla** según una tabla de medidas por categoría, indica cómo queda de ancho y de largo cada talla, y permite agregar al carrito la talla elegida si tiene stock.
- Las medidas del cliente se recuerdan en el navegador para la próxima prenda. No se envían al servidor.

## Capabilities

### New Capabilities
- `probador-virtual`: simulación de prendas sobre un maniquí 3D según la altura y el peso del cliente, con recomendación de talla.

### Modified Capabilities
<!-- Ninguna: el catálogo y el carrito se usan tal como están. -->

## Impact

- **Tienda web (`apps/e-commerce`)**: nuevo componente del probador, módulo de cálculo de tallas con pruebas unitarias (Vitest) y botón en las tarjetas de la tienda.
- **Dependencias**: `three` para el 3D. Se carga solo al abrir el probador, así que no aumenta la carga inicial de la tienda.
- **Backend y base de datos**: sin cambios. La tabla de medidas por talla vive en la tienda; si más adelante cada producto necesita medidas propias, se moverá al catálogo.
- **Fuera de alcance**: modelos 3D reales de cada prenda, estampados sobre la prenda, selección de contextura o de sexo y cálculo con más medidas que altura y peso.
