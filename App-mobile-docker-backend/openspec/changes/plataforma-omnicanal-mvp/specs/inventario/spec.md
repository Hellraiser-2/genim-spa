# Spec Delta

## Purpose

Es la fuente única de verdad del stock: lleva las existencias de cada variante por ubicación, registra todo movimiento con su responsable y motivo, e impide que cualquier canal venda unidades que no existen.

## ADDED Requirements

### Requirement: Stock por variante y ubicación
El sistema DEBE (SHALL) llevar las existencias de cada variante por separado en dos ubicaciones, bodega y sala de ventas. La disponibilidad de una variante es la suma de sus existencias menos las unidades reservadas, y ninguna existencia puede ser negativa.

#### Scenario: Consulta de stock
- **WHEN** un Vendedor, un usuario de Bodega o el Gerente consulta una variante
- **THEN** el sistema muestra sus existencias en bodega, en sala de ventas, las unidades reservadas y la disponibilidad

#### Scenario: Existencia nunca negativa
- **WHEN** una operación dejaría una existencia por debajo de cero
- **THEN** el sistema rechaza la operación completa

### Requirement: Descuento atómico y sin sobreventa
El sistema DEBE (SHALL) descontar o reservar el stock de todas las líneas de una venta en una sola operación indivisible, y rechazar la venta completa si alguna línea supera la disponibilidad. Ningún canal puede vender unidades no disponibles.

#### Scenario: Venta con stock suficiente
- **WHEN** se confirma una venta cuyas líneas tienen disponibilidad suficiente
- **THEN** el stock de todas las líneas se descuenta o reserva junto

#### Scenario: Una línea sin stock
- **WHEN** se confirma una venta de dos variantes y una de ellas no tiene disponibilidad suficiente
- **THEN** la venta se rechaza y el stock de ninguna variante cambia

#### Scenario: POS y e-commerce compiten por la última unidad
- **WHEN** el POS y el e-commerce intentan vender al mismo tiempo la única unidad disponible de una variante
- **THEN** exactamente una de las dos operaciones tiene éxito y la otra se rechaza por falta de stock

#### Scenario: POS no puede vender unidades reservadas
- **WHEN** el POS intenta vender una unidad que está reservada para un pedido del e-commerce
- **THEN** el sistema rechaza la venta por falta de disponibilidad

### Requirement: Reserva de stock durante el pago en línea
El sistema DEBE (SHALL) reservar el stock de una compra del e-commerce al iniciar el pago, mantener la reserva por un tiempo limitado, dejarla firme si el pago se confirma y liberarla si el pago falla o el tiempo se agota.

#### Scenario: Pago confirmado
- **WHEN** el pago de una compra con reserva vigente se confirma
- **THEN** la reserva queda firme hasta que el pedido se despacha

#### Scenario: Pago fallido
- **WHEN** el pago de una compra falla o es abandonado
- **THEN** la reserva se libera y las unidades vuelven a estar disponibles

#### Scenario: Reserva vencida
- **WHEN** se cumple el tiempo límite de una reserva sin que el pago se confirme
- **THEN** la reserva se libera automáticamente

#### Scenario: Despacho del pedido
- **WHEN** se despacha un pedido con reserva firme
- **THEN** las unidades se descuentan de la existencia física, la reserva termina y queda un movimiento de tipo despacho

### Requirement: Registro de todo movimiento de inventario
El sistema DEBE (SHALL) registrar cada cambio de stock como un movimiento con tipo (ingreso, venta, devolución, despacho, merma, traspaso o ajuste), variante, ubicación, cantidad, fecha y hora, usuario responsable y motivo. Los movimientos no pueden editarse ni eliminarse.

#### Scenario: Movimiento registrado
- **WHEN** cualquier operación cambia el stock de una variante
- **THEN** existe un movimiento con su tipo, cantidad, fecha, responsable y motivo

#### Scenario: Historial de una variante
- **WHEN** un usuario de Bodega o el Gerente consulta el historial de una variante
- **THEN** el sistema muestra sus movimientos del más reciente al más antiguo, con filtros por tipo y rango de fechas

#### Scenario: Corrección de un error
- **WHEN** se necesita corregir un movimiento equivocado
- **THEN** la corrección se hace con un movimiento nuevo y el original permanece en el historial

### Requirement: CU-08 Actualizar inventario
El sistema DEBE (SHALL) permitir que Vendedor y Bodega actualicen el inventario mediante traspasos entre ubicaciones y ajustes por conteo físico, y que el Vendedor registre devoluciones de ventas. Toda actualización exige un motivo.

#### Scenario: Traspaso entre ubicaciones
- **WHEN** un usuario autorizado traspasa 3 unidades de una variante de bodega a sala de ventas
- **THEN** la existencia de bodega baja en 3, la de sala de ventas sube en 3 y la disponibilidad total no cambia

#### Scenario: Traspaso sin existencia suficiente
- **WHEN** se intenta traspasar más unidades de las que hay en la ubicación de origen
- **THEN** el sistema rechaza el traspaso

#### Scenario: Ajuste por conteo
- **WHEN** un usuario autorizado registra que contó 7 unidades de una variante en una ubicación donde el sistema indica 10
- **THEN** la existencia pasa a 7 y queda un movimiento de ajuste de -3 con su motivo

#### Scenario: Devolución de una venta
- **WHEN** un Vendedor registra la devolución de una unidad vendida, indicando la venta y el motivo
- **THEN** la existencia de la sala de ventas sube en 1 y queda un movimiento de devolución asociado a esa venta

#### Scenario: Devolución mayor a lo vendido
- **WHEN** se intenta devolver más unidades de una variante que las vendidas en la venta indicada
- **THEN** el sistema rechaza la devolución

#### Scenario: Actualización sin motivo
- **WHEN** se intenta registrar un traspaso, ajuste o devolución sin motivo
- **THEN** el sistema no lo registra y solicita el motivo

### Requirement: CU-09 Registrar ingreso de mercadería
El sistema DEBE (SHALL) permitir que Bodega registre el ingreso de mercadería indicando variante, cantidad entera mayor que cero y ubicación de destino. El ingreso aumenta la existencia de esa ubicación.

#### Scenario: Ingreso correcto
- **WHEN** un usuario de Bodega registra un ingreso de 12 unidades de una variante en bodega
- **THEN** la existencia en bodega sube en 12 y queda un movimiento de ingreso con el usuario como responsable

#### Scenario: Ingreso de varias variantes
- **WHEN** un usuario de Bodega registra en una misma recepción varias variantes con sus cantidades
- **THEN** el sistema registra un movimiento de ingreso por cada variante

#### Scenario: Cantidad no válida
- **WHEN** se indica una cantidad cero, negativa o no entera
- **THEN** el sistema no registra el ingreso y señala la cantidad como no válida

#### Scenario: Rol sin permiso
- **WHEN** un Vendedor intenta registrar un ingreso de mercadería
- **THEN** el sistema rechaza la operación

### Requirement: CU-10 Escanear QR o código de barras
El sistema DEBE (SHALL) permitir que Bodega escanee con la cámara el QR o código de barras de una prenda para identificar su variante, como alternativa a buscarla manualmente al registrar ingresos, mermas, traspasos y conteos.

#### Scenario: Escaneo durante un ingreso
- **WHEN** un usuario de Bodega escanea una prenda mientras registra un ingreso
- **THEN** la app agrega esa variante al ingreso, o suma una unidad si ya estaba agregada

#### Scenario: Código desconocido
- **WHEN** se escanea un código que no pertenece a ninguna variante
- **THEN** la app informa que el código no está registrado y no modifica el stock

#### Scenario: Consulta por escaneo
- **WHEN** se escanea una prenda fuera de una operación
- **THEN** la app muestra la variante con sus existencias por ubicación y su estado

#### Scenario: Cámara no disponible
- **WHEN** el permiso de cámara se deniega o el escáner no está disponible
- **THEN** la app permite buscar la variante por SKU o nombre

### Requirement: Registro de mermas
El sistema DEBE (SHALL) permitir que Bodega registre mermas desde la app indicando variante, ubicación, cantidad, un tipo entre "dañado", "muestra" y "cambio", y un motivo obligatorio. Cada merma descuenta stock.

#### Scenario: Merma correcta
- **WHEN** un usuario de Bodega registra una merma de 2 unidades de tipo "dañado" con su motivo
- **THEN** la existencia de esa ubicación baja en 2 y queda un movimiento de merma con tipo, motivo y responsable

#### Scenario: Merma sin motivo o sin tipo
- **WHEN** se intenta registrar una merma sin motivo o sin uno de los tres tipos
- **THEN** el sistema no la registra e indica el dato faltante

#### Scenario: Merma mayor a la existencia
- **WHEN** la cantidad de la merma supera la existencia de la ubicación
- **THEN** el sistema rechaza la merma

#### Scenario: Merma sobre unidades reservadas
- **WHEN** una merma dejaría la existencia total por debajo de las unidades reservadas
- **THEN** el sistema rechaza la merma e informa que hay unidades comprometidas en pedidos

### Requirement: Operaciones sin duplicados
El sistema DEBE (SHALL) registrar cada operación de inventario una sola vez, aunque el cliente la reenvíe por una falla de conexión o una doble confirmación.

#### Scenario: Reintento tras falla de conexión
- **WHEN** la app reenvía un ingreso cuyo primer envío sí había sido registrado
- **THEN** el stock refleja el ingreso una sola vez

#### Scenario: Falla sin registro
- **WHEN** una operación no llega a registrarse por una falla de conexión
- **THEN** la app informa que no se confirmó, conserva los datos ingresados y permite reintentar

### Requirement: Medición del tiempo de búsqueda de producto
El sistema DEBE (SHALL) registrar cuánto tarda el personal en ubicar una prenda, midiendo el tiempo entre que inicia la búsqueda de una variante y que confirma haberla encontrado escaneándola.

#### Scenario: Búsqueda completada
- **WHEN** un usuario inicia la búsqueda de una variante y luego escanea una prenda de esa variante
- **THEN** el sistema registra la duración de la búsqueda

#### Scenario: Búsqueda abandonada
- **WHEN** un usuario inicia una búsqueda y la cancela sin escanear la prenda
- **THEN** el sistema no registra una duración para esa búsqueda

### Requirement: Carga inicial del inventario
El sistema DEBE (SHALL) ofrecer un proceso de carga inicial que importe productos y variantes desde un archivo, registre las existencias mediante un conteo físico y un segundo conteo de validación hecho por otra persona, y solo permita activar las ventas cuando no queden diferencias sin resolver.

#### Scenario: Importación válida
- **WHEN** el Gerente importa un archivo de productos y variantes sin errores
- **THEN** el sistema crea los productos y variantes con stock cero y permite generar sus etiquetas

#### Scenario: Importación con errores
- **WHEN** el archivo contiene filas con datos faltantes o variantes repetidas
- **THEN** el sistema no importa nada e informa cada fila con su error

#### Scenario: Conteos coincidentes
- **WHEN** el primer conteo y el conteo de validación de una variante coinciden
- **THEN** esa cantidad queda como existencia inicial de la variante

#### Scenario: Conteos con diferencia
- **WHEN** el conteo de validación de una variante difiere del primero
- **THEN** la variante queda marcada con diferencia hasta que un tercer conteo la resuelva

#### Scenario: Validación por la misma persona
- **WHEN** el usuario que hizo el primer conteo de una variante intenta hacer su conteo de validación
- **THEN** el sistema lo rechaza

#### Scenario: Activación con diferencias pendientes
- **WHEN** el Gerente intenta activar el sistema y existen variantes con diferencias sin resolver
- **THEN** el sistema no se activa e informa cuáles variantes están pendientes

#### Scenario: Ventas antes de la activación
- **WHEN** el sistema aún no ha sido activado
- **THEN** ni el POS ni el e-commerce permiten registrar ventas
