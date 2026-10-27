# Proposal

## Why

El POS de la tienda hoy es una plantilla Ionic en blanco sin conexión funcional a la venta: el vendedor no puede registrar una venta en caja contra el stock real del backend Rockstar. Sin este portal, las ventas presenciales no descuentan stock ni quedan registradas, y no hay forma de alcanzar la meta mensual (378 clientes, ticket promedio $15.000).

## What Changes

- Nueva página POS de una sola vista (`/pos`): catálogo de productos reales en tarjetas responsivas con foto, detalle, precio y stepper `+ cantidad −`, más panel de detalle de compra y total reactivo.
- Autenticación compartida con las apps hermanas: login contra `POST /usuarios/auth/login` (contrato existente), sesión de vendedor para operar el POS y sesión de cliente para ejecutar el checkout.
- Validación de stock en cada incremento: se consulta el disponible y nunca se permite superar el stock (tope en el disponible, botón `+` inhabilitado al llegar al límite); productos con stock 0 muestran "Sin stock" y no entran al carrito.
- Cobro con los dos medios acordados reutilizando el checkout existente: `POST /ventas/checkout` (rol CLIENTE, con clave de idempotencia) seguido de `POST /pagos/webpay/retorno`; contado resuelve `aprobar: true` de inmediato y webpay simulado permite aprobar o simular rechazo.
- Boleta en pantalla con id de compra, fecha, líneas, valores, giro e información de la compra, con botón de impresión; al cerrar la venta se refresca el stock desde la API.
- Registro de compras doble: historial del backend (`GET /ventas/pendientes` más resultado del retorno) combinado con copia local para la jornada de caja.
- Tema visual tomado de la tienda (`/#/shop`): fondo oscuro, acento rojo, tarjetas de producto con insignias y formato CLP.

## Capabilities

### New Capabilities

- `pos-autenticacion`: login del vendedor contra la API Rockstar, guarda de roles en el POS y gestión de la sesión de cliente necesaria para el checkout. Cubre el login traído de las apps hermanas.
- `pos-catalogo-carrito`: catálogo en tarjetas responsivas desde `GET /inventario/catalogo` (+ detalle de gestión), stepper `+ cantidad −` por unidad, detalle y total reactivos, y validación de stock con tope y "Sin stock".
- `pos-cobro-boleta`: flujo de cobro en dos pasos sobre el checkout existente (contado y webpay simulado), boleta visible e imprimible con datos de la compra y giro, y registro de compras backend + local con refresco de stock al cerrar.

### Modified Capabilities

- Ninguna: no se cambian requisitos del backend ni de las apps existentes. El POS reutiliza los contratos actuales (`usuarios/auth`, `inventario/catalogo`, `ventas/checkout`, `pagos/webpay/retorno`) sin modificarlos.

## Impact

- Solo el proyecto `PosRockStarStore` (frontend Ionic React): nuevas página `/pos`, componentes de catálogo/carrito/boleta, extensión de `src/lib/api.ts`, estilos del tema tienda, pruebas unitarias y e2e.
- Sin cambios en `App-mobile-docker-backend` (API, base de datos, bodega móvil, e-commerce) ni en Docker existente; el POS sigue servido en `:8082` con proxy `/api`.
- Decisiones del usuario que fijan el alcance: se reutiliza el checkout actual (no hay endpoint nuevo de venta), ambos medios de pago, boleta ver + imprimir, historial mixto backend + local.
