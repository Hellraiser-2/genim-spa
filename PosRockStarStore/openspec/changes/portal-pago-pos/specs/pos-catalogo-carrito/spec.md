# Spec Delta

## Purpose

Presenta el catálogo real de productos como tarjetas responsivas con control de cantidad por unidad, detalle y total reactivos, impidiendo siempre vender por encima del stock disponible.

## ADDED Requirements

### Requirement: Catálogo en tarjetas responsivas

El sistema SHALL mostrar los productos con precio provenientes de la API como tarjetas en una cuadrícula responsiva, cada una con foto, nombre, detalle (banda · color · talla), precio en formato CLP y stock disponible.

#### Scenario: Carga del catálogo al abrir el POS

- **WHEN** el vendedor abre la vista POS con sesión vigente
- **THEN** el sistema lista todas las variantes con precio y su disponibilidad actual

#### Scenario: Producto sin foto

- **WHEN** una variante no trae imagen
- **THEN** la tarjeta muestra una imagen de reemplazo y el resto de los datos igual

#### Scenario: Reintento ante fallo de red

- **WHEN** la carga del catálogo falla
- **THEN** el sistema muestra el error y ofrece reintentar sin perder la sesión

### Requirement: Control de cantidad por tarjeta

El sistema SHALL ofrecer en cada tarjeta un control `+ cantidad −` que suma o resta de a 1 unidad y refleja la cantidad elegida de esa variante.

#### Scenario: Agregar una unidad

- **WHEN** el vendedor pulsa `+` en una tarjeta con stock disponible
- **THEN** la cantidad de esa variante sube en 1 y el detalle y el total se actualizan de inmediato

#### Scenario: Quitar una unidad

- **WHEN** el vendedor pulsa `−` en una tarjeta con cantidad mayor a 0
- **THEN** la cantidad baja en 1 y el detalle y el total se actualizan de inmediato

#### Scenario: Quitar la última unidad

- **WHEN** el vendedor pulsa `−` con cantidad en 1
- **THEN** la variante sale del detalle y su cantidad vuelve a 0

### Requirement: Validación de stock con tope

El sistema SHALL consultar el stock disponible al agregar y nunca permitir una cantidad superior al disponible; al alcanzar el tope, el botón `+` de esa tarjeta queda inhabilitado.

#### Scenario: Venta con stock disponible

- **WHEN** el vendedor confirma la venta y cada línea tiene stock disponible
- **THEN** el sistema registra la venta y descuenta el stock al instante

#### Scenario: Tope de stock en el carrito

- **WHEN** la cantidad elegida de una variante iguala su disponible (por ejemplo 7 de 7)
- **THEN** el sistema inhabilita el `+` de esa tarjeta y muestra que se alcanzó el máximo disponible

#### Scenario: Intento de superar el stock

- **WHEN** el vendedor intenta agregar una unidad más allá del disponible
- **THEN** el sistema lo impide y mantiene la cantidad en el tope sin alterar el total

#### Scenario: Venta con stock insuficiente

- **WHEN** el vendedor intenta confirmar la venta de un producto sin stock disponible
- **THEN** el sistema bloquea la venta y muestra "Sin stock"

#### Scenario: Producto con stock cero

- **WHEN** una variante tiene disponible 0
- **THEN** su tarjeta muestra "Sin stock", sus controles están inhabilitados y nunca entra al detalle como producto seleccionado

### Requirement: Detalle y total reactivos

El sistema SHALL mantener visible un detalle con cada línea (producto, talla, cantidad, precio unitario, subtotal) y el valor total de la compra, actualizados en cada pulsación de `+` o `−`.

#### Scenario: Detalle acompaña a la tarjeta

- **WHEN** cambia la cantidad de cualquier tarjeta
- **THEN** el detalle y el total reflejan el cambio en la misma interacción, sin recargar la página

#### Scenario: Carrito vacío

- **WHEN** no hay ninguna variante con cantidad mayor a 0
- **THEN** el detalle indica que no hay productos y la acción de cobrar está inhabilitada
