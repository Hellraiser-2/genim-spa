# Spec Delta

## MODIFIED Requirements

### Requirement: Inicio de sesión del vendedor

El sistema SHALL autenticar al vendedor contra la API Rockstar con correo y contraseña, mantener su sesión durante la jornada de caja, y persistir tokens en localStorage para sobrevivir a recargas de contenedor.

#### Scenario: Acceso con cuenta de vendedor
- **WHEN** el vendedor ingresa un correo y contraseña válidos de rol VENDEDOR, BODEGA o GERENTE
- **THEN** el sistema abre la vista POS y muestra el nombre del vendedor en la cabecera

#### Scenario: Credenciales inválidas
- **WHEN** el vendedor ingresa credenciales incorrectas o una cuenta inactiva
- **THEN** el sistema muestra el mensaje de error devuelto por la API sin abrir el POS

#### Scenario: Sesión expirada durante la jornada
- **WHEN** la API rechaza una petición por sesión inválida
- **THEN** el sistema redirige al inicio de sesión conservando el carrito actual en memoria

#### Scenario: Sesión persistente tras recarga de contenedor
- **WHEN** el usuario recarga la página (F5) o el contenedor se reinicia
- **THEN** el sistema restaura `accessToken` y `refreshToken` de localStorage, valida con `/salud` y mantiene sesión sin nuevo login

#### Scenario: Remember-me extiende sesión
- **WHEN** el vendedor marca "Recordarme" al iniciar sesión
- **THEN** el `refreshToken` se almacena con expiración 30 días y la sesión sobrevive al cierre completo del navegador

### Requirement: Sesión de cliente para el checkout

El sistema SHALL disponer de una sesión de rol CLIENTE vigente al momento de confirmar la venta, ya que el contrato `ventas/checkout` la exige.

#### Scenario: Venta con sesión de cliente disponible
- **WHEN** el vendedor confirma una venta y existe una sesión de cliente vigente en el POS
- **THEN** el sistema ejecuta el checkout con esa sesión sin pedir datos adicionales

#### Scenario: Venta sin sesión de cliente
- **WHEN** el vendedor confirma una venta y no hay sesión de cliente vigente
- **THEN** el sistema solicita identificar al cliente (inicio de sesión o registro exprés) antes de crear la compra, sin perder el carrito

#### Scenario: Login cliente con validación visual
- **WHEN** el vendedor ingresa credenciales de cliente en modal
- **THEN** validación en tiempo real (email formato, password strength), error inline si API rechaza

### Requirement: Cierre de sesión

El sistema SHALL permitir al vendedor cerrar su sesión de caja de forma explícita.

#### Scenario: Cierre de turno
- **WHEN** el vendedor cierra sesión
- **THEN** el sistema invalida los tokens guardados, vacía el carrito y vuelve a la pantalla de acceso

#### Scenario: Limpieza completa en logout
- **WHEN** logout ejecutado
- **THEN** localStorage limpio (`pos_vendedor`, `pos_cliente`, `pos_carrito`), cookies limpias, navega a `/login`