# Spec Delta

## Purpose

Gestiona el cobro de las compras: procesa los pagos en línea con Webpay, deja registro de cada transacción exitosa o fallida, devuelve el dinero cuando una compra pagada no puede completarse y registra los pagos presenciales del POS.

## ADDED Requirements

### Requirement: CU-04 Realizar pago con Webpay
El sistema DEBE (SHALL) permitir que el Cliente pague su compra con Webpay por el total exacto del resumen, y confirmar la compra solo cuando Webpay informa que el pago fue autorizado.

#### Scenario: Pago autorizado
- **WHEN** el Cliente completa el pago en Webpay y este lo autoriza
- **THEN** la compra queda pagada y el Cliente ve la confirmación de su pedido

#### Scenario: Monto cobrado
- **WHEN** se inicia un pago
- **THEN** el monto enviado a Webpay es igual al total de productos más flete mostrado en el resumen

#### Scenario: Webpay no disponible
- **WHEN** no es posible iniciar el pago porque Webpay no responde
- **THEN** el sistema informa que el pago no está disponible, libera el stock reservado y conserva el carrito

### Requirement: Pago rechazado o abandonado
El sistema DEBE (SHALL) dejar la compra sin efecto cuando Webpay rechaza el pago o el Cliente lo abandona: la compra no se confirma, el stock reservado se libera y el Cliente puede reintentar.

#### Scenario: Pago rechazado
- **WHEN** Webpay rechaza el pago
- **THEN** el sistema informa al Cliente que el pago fue rechazado, libera la reserva y conserva el carrito

#### Scenario: Pago anulado por el Cliente
- **WHEN** el Cliente anula el pago en la página de Webpay
- **THEN** el sistema informa que el pago no se realizó, libera la reserva y conserva el carrito

#### Scenario: Cliente no regresa de Webpay
- **WHEN** el Cliente no vuelve desde Webpay dentro del tiempo límite
- **THEN** el sistema consulta el resultado del pago a Webpay y resuelve la compra según ese resultado

### Requirement: Reverso automático
El sistema DEBE (SHALL) devolver automáticamente el dinero cuando Webpay autorizó un pago pero la compra no pudo confirmarse, y dejar constancia del reverso.

#### Scenario: Pago autorizado sin stock confirmable
- **WHEN** Webpay autoriza un pago pero la reserva de stock de esa compra ya no puede confirmarse
- **THEN** el sistema reversa el pago, deja la compra como reversada e informa al Cliente que no se le cobró

#### Scenario: Reverso que falla
- **WHEN** el reverso automático no puede completarse
- **THEN** el sistema lo reintenta y, si sigue fallando, deja la transacción marcada para revisión del Gerente

### Requirement: Registro de transacciones
El sistema DEBE (SHALL) registrar cada intento de pago con su compra, monto, fecha, estado (autorizado, rechazado, anulado, expirado o reversado), código de autorización y tipo de pago cuando existan. Las transacciones fallidas también se registran.

#### Scenario: Transacción fallida registrada
- **WHEN** un pago es rechazado, anulado o expira
- **THEN** existe un registro de la transacción con su estado y el motivo informado por Webpay

#### Scenario: Consulta por el Gerente
- **WHEN** el Gerente consulta las transacciones de un periodo
- **THEN** el sistema muestra todas, exitosas y fallidas, con su estado y la compra asociada

#### Scenario: Acceso restringido
- **WHEN** un usuario que no es Gerente solicita el listado de transacciones
- **THEN** el sistema rechaza la solicitud

### Requirement: Confirmación única del pago
El sistema DEBE (SHALL) procesar el resultado de cada pago una sola vez, de modo que recargar la página de retorno o recibir el resultado repetido no genere otro cobro, otra venta ni otro pedido.

#### Scenario: Recarga de la página de retorno
- **WHEN** el Cliente recarga la página de retorno de un pago ya confirmado
- **THEN** el sistema muestra el mismo pedido sin crear otra venta ni otro pedido

### Requirement: Protección de los datos de tarjeta
El sistema NO DEBE (MUST NOT) solicitar, transmitir ni almacenar números de tarjeta ni códigos de seguridad; esos datos se ingresan únicamente en la página de Webpay.

#### Scenario: Ingreso de la tarjeta
- **WHEN** el Cliente va a pagar
- **THEN** es dirigido a la página de Webpay para ingresar los datos de su tarjeta

### Requirement: Comisión del medio de pago
El sistema DEBE (SHALL) calcular y guardar la comisión de cada pago autorizado según el tipo de pago y las tasas configuradas por el Gerente, para usarla en el cálculo de rentabilidad.

#### Scenario: Comisión de un pago con crédito
- **WHEN** se autoriza un pago de $50.000 con un tipo de pago cuya tasa configurada es 2%
- **THEN** la transacción queda con una comisión de $1.000

#### Scenario: Cambio de tasa
- **WHEN** el Gerente modifica una tasa de comisión
- **THEN** la tasa nueva se aplica a los pagos posteriores y los anteriores conservan su comisión

### Requirement: Registro de pagos presenciales
El sistema DEBE (SHALL) registrar el pago de cada venta POS con su medio (efectivo, débito o crédito), monto y comisión, sin procesar el cobro: el cobro con tarjeta en tienda se hace en el terminal físico de la tienda.

#### Scenario: Venta POS en efectivo
- **WHEN** se registra una venta POS pagada en efectivo
- **THEN** queda un registro de pago por el total con comisión cero

#### Scenario: Venta POS con tarjeta
- **WHEN** se registra una venta POS pagada con débito o crédito
- **THEN** queda un registro de pago por el total con la comisión de la tasa configurada para ese medio
