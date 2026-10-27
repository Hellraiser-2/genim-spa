# Spec Delta

## Purpose

Permite a los vendedores registrar las ventas hechas en la tienda física contra el stock real y entregar al comprador un comprobante interno de la operación.

## ADDED Requirements

### Requirement: CU-06 Registrar venta POS
El sistema DEBE (SHALL) permitir que un Vendedor registre una venta en tienda agregando variantes por búsqueda o por escaneo, indicando cantidades y el medio de pago (efectivo, débito o crédito). Al confirmarla, el stock se descuenta de forma atómica y la venta queda asociada al Vendedor.

#### Scenario: Venta correcta
- **WHEN** un Vendedor confirma una venta con productos disponibles y un medio de pago
- **THEN** la venta queda registrada con canal POS, fecha, vendedor, detalle y total, y el stock de cada variante baja en la cantidad vendida

#### Scenario: Agregar producto por escaneo
- **WHEN** el Vendedor escanea el código de una prenda
- **THEN** la variante se agrega a la venta, o aumenta en una unidad si ya estaba

#### Scenario: Producto sin stock
- **WHEN** el Vendedor confirma una venta y alguna variante ya no tiene disponibilidad suficiente
- **THEN** la venta no se registra, el stock no cambia y el POS indica qué variante no tiene stock

#### Scenario: Venta sin medio de pago
- **WHEN** el Vendedor intenta confirmar una venta sin indicar el medio de pago
- **THEN** el POS no registra la venta y solicita el medio de pago

#### Scenario: Venta sin productos
- **WHEN** el Vendedor intenta confirmar una venta sin líneas
- **THEN** el POS no permite confirmarla

### Requirement: Ubicación de origen de la venta POS
El sistema DEBE (SHALL) descontar las ventas POS de la sala de ventas, y permitir al Vendedor indicar que una línea se retira desde bodega cuando la sala de ventas no tiene existencia suficiente.

#### Scenario: Existencia en sala de ventas
- **WHEN** se vende una variante con existencia suficiente en la sala de ventas
- **THEN** la existencia de la sala de ventas baja y la de bodega no cambia

#### Scenario: Existencia solo en bodega
- **WHEN** se vende una variante sin existencia en la sala de ventas pero disponible en bodega
- **THEN** el POS ofrece retirarla desde bodega y, al aceptar, descuenta la existencia de bodega

### Requirement: Precio y total de la venta
El sistema DEBE (SHALL) calcular el total de la venta a partir del precio vigente de cada producto al momento de vender, y conservar en la venta el precio unitario aplicado a cada línea.

#### Scenario: Cálculo del total
- **WHEN** el Vendedor agrega 2 unidades de un producto de $15.000 y 1 unidad de uno de $20.000
- **THEN** el POS muestra un total de $50.000

#### Scenario: Cambio de precio posterior
- **WHEN** el precio de un producto cambia después de una venta
- **THEN** la venta ya registrada conserva el precio unitario y el total originales

### Requirement: Venta registrada una sola vez
El sistema DEBE (SHALL) registrar cada venta POS una única vez, aunque el Vendedor confirme varias veces o la conexión falle durante el envío.

#### Scenario: Doble confirmación
- **WHEN** el Vendedor pulsa confirmar dos veces seguidas en la misma venta
- **THEN** se registra una sola venta y el stock se descuenta una sola vez

#### Scenario: Falla de conexión
- **WHEN** la conexión falla al confirmar y el Vendedor reintenta
- **THEN** el POS muestra la venta ya registrada si el primer envío había tenido éxito, en lugar de crear otra

### Requirement: CU-07 Emitir comprobante
El sistema DEBE (SHALL) emitir, como parte del registro de cada venta POS, un comprobante interno con número de venta, fecha, vendedor, detalle de productos, medio de pago y total, indicando de forma visible que no es un documento tributario.

#### Scenario: Comprobante tras la venta
- **WHEN** una venta POS se registra correctamente
- **THEN** el POS muestra el comprobante listo para imprimir

#### Scenario: Envío por correo
- **WHEN** el Vendedor ingresa el correo del comprador y solicita enviar el comprobante
- **THEN** el sistema envía el comprobante a ese correo

#### Scenario: Reimpresión
- **WHEN** un Vendedor o el Gerente consulta una venta POS ya registrada
- **THEN** puede volver a obtener el mismo comprobante

#### Scenario: Venta rechazada
- **WHEN** una venta no llega a registrarse
- **THEN** no se emite ningún comprobante

### Requirement: Consulta de ventas del POS
El sistema DEBE (SHALL) permitir que un Vendedor consulte las ventas POS que él registró y que el Gerente consulte todas, con su detalle.

#### Scenario: Vendedor consulta sus ventas
- **WHEN** un Vendedor consulta las ventas del día
- **THEN** el sistema muestra las ventas POS que él registró

#### Scenario: Gerente consulta todas las ventas
- **WHEN** el Gerente consulta las ventas de un periodo
- **THEN** el sistema muestra las ventas de todos los vendedores y de ambos canales
