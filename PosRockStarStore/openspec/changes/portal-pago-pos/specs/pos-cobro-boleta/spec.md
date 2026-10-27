# Spec Delta

## Purpose

Cierra la venta del POS reutilizando el checkout existente de la plataforma, emite una boleta visible e imprimible y deja registro de la compra con el stock actualizado al instante.

## ADDED Requirements

### Requirement: Confirmación de la venta sobre el checkout existente

El sistema SHALL confirmar la venta ejecutando el flujo web en dos pasos (crear checkout con clave de idempotencia y resolver el pago) y tratar el stock insuficiente informado por la API como bloqueo con mensaje "Sin stock".

#### Scenario: Confirmación exitosa

- **WHEN** el vendedor confirma un carrito con stock disponible
- **THEN** el sistema crea la compra, resuelve el pago y descuenta el stock al instante

#### Scenario: Rechazo por stock en el servidor

- **WHEN** la API responde stock insuficiente para alguna línea
- **THEN** el sistema bloquea la venta, muestra "Sin stock" con el detalle de la línea y refresca la disponibilidad mostrada

#### Scenario: Reintento seguro ante fallo de red

- **WHEN** la confirmación se interrumpe por un fallo de red y el vendedor la reintenta
- **THEN** el sistema reutiliza la misma clave de idempotencia para no duplicar la compra

### Requirement: Medios de pago de caja

El sistema SHALL ofrecer pago al contado y pago con tarjeta por pasarela simulada; el pago al contado aprueba de inmediato y la tarjeta permite aprobar o simular el rechazo del banco.

#### Scenario: Pago al contado

- **WHEN** el vendedor elige contado y confirma
- **THEN** el sistema resuelve el pago como aprobado sin pasos adicionales

#### Scenario: Pago con tarjeta aprobado

- **WHEN** el vendedor elige tarjeta y el pago simulado se aprueba
- **THEN** el sistema registra la venta como pagada y genera su boleta

#### Scenario: Pago con tarjeta rechazado

- **WHEN** la pasarela simulada rechaza el pago
- **THEN** el sistema informa el rechazo con su motivo, conserva el carrito y no genera boleta

### Requirement: Boleta visible e imprimible

El sistema SHALL mostrar tras cada venta pagada una boleta con id de la compra, fecha, líneas (producto, cantidad, precio unitario, subtotal), total, medio de pago y giro del comercio, con acción de impresión.

#### Scenario: Emisión de boleta

- **WHEN** una venta queda pagada
- **THEN** la boleta aparece con todos sus datos y el carrito se vacía para la siguiente venta

#### Scenario: Impresión de boleta

- **WHEN** el vendedor solicita imprimir
- **THEN** el sistema envía a impresión solo el contenido de la boleta en formato legible

### Requirement: Registro de compras y refresco de stock

El sistema SHALL mantener un registro de las ventas de la jornada combinando el historial del backend con una copia local, y refrescar la disponibilidad del catálogo cada vez que se cierra una venta.

#### Scenario: Registro tras cerrar una venta

- **WHEN** una venta queda pagada o es rechazada
- **THEN** el registro muestra la venta con su estado y la disponibilidad del catálogo queda actualizada de inmediato

#### Scenario: Consulta del registro

- **WHEN** el vendedor abre el registro de la jornada
- **THEN** el sistema muestra las ventas con id, fecha, total, medio de pago y estado, de la más reciente a la más antigua

### Requirement: Métrica de aprobación

El sistema SHALL permitir registrar la totalidad de las ventas de la jornada de modo que el registro sustente la meta mensual de 378 clientes y el seguimiento del ticket promedio de $15.000.

#### Scenario: Cierre de jornada

- **WHEN** el vendedor revisa el registro al cerrar la caja
- **THEN** el sistema presenta el conteo de ventas y el total recaudado del período
