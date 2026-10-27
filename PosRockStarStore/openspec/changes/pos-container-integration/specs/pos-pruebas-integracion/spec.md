# Spec Delta

## Purpose

Define la suite de pruebas de integración end-to-end contra la API real corriendo en contenedor, cubriendo todos los flujos críticos del POS.

## ADDED Requirements

### Requirement: Pruebas de autenticación

El sistema SHALL validar login de vendedor y cliente contra API real en contenedor.

#### Scenario: Login vendedor válido
- **WHEN** credenciales `vendedor@rockstar.cl` / password correcto
- **THEN** obtiene token VENDEDOR, redirige a `/pos`, muestra nombre en header

#### Scenario: Login vendedor inválido
- **WHEN** credenciales incorrectas
- **THEN** muestra error de API, permanece en `/login`, no navega

#### Scenario: Login cliente para checkout
- **WHEN** credenciales `cliente@rockstar.cl` / password correcto (rol CLIENTE)
- **THEN** obtiene token CLIENTE, habilita botón Cobrar

#### Scenario: Sesión persistente tras recarga
- **WHEN** usuario recarga página (F5) en `/pos`
- **THEN** sesión vendedor y carrito se restauran de localStorage

### Requirement: Pruebas de catálogo y carrito

El sistema SHALL validar carga de catálogo, stepper, stock, y totales reactivos contra API real.

#### Scenario: Carga catálogo 7 variantes
- **WHEN** `GET /inventario/catalogo` retorna 7 items
- **THEN** grid muestra 7 tarjetas con foto, detalle, precio CLP, stock

#### Scenario: Stepper +/− actualiza detalle y total
- **WHEN** pulsa `+` en tarjeta con stock 7
- **THEN** cantidad sube 1, línea aparece en detalle, total sube precio unitario

#### Scenario: Tope de stock inhabilita +
- **WHEN** cantidad alcanza `disponible` (ej. 7/7)
- **THEN** botón `+` disabled, no permite 8

#### Scenario: Stock 0 muestra "Sin stock"
- **WHEN** variante con `disponible: 0`
- **THEN** badge "Sin stock", controles disabled, no entra a carrito

### Requirement: Pruebas de checkout y pago

El sistema SHALL validar flujo completo de venta (checkout + retorno) con ambos medios.

#### Scenario: Checkout contado aprobado
- **WHEN** carrito con stock, medio "contado", cliente logueado
- **THEN** `POST /ventas/checkout` + `POST /pagos/webpay/retorno` con `aprobar: true` → boleta emitida, stock descontado, carrito vacío

#### Scenario: Checkout tarjeta aprobado
- **WHEN** medio "tarjeta", retorno simulado `aprobar: true`
- **THEN** boleta emitida con medio "Tarjeta", stock descontado

#### Scenario: Checkout tarjeta rechazado
- **WHEN** medio "tarjeta", retorno simulado `aprobar: false`
- **THEN** error "Pago rechazado: <motivo>", carrito conservado, sin boleta

#### Scenario: Reintento con idempotencia
- **WHEN** fallo de red en checkout y usuario reintenta
- **THEN** misma `claveIdempotencia` evita venta duplicada

#### Scenario: Stock insuficiente en servidor
- **WHEN** API retorna 409 "Stock insuficiente"
- **THEN** muestra "Sin stock", refresca catálogo, no cobra

### Requirement: Pruebas de boleta e impresión

El sistema SHALL validar emisión y contenido de boleta.

#### Scenario: Boleta completa
- **WHEN** venta pagada
- **THEN** boleta muestra: idVenta, fecha, líneas (producto, cant, precio, subtotal), total, medio, giro, RUT, dirección

#### Scenario: Impresión solo boleta
- **WHEN** `window.print()` desde modal boleta
- **THEN** CSS `@media print` oculta UI, imprime solo contenido boleta

### Requirement: Pruebas de registro de jornada

El sistema SHALL validar registro mixto (backend + local) y stats de cierre.

#### Scenario: Registro muestra ventas recientes primero
- **WHEN** `GET /ventas/pendientes` + copia local
- **THEN** lista ordenada desc por fecha, cada item: id, fecha, total, medio, estado

#### Scenario: Stats de cierre correctos
- **WHEN** 3 ventas pagadas ($15.000, $25.000, $10.000)
- **THEN** stats: "3 ventas", "Total $50.000"

#### Scenario: Refresco catálogo tras venta
- **WHEN** venta descuenta stock
- **THEN** `GET /inventario/catalogo` refleja nuevo `disponible` al instante