# Tasks

## 1. Cliente API del POS

- [x] 1.1 Extender `src/lib/api.ts` con tipos y funciones de cobro (checkout con clave de idempotencia, retorno de pago, pendientes) y verificar con `npm run build`
- [x] 1.2 Agregar pruebas unitarias del cliente (login, catálogo, checkout, retorno con rechazo y error de stock) y verificar con `npm run test.unit -- --run`

## 2. Autenticación compartida

- [x] 2.1 Implementar pantalla de acceso del vendedor contra `POST /usuarios/auth/login` con mensajes de error de la API y verificar login válido e inválido con `vendedor@rockstar.cl`
- [x] 2.2 Implementar sesión de cliente para el checkout (inicio o registro exprés sin perder el carrito) y verificar que el checkout usa el token CLIENTE
- [x] 2.3 Implementar guarda de roles, redirección a acceso con carrito conservado ante sesión inválida y cierre de turno, y verificar cada flujo manualmente en `npm run dev`

## 3. Catálogo y carrito reactivo

- [x] 3.1 Implementar cuadrícula responsiva de tarjetas (foto, detalle, precio CLP, stock) con imagen de reemplazo y reintento, y verificar contra `GET /inventario/catalogo` real con las 7 variantes actuales
- [x] 3.2 Implementar control `+ cantidad −` por tarjeta con pasos de 1 y detalle más total reactivos, y verificar que cada pulsación actualiza detalle y total sin recargar
- [x] 3.3 Implementar tope de stock (inhabilitar `+` al llegar al disponible, "Sin stock" con controles inhabilitados y nunca agregar stock 0) y verificar con un producto de stock 7 que permite 7 pero no 8, y con uno de stock 0 que muestra "Sin stock"
- [x] 3.4 Agregar pruebas e2e del carrito (tope de stock, bloqueo "Sin stock", total reactivo) y verificar con `npm run test.e2e`

## 4. Cobro, boleta y registro

- [x] 4.1 Implementar confirmación en dos pasos (checkout + retorno) con clave UUID reutilizada en reintentos y tratamiento del stock insuficiente como "Sin stock", y verificar una venta real que descuenta stock al instante
- [x] 4.2 Implementar ambos medios de pago (contado con aprobación inmediata y tarjeta simulada con aprobar/rechazar conservando el carrito) y verificar los tres escenarios contra la API real
- [x] 4.3 Implementar boleta con id, fecha, líneas, total, medio de pago y giro más impresión solo-boleta, y verificar que al emitirse el carrito se vacía y la impresión contiene la boleta completa
- [x] 4.4 Implementar registro de jornada (backend + copia local, orden reciente a antigua, conteo y total de cierre) con refresco de catálogo tras cada venta, y verificar cierre de jornada con conteo y recaudado correctos

## 5. Tema e integración Docker

- [x] 5.1 Aplicar tema de la tienda (oscuro, acento rojo, tarjetas con insignias, aviso de últimas unidades, formato CLP) a la vista `/pos` y verificar en móvil y escritorio que la cuadrícula es responsiva
- [x] 5.2 Verificar integración completa en Docker (`docker compose up --build -d`, abrir `http://localhost:8082/pos`, vender un producto real y comprobar boleta, registro y stock actualizado) y documentar cuenta CLIENTE de mostrador y datos de retiro en tienda
