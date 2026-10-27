# Spec Delta

## Purpose

Permite al vendedor identificarse en el POS con las mismas cuentas y contratos de la plataforma Rockstar, y habilita la sesión de cliente que exige el checkout para cerrar ventas en caja.

## ADDED Requirements

### Requirement: Inicio de sesión del vendedor

El sistema SHALL autenticar al vendedor contra la API Rockstar con correo y contraseña y mantener su sesión durante la jornada de caja.

#### Scenario: Acceso con cuenta de vendedor

- **WHEN** el vendedor ingresa un correo y contraseña válidos de rol VENDEDOR, BODEGA o GERENTE
- **THEN** el sistema abre la vista POS y muestra el nombre del vendedor en la cabecera

#### Scenario: Credenciales inválidas

- **WHEN** el vendedor ingresa credenciales incorrectas o una cuenta inactiva
- **THEN** el sistema muestra el mensaje de error devuelto por la API sin abrir el POS

#### Scenario: Sesión expirada durante la jornada

- **WHEN** la API rechaza una petición por sesión inválida
- **THEN** el sistema redirige al inicio de sesión conservando el carrito actual en memoria

### Requirement: Sesión de cliente para el checkout

El sistema SHALL disponer de una sesión de rol CLIENTE vigente al momento de confirmar la venta, ya que el contrato `ventas/checkout` la exige.

#### Scenario: Venta con sesión de cliente disponible

- **WHEN** el vendedor confirma una venta y existe una sesión de cliente vigente en el POS
- **THEN** el sistema ejecuta el checkout con esa sesión sin pedir datos adicionales

#### Scenario: Venta sin sesión de cliente

- **WHEN** el vendedor confirma una venta y no hay sesión de cliente vigente
- **THEN** el sistema solicita identificar al cliente (inicio de sesión o registro exprés) antes de crear la compra, sin perder el carrito

### Requirement: Cierre de sesión

El sistema SHALL permitir al vendedor cerrar su sesión de caja de forma explícita.

#### Scenario: Cierre de turno

- **WHEN** el vendedor cierra sesión
- **THEN** el sistema invalida los tokens guardados, vacía el carrito y vuelve a la pantalla de acceso
