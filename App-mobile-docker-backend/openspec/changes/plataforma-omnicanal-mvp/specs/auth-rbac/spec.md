# Spec Delta

## Purpose

Identifica a cada persona que usa la plataforma y limita lo que puede ver y hacer según su rol, de modo que clientes, vendedores, bodega, gerencia y RRHH accedan solo a lo que necesitan.

## ADDED Requirements

### Requirement: Registro de clientes
El sistema DEBE (SHALL) permitir que una persona cree su propia cuenta de Cliente en el e-commerce con nombre, correo electrónico y contraseña. El registro público nunca crea cuentas con otro rol.

#### Scenario: Registro correcto
- **WHEN** una persona se registra con un correo no usado y una contraseña válida
- **THEN** el sistema crea una cuenta con rol Cliente y la deja con sesión iniciada

#### Scenario: Correo ya registrado
- **WHEN** una persona se registra con un correo que ya pertenece a otra cuenta
- **THEN** el sistema no crea la cuenta e informa que el correo ya está en uso

#### Scenario: Intento de registrar otro rol
- **WHEN** una solicitud de registro público indica un rol distinto de Cliente
- **THEN** el sistema ignora ese rol y crea la cuenta como Cliente

### Requirement: Inicio de sesión
El sistema DEBE (SHALL) permitir iniciar sesión con correo y contraseña en los tres clientes, y no revelar si el dato incorrecto fue el correo o la contraseña.

#### Scenario: Credenciales correctas
- **WHEN** un usuario activo ingresa su correo y contraseña correctos
- **THEN** el sistema inicia la sesión y muestra la pantalla inicial que corresponde a su rol

#### Scenario: Credenciales incorrectas
- **WHEN** el correo o la contraseña no coinciden con una cuenta
- **THEN** el sistema rechaza el ingreso con un mensaje genérico de credenciales no válidas

#### Scenario: Cuenta desactivada
- **WHEN** un usuario desactivado intenta iniciar sesión
- **THEN** el sistema rechaza el ingreso

### Requirement: Manejo de la sesión
El sistema DEBE (SHALL) mantener la sesión del usuario entre visitas, cerrarla cuando expira o cuando el usuario lo solicita, y exigir un nuevo inicio de sesión después.

#### Scenario: Sesión vigente
- **WHEN** un usuario con sesión vigente vuelve a abrir el cliente
- **THEN** el sistema no le pide credenciales nuevamente

#### Scenario: Sesión expirada
- **WHEN** un usuario realiza una acción con una sesión expirada o no válida
- **THEN** el sistema rechaza la acción y le pide iniciar sesión

#### Scenario: Cierre de sesión
- **WHEN** un usuario cierra su sesión
- **THEN** las credenciales de esa sesión dejan de ser aceptadas

### Requirement: Cuentas internas con un único rol
El sistema DEBE (SHALL) permitir que solo el Gerente cree, modifique y desactive cuentas de Vendedor, Bodega, Gerente/Finanzas y RRHH. Cada cuenta tiene exactamente un rol y credenciales propias.

#### Scenario: Gerente crea una cuenta interna
- **WHEN** el Gerente crea una cuenta indicando nombre, correo y rol Bodega
- **THEN** la cuenta queda creada con ese único rol y puede iniciar sesión en la app de bodega

#### Scenario: Otro rol intenta crear cuentas
- **WHEN** un usuario que no es Gerente intenta crear o modificar una cuenta interna
- **THEN** el sistema rechaza la operación

#### Scenario: Desactivar una cuenta
- **WHEN** el Gerente desactiva una cuenta interna
- **THEN** esa cuenta no puede iniciar sesión y sus sesiones abiertas dejan de ser válidas

### Requirement: Control de acceso por rol
El sistema DEBE (SHALL) autorizar cada operación según el rol del usuario y rechazar las que no le corresponden, sin importar desde qué cliente se soliciten.

#### Scenario: Cliente
- **WHEN** un Cliente usa la plataforma
- **THEN** puede consultar el catálogo, gestionar su carrito, pagar y ver solo sus propios pedidos

#### Scenario: Vendedor
- **WHEN** un Vendedor usa la plataforma
- **THEN** puede registrar ventas POS, emitir comprobantes, consultar stock, actualizar inventario y generar despachos, y no puede ver el dashboard ni costos de compra

#### Scenario: Bodega
- **WHEN** un usuario de Bodega usa la plataforma
- **THEN** puede registrar ingresos, mermas, traspasos y conteos y escanear productos, y no puede registrar ventas ni ver el dashboard

#### Scenario: Gerente/Finanzas
- **WHEN** un Gerente usa la plataforma
- **THEN** puede consultar el dashboard, las transacciones y los movimientos, y administrar usuarios, precios y costos

#### Scenario: Operación no permitida
- **WHEN** un usuario solicita una operación que su rol no tiene permitida
- **THEN** el sistema la rechaza sin ejecutar ningún cambio ni devolver los datos solicitados

#### Scenario: Solicitud sin sesión
- **WHEN** se solicita una operación protegida sin una sesión válida
- **THEN** el sistema la rechaza y pide iniciar sesión

### Requirement: Acceso restringido de RRHH
El sistema DEBE (SHALL) limitar al rol RRHH a consultar la lista de cuentas internas (nombre, correo, rol y estado), sin acceso a métricas, ventas, pagos, inventario ni ningún movimiento de dinero.

#### Scenario: RRHH consulta el personal
- **WHEN** un usuario RRHH consulta las cuentas internas
- **THEN** el sistema muestra nombre, correo, rol y estado de cada cuenta interna, sin permitir modificarlas

#### Scenario: RRHH intenta ver métricas o dinero
- **WHEN** un usuario RRHH solicita el dashboard, ventas, transacciones de pago o movimientos de inventario
- **THEN** el sistema rechaza la solicitud

### Requirement: Aislamiento de los datos de cada cliente
El sistema DEBE (SHALL) impedir que un Cliente vea o modifique compras, pedidos o datos personales de otro Cliente.

#### Scenario: Pedido ajeno
- **WHEN** un Cliente solicita un pedido que pertenece a otra cuenta
- **THEN** el sistema responde como si el pedido no existiera
