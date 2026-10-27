# Spec Delta

## Purpose

Permite a los clientes comprar por la web: armar un carrito, completar los datos de despacho, iniciar el pago y luego consultar el estado y el seguimiento de sus pedidos, desde cualquier tamaño de pantalla.

## ADDED Requirements

### Requirement: CU-03 Gestionar carrito
El sistema DEBE (SHALL) permitir que un visitante agregue variantes a un carrito, cambie cantidades, quite productos y vea el total, sin exigir sesión. La cantidad de cada variante no puede superar su disponibilidad y el carrito se conserva en el dispositivo entre visitas.

#### Scenario: Agregar al carrito
- **WHEN** el visitante agrega una variante disponible
- **THEN** el carrito la muestra con su precio, cantidad y subtotal, y actualiza el total

#### Scenario: Cambiar cantidad
- **WHEN** el visitante cambia la cantidad de una línea a un valor dentro de la disponibilidad
- **THEN** el carrito actualiza el subtotal de la línea y el total

#### Scenario: Cantidad mayor a la disponibilidad
- **WHEN** el visitante pide más unidades de las disponibles
- **THEN** el carrito limita la cantidad a la disponibilidad e informa el motivo

#### Scenario: Quitar producto
- **WHEN** el visitante quita una línea
- **THEN** la línea desaparece y el total se actualiza

#### Scenario: Carrito conservado
- **WHEN** el visitante cierra el navegador y vuelve más tarde desde el mismo dispositivo
- **THEN** el carrito conserva sus productos

#### Scenario: Producto agotado mientras estaba en el carrito
- **WHEN** el visitante abre su carrito y una variante ya no tiene disponibilidad o cambió de precio
- **THEN** el carrito muestra la disponibilidad y el precio actuales e indica qué cambió

### Requirement: Checkout con datos de despacho
El sistema DEBE (SHALL) exigir una sesión de Cliente para pagar, solicitar destinatario, teléfono, región, comuna y dirección, y mostrar antes del pago un resumen con productos, flete y total.

#### Scenario: Visitante sin sesión
- **WHEN** un visitante sin sesión inicia el checkout
- **THEN** el sistema le pide iniciar sesión o registrarse y luego continúa con el mismo carrito

#### Scenario: Resumen antes de pagar
- **WHEN** el Cliente completa los datos de despacho
- **THEN** el sistema muestra el detalle de productos, el costo de flete y el total a pagar

#### Scenario: Datos de despacho incompletos
- **WHEN** falta alguno de los datos de despacho obligatorios
- **THEN** el sistema no permite continuar al pago e indica el dato faltante

### Requirement: Inicio del pago con stock reservado
El sistema DEBE (SHALL) verificar y reservar el stock de todo el carrito al iniciar el pago, y no iniciar el pago si alguna variante no tiene disponibilidad suficiente.

#### Scenario: Stock disponible
- **WHEN** el Cliente confirma el resumen y todo el carrito tiene disponibilidad
- **THEN** el sistema reserva las unidades y lo dirige al pago

#### Scenario: Stock insuficiente al pagar
- **WHEN** el Cliente confirma el resumen y una variante ya no tiene disponibilidad suficiente
- **THEN** el sistema no inicia el pago, no reserva nada e indica qué producto debe ajustar

### Requirement: Creación del pedido tras el pago
El sistema DEBE (SHALL) crear un pedido asociado a la venta cuando el pago se confirma, vaciar el carrito y mostrar al Cliente la confirmación con el número de pedido.

#### Scenario: Pago confirmado
- **WHEN** el pago de una compra se confirma
- **THEN** la venta queda registrada con canal e-commerce, se crea su pedido y el Cliente ve la confirmación con el número de pedido

#### Scenario: Correo de confirmación
- **WHEN** se crea un pedido
- **THEN** el sistema envía al Cliente un correo con el número de pedido y el detalle de la compra

#### Scenario: Pago no confirmado
- **WHEN** el pago falla o es abandonado
- **THEN** no se crea ningún pedido y el carrito conserva sus productos

### Requirement: CU-05 Consultar pedido y tracking
El sistema DEBE (SHALL) permitir que el Cliente consulte, tras pagar, la lista de sus pedidos y el detalle de cada uno con su estado y, cuando exista, el número y el estado de seguimiento del despacho.

#### Scenario: Lista de pedidos
- **WHEN** el Cliente abre sus pedidos
- **THEN** el sistema muestra sus pedidos del más reciente al más antiguo con fecha, total y estado

#### Scenario: Pedido aún no despachado
- **WHEN** el Cliente abre un pedido pagado que todavía no se despacha
- **THEN** el sistema muestra el estado del pedido e indica que aún no tiene seguimiento

#### Scenario: Pedido despachado
- **WHEN** el Cliente abre un pedido despachado
- **THEN** el sistema muestra el número de seguimiento y el último estado informado por el transportista

### Requirement: Uso en cualquier tamaño de pantalla
El e-commerce DEBE (SHALL) permitir completar la consulta del catálogo, el carrito, el checkout y la consulta de pedidos tanto en teléfonos como en computadores, sin desplazamiento horizontal.

#### Scenario: Compra desde un teléfono
- **WHEN** un Cliente realiza una compra completa desde una pantalla de 360 px de ancho
- **THEN** puede completar todos los pasos sin desplazamiento horizontal ni controles inaccesibles

### Requirement: Registro de visitas
El e-commerce DEBE (SHALL) registrar cada visita al sitio de forma anónima, para poder calcular la conversión de visitas en compras.

#### Scenario: Visita registrada
- **WHEN** un visitante abre el e-commerce
- **THEN** el sistema registra una visita sin datos personales

#### Scenario: Navegación dentro de la misma visita
- **WHEN** el visitante recorre varias páginas durante la misma visita
- **THEN** el sistema cuenta una sola visita
