# Spec Delta

## Purpose

Gestiona el envío de los pedidos del e-commerce: cotiza el flete con Starken, genera los despachos, sigue su estado y mantiene la operación funcionando aunque el servicio de Starken falle temporalmente.

## ADDED Requirements

### Requirement: Cotización de flete en tiempo real
El sistema DEBE (SHALL) calcular el flete de una compra consultando a Starken con la comuna de destino y el peso y volumen totales de los productos, para destinos en Santiago y en regiones.

#### Scenario: Destino en Santiago
- **WHEN** el Cliente indica una comuna de Santiago
- **THEN** el sistema muestra el flete cotizado para ese destino según el peso y volumen del carrito

#### Scenario: Destino en regiones
- **WHEN** el Cliente indica una comuna de otra región
- **THEN** el sistema muestra el flete cotizado para ese destino según el peso y volumen del carrito

#### Scenario: Cambio en el carrito
- **WHEN** el Cliente cambia los productos o la comuna después de cotizar
- **THEN** el sistema vuelve a calcular el flete

#### Scenario: Comuna sin cobertura
- **WHEN** Starken informa que no tiene cobertura para la comuna indicada
- **THEN** el sistema informa que no hay despacho a ese destino y no permite continuar al pago

### Requirement: Cotización tolerante a la caída de Starken
El sistema DEBE (SHALL) seguir entregando un valor de flete cuando Starken no responde, usando la última tarifa conocida para ese destino y tramo de peso y volumen o, si no existe, una tarifa de respaldo configurada por zona.

#### Scenario: Starken caído con tarifa conocida
- **WHEN** Starken no responde y existe una tarifa guardada para ese destino y tramo
- **THEN** el sistema usa la tarifa guardada y el Cliente puede completar la compra

#### Scenario: Starken caído sin tarifa conocida
- **WHEN** Starken no responde y no existe tarifa guardada para ese destino y tramo
- **THEN** el sistema usa la tarifa de respaldo de la zona del destino

#### Scenario: Flete cobrado
- **WHEN** el Cliente paga una compra
- **THEN** el flete cobrado es el que se mostró en el resumen, aunque la tarifa de Starken cambie después

### Requirement: CU-11 Generar despacho vía Starken
El sistema DEBE (SHALL) permitir que un Vendedor genere el despacho de un pedido pagado mediante Starken, guardando el número de seguimiento y marcando el pedido como despachado.

#### Scenario: Despacho generado
- **WHEN** un Vendedor genera el despacho de un pedido pagado
- **THEN** el sistema registra la orden en Starken, guarda el número de seguimiento, marca el pedido como despachado y registra la fecha y hora

#### Scenario: Aviso al Cliente
- **WHEN** un pedido queda despachado
- **THEN** el sistema envía al Cliente un correo con el número de seguimiento

#### Scenario: Pedido no pagado
- **WHEN** se intenta generar el despacho de un pedido cuya compra no está pagada
- **THEN** el sistema rechaza la operación

#### Scenario: Despacho ya generado
- **WHEN** se intenta generar el despacho de un pedido que ya tiene uno
- **THEN** el sistema no crea otro y muestra el despacho existente

#### Scenario: Rol sin permiso
- **WHEN** un Cliente o un usuario RRHH intenta generar un despacho
- **THEN** el sistema rechaza la operación

### Requirement: Reintento automático de despachos
El sistema DEBE (SHALL) dejar el despacho como pendiente de emisión cuando Starken no responde, y reintentar automáticamente hasta emitirlo, sin que el Vendedor deba repetir la operación.

#### Scenario: Starken caído al generar el despacho
- **WHEN** un Vendedor genera un despacho y Starken no responde
- **THEN** el pedido queda con el despacho pendiente de emisión y el Vendedor es informado de que se reintentará

#### Scenario: Starken se recupera
- **WHEN** Starken vuelve a responder
- **THEN** el sistema emite el despacho pendiente, guarda el número de seguimiento y marca el pedido como despachado

#### Scenario: Reintentos agotados
- **WHEN** el despacho sigue sin emitirse tras el máximo de reintentos
- **THEN** el pedido queda marcado para atención manual y visible para el Vendedor y el Gerente

#### Scenario: Reintento sin duplicar
- **WHEN** un reintento ocurre después de que Starken sí había registrado la orden
- **THEN** el pedido queda con una sola orden de despacho

### Requirement: Estados del pedido
El sistema DEBE (SHALL) mantener cada pedido en uno de los estados pagado, en preparación, despacho pendiente, despachado o entregado, y registrar la fecha y hora de cada cambio.

#### Scenario: Pedido nuevo
- **WHEN** se crea un pedido tras el pago
- **THEN** el pedido queda en estado pagado

#### Scenario: Preparación
- **WHEN** un Vendedor o un usuario de Bodega marca un pedido como en preparación
- **THEN** el pedido cambia a ese estado y registra quién lo cambió y cuándo

### Requirement: Actualización del seguimiento
El sistema DEBE (SHALL) actualizar periódicamente el estado de seguimiento de los pedidos despachados consultando a Starken, y marcar el pedido como entregado cuando Starken informa la entrega.

#### Scenario: Cambio de estado en tránsito
- **WHEN** Starken informa un nuevo estado para un despacho
- **THEN** el pedido muestra ese estado al Cliente y al personal

#### Scenario: Entrega
- **WHEN** Starken informa que el despacho fue entregado
- **THEN** el pedido pasa a estado entregado

#### Scenario: Starken caído al consultar
- **WHEN** Starken no responde al consultar el seguimiento
- **THEN** el pedido conserva el último estado conocido y la consulta se reintenta más tarde

### Requirement: Pedidos por preparar
El sistema DEBE (SHALL) mostrar a Vendedor y Bodega la lista de pedidos pendientes de despacho, del más antiguo al más reciente, con sus productos y el tiempo transcurrido desde el pago.

#### Scenario: Lista de pendientes
- **WHEN** un Vendedor o un usuario de Bodega abre los pedidos pendientes
- **THEN** el sistema muestra los pedidos pagados o en preparación, con el más antiguo primero

#### Scenario: Pedido cerca de las 24 horas
- **WHEN** un pedido lleva más de 18 horas pagado sin despacharse
- **THEN** la lista lo destaca como urgente

### Requirement: Costo real del despacho
El sistema DEBE (SHALL) guardar en cada pedido el flete cobrado al Cliente y el costo que Starken cobra a la tienda por el despacho, para usarlos en el cálculo de rentabilidad.

#### Scenario: Costo registrado
- **WHEN** se emite un despacho
- **THEN** el pedido conserva el flete cobrado al Cliente y el costo informado por Starken
