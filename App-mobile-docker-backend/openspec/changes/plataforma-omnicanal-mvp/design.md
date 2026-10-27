# Design

## Context

Ver `proposal.md` para la motivación y el alcance. El repositorio solo contiene la configuración de OpenSpec: no hay código, base de datos ni infraestructura.

Restricciones impuestas por el encargo:

- Arquitectura SOA con un API Gateway y cinco servicios independientes: Usuarios, Ventas, Inventario, Pagos y Logística.
- Tres clientes: e-commerce en React, POS para vendedores y app de bodega en Ionic Angular.
- PostgreSQL como fuente única de datos.
- Integraciones con Webpay y Starken.
- 12 semanas, en cuatro sprints de tres semanas.

El backend no tenía lenguaje ni framework definidos en el proyecto; la decisión 1 lo propone y justifica.

Supuestos adoptados (no venían en el encargo):

- Los precios incluyen IVA y los montos son pesos chilenos enteros. No se separa el impuesto porque la contabilidad está fuera de alcance.
- El precio, el costo de compra, el peso y las dimensiones dependen del producto, no de la talla ni del color.
- Hay una sola tienda con dos ubicaciones de stock: bodega y sala de ventas.
- El cobro con tarjeta en la tienda se hace en el terminal físico actual; el POS solo registra el medio de pago.
- El e-commerce solo ofrece despacho a domicilio por Starken; no hay retiro en tienda.
- Para pagar en la web el cliente debe tener cuenta; no hay compra como invitado.
- La devolución registra el reingreso de stock; la devolución del dinero se gestiona fuera del sistema.

## Goals / Non-Goals

**Goals:**

- Que la regla "ningún canal vende sin stock" se cumpla por construcción en un único punto, no por coordinación entre clientes.
- Contratos explícitos por servicio, de modo que cada uno pueda desarrollarse y probarse por separado.
- Que la caída de Webpay o de Starken degrade la experiencia sin detener la tienda ni dejar datos inconsistentes.
- Que todo KPI del dashboard se calcule de datos que el sistema registra, sin planillas externas.

**Non-Goals:**

- Alta disponibilidad con réplicas, autoescalado u orquestación con Kubernetes.
- Mensajería asíncrona con un broker (RabbitMQ, Kafka).
- Operación sin conexión en la app de bodega o en el POS.
- Posicionamiento en buscadores (SEO) con renderizado en servidor.
- Descuentos, cupones, promociones y precios por variante.
- Devolución de dinero automática fuera del reverso de pagos fallidos.

## Decisions

### 1. Backend en NestJS (Node.js + TypeScript)

Se propone NestJS para el gateway y los cinco servicios.

- Un solo lenguaje en todo el proyecto: React y Ionic Angular ya son TypeScript, así que los tipos de los contratos se comparten entre servicios y clientes y el equipo no cambia de lenguaje.
- Su estructura de módulos, controladores y guards es prácticamente la de Angular, que el equipo ya usará en la app de bodega, y los guards calzan de forma directa con el control por rol.
- Transbank publica un SDK oficial para Node.js, lo que reduce el riesgo de la integración con Webpay.
- Alternativa Spring Boot (Java): muy sólido para SOA, pero añade un segundo lenguaje y más ceremonia para 12 semanas.
- Alternativa ASP.NET Core: comparable en capacidades, mismo costo de segundo lenguaje.
- Alternativa Express sin framework: más liviano, pero habría que construir a mano la estructura, la validación y la autorización en seis aplicaciones.

### 2. Monorepo con workspaces de npm

```
services/
  gateway/  usuarios/  inventario/  ventas/  pagos/  logistica/
apps/
  ecommerce-web/      React (clientes)
  backoffice-web/     React (POS, dashboard y administración, según rol)
  bodega-mobile/      Ionic Angular + Capacitor
packages/
  contracts/          tipos y esquemas de los contratos de API
db/
  migrations/         migraciones por esquema
docker-compose.yml    PostgreSQL + gateway + servicios para desarrollo
```

- El POS y el dashboard viven en una misma aplicación `backoffice-web`, que muestra un módulo u otro según el rol. Así se mantienen los tres clientes del encargo y no se crea un cuarto solo para el dashboard.
- Alternativa: un repositorio por servicio. Se descarta: con un equipo pequeño multiplica la configuración y dificulta cambiar un contrato y sus consumidores en un mismo cambio.

### 3. API Gateway propio en NestJS

El gateway es la única puerta de entrada pública (`/api/v1/...`). Sus responsabilidades:

- Enrutar cada prefijo a su servicio (`/usuarios`, `/inventario`, `/ventas`, `/pagos`, `/logistica`).
- Validar el token de sesión y aplicar el control por rol a nivel de ruta.
- CORS, límite de solicitudes por IP y registro de accesos con un identificador de correlación que viaja a los servicios.
- Componer la respuesta del dashboard a partir de los reportes de cada servicio.

Los servicios no son accesibles desde fuera de la red interna.

- Alternativa Kong o NGINX: resuelven el enrutamiento, pero la composición del dashboard y el control por rol requerirían plugins o un servicio adicional, y suman una pieza que operar.

### 4. Una instancia de PostgreSQL con un esquema por servicio

Cada servicio es dueño de un esquema (`usuarios`, `inventario`, `ventas`, `pagos`, `logistica`) y tiene un usuario de base de datos con permisos de lectura y escritura solo sobre él. Ningún servicio lee tablas de otro: los datos ajenos se piden por la API del servicio dueño.

- Se permiten claves foráneas entre esquemas (por ejemplo `inventario.movimientos.id_usuario → usuarios.usuarios`). Cumple la exigencia de un modelo relacional íntegro en una única fuente de datos, y el usuario de cada servicio recibe solo el permiso `REFERENCES` sobre las tablas ajenas que referencia.
- Alternativa: una base por servicio. Es la SOA más pura, pero contradice "PostgreSQL es la fuente única", impide las claves foráneas pedidas y obligaría a consistencia eventual en todo.
- Alternativa: un único esquema compartido. Se descarta porque los servicios quedarían acoplados por las tablas y dejarían de ser independientes.
- Trade-off aceptado: las claves foráneas entre esquemas obligan a desplegar las migraciones en orden (usuarios, inventario, ventas, pagos, logística).

Acceso a datos con Prisma (un esquema Prisma por servicio) y migraciones versionadas. Las operaciones de stock usan SQL explícito dentro de una transacción (decisión 6).

### 5. Modelo de datos en 3FN

Correcciones al modelo base y su motivo:

| Modelo base | Problema | Corrección |
|---|---|---|
| `PRODUCTOS(talla, color, stock, codigo_qr)` | Cada fila mezcla el producto con una de sus variantes; nombre, categoría y precio se repiten por talla y color | Se separa en `productos` y `variantes`. La variante lleva SKU y código propios |
| `PRODUCTOS.categoria` como texto | Valores repetidos e inconsistentes | Tabla `categorias` y clave foránea |
| `PRODUCTOS.stock` | No distingue ubicación ni reservas | Tabla `existencias` por variante y ubicación |
| `USUARIOS.rol` como texto | Dominio no controlado | Tabla `roles` y clave foránea |
| `VENTAS.id_usuario` | Ambiguo: es el vendedor en POS y el cliente en e-commerce | `id_vendedor` e `id_cliente`, ambos opcionales, con restricción según el canal |
| `DETALLE_VENTA.id_producto` | No identifica la talla ni el color vendidos | `id_variante` |
| `DETALLE_VENTA.subtotal` | Derivable de cantidad × precio unitario | Columna generada, no almacenada como dato libre |
| `PEDIDOS(estado, tracking_starken)` | Faltan destino y costos; estado sin dominio | Tabla `estados_pedido`, `comunas` y `regiones`; relación 1 a 1 con la venta |
| `MOVIMIENTOS.id_producto`, `tipo` | No identifica variante ni ubicación; tipo sin dominio | `id_variante`, `id_ubicacion`, tabla `tipos_movimiento` y `tipos_merma` |

Tablas por esquema (clave primaria marcada con `*`, clave foránea con `→`):

**usuarios**
- `roles(*id_rol, nombre)`
- `usuarios(*id_usuario, nombre, email ÚNICO, hash_contrasena, id_rol → roles, activo, creado_en)`
- `sesiones(*id_sesion, id_usuario → usuarios, hash_token_refresco, expira_en, revocada)`

**inventario**
- `categorias(*id_categoria, nombre ÚNICO)`
- `bandas(*id_banda, nombre ÚNICO)`
- `productos(*id_producto, id_categoria → categorias, id_banda → bandas NULL, codigo_ubicacion ÚNICO, nombre, descripcion, imagen_url, precio, costo_compra, peso_gramos, alto_cm, ancho_cm, largo_cm, activo)`
- `tallas(*id_talla, nombre ÚNICO)`, `colores(*id_color, nombre ÚNICO)`
- `variantes(*id_variante, id_producto → productos, id_talla → tallas, id_color → colores, sku ÚNICO, codigo ÚNICO, activo, ÚNICO(id_producto, id_talla, id_color))`
- `ubicaciones(*id_ubicacion, nombre ÚNICO)` con las filas `BODEGA` y `SALA_VENTAS`
- `existencias(*id_variante → variantes, *id_ubicacion → ubicaciones, cantidad CHECK ≥ 0)`
- `reservas(*id_reserva, id_venta, id_variante → variantes, cantidad CHECK > 0, estado, expira_en)`
- `tipos_movimiento(*id_tipo, codigo ÚNICO)`: `INGRESO`, `VENTA`, `DEVOLUCION`, `DESPACHO`, `MERMA`, `TRASPASO`, `AJUSTE`
- `tipos_merma(*id_tipo_merma, codigo ÚNICO)`: `DANADO`, `MUESTRA`, `CAMBIO`
- `movimientos(*id_movimiento, id_variante → variantes, id_ubicacion → ubicaciones, id_ubicacion_destino → ubicaciones NULL, id_tipo → tipos_movimiento, id_tipo_merma → tipos_merma NULL, cantidad, fecha, id_usuario → usuarios.usuarios, motivo, id_venta NULL, clave_idempotencia ÚNICO)`
- `conteos(*id_conteo, id_variante, id_ubicacion, cantidad_sistema, cantidad_contada, id_usuario, fecha, etapa)` para ajustes y carga inicial
- `busquedas(*id_busqueda, id_variante, id_usuario, inicio, fin)` para el KPI de tiempo de búsqueda

**ventas**
- `estados_venta(*id_estado, codigo)`: `PENDIENTE_PAGO`, `PAGADA`, `RECHAZADA`, `EXPIRADA`, `REVERSADA`
- `ventas(*id_venta, canal CHECK IN ('POS','ECOMMERCE'), id_vendedor → usuarios.usuarios NULL, id_cliente → usuarios.usuarios NULL, id_estado → estados_venta, fecha, total, clave_idempotencia ÚNICO)`
- `detalle_venta(*id_detalle, id_venta → ventas, id_variante → inventario.variantes, cantidad, precio_unitario, costo_unitario, subtotal GENERADO)`
- `costos_venta(*id_venta → ventas, comision_pago, flete_cobrado, costo_despacho)`
- `visitas(*id_visita, fecha)` y `parametros_financieros(*id, inversion_inicial, tasa_descuento_anual, horizonte_meses, actualizado_por, actualizado_en)`

**pagos**
- `medios_pago(*id_medio, codigo, tasa_comision)`: `EFECTIVO`, `DEBITO_PRESENCIAL`, `CREDITO_PRESENCIAL`, `WEBPAY_DEBITO`, `WEBPAY_CREDITO`, `WEBPAY_PREPAGO`
- `transacciones(*id_transaccion, id_venta → ventas.ventas, id_medio → medios_pago NULL, monto, estado, token_webpay ÚNICO NULL, codigo_autorizacion, motivo_rechazo, comision, creado_en, resuelto_en)`

**logistica**
- `regiones(*id_region, nombre)`, `comunas(*id_comuna, id_region → regiones, nombre, codigo_starken, zona)`
- `estados_pedido(*id_estado, codigo)`: `PAGADO`, `EN_PREPARACION`, `DESPACHO_PENDIENTE`, `DESPACHADO`, `ENTREGADO`, `ATENCION_MANUAL`
- `pedidos(*id_pedido, id_venta → ventas.ventas ÚNICO, id_estado → estados_pedido, id_comuna → comunas, direccion, destinatario, telefono, tracking_starken, flete_cobrado, costo_despacho, pagado_en, despachado_en, entregado_en)`
- `historial_pedido(*id, id_pedido → pedidos, id_estado, id_usuario NULL, fecha)`
- `tarifas_cache(*id_comuna, *tramo_peso, *tramo_volumen, valor, consultado_en)` y `tarifas_respaldo(*zona, *tramo_peso, valor)`
- `despachos_pendientes(*id_pedido → pedidos, intentos, proximo_intento, ultimo_error)`

Desnormalizaciones deliberadas, todas valores históricos que no deben cambiar si cambia su origen: `precio_unitario` y `costo_unitario` en el detalle, `total` en la venta (es el monto cobrado, incluye flete) y `existencias.cantidad` (saldo que debe coincidir con la suma de movimientos; se mantiene para poder bloquear y validar el stock de forma atómica).

### 6. Concurrencia del stock: transacción con bloqueo de filas en el servicio de Inventario

Toda operación que cambia stock se ejecuta en Inventario dentro de una única transacción de PostgreSQL:

1. `SELECT ... FROM existencias WHERE id_variante = ANY(...) ORDER BY id_variante, id_ubicacion FOR UPDATE`. El orden fijo evita interbloqueos entre ventas con las mismas variantes.
2. Con las filas bloqueadas, se calcula la disponibilidad: suma de `cantidad` menos reservas activas de la variante.
3. Si alguna línea no alcanza, se hace `ROLLBACK` y se responde `409 STOCK_INSUFICIENTE` indicando la variante.
4. Si alcanza, se actualizan existencias o se insertan reservas, y se insertan los movimientos, todo en la misma transacción.

Dos ventas simultáneas por la última unidad se serializan en el paso 1: la segunda espera, ve la disponibilidad ya descontada y es rechazada. Las restricciones `CHECK (cantidad >= 0)` actúan como última defensa.

- Alternativa: bloqueo optimista con columna de versión y reintentos. Funciona, pero obliga a reintentar en la aplicación y complica las ventas de varias líneas.
- Alternativa: `UPDATE ... SET cantidad = cantidad - n WHERE cantidad >= n`. Atómico para una fila, pero no cubre la disponibilidad repartida en dos ubicaciones ni las reservas.
- Alternativa: nivel de aislamiento `SERIALIZABLE`. Correcto, pero genera abortos que hay que reintentar y es más difícil de razonar.

Descuento o bloqueo según el canal:

- **POS**: descuento inmediato de la existencia física (movimiento `VENTA`), porque el comprador se lleva la prenda.
- **E-commerce**: reserva con vencimiento de 15 minutos al iniciar el pago. Si el pago se confirma, la reserva queda firme, sin vencimiento. Al despachar, se descuenta la existencia física, se cierra la reserva y se registra un movimiento `DESPACHO`. Si el pago falla o vence, la reserva se libera. Una tarea periódica libera las reservas vencidas.

### 7. Coordinación entre servicios: llamadas HTTP síncronas, idempotencia y reconciliación

Una venta toca Ventas, Inventario, Pagos y Logística, cada uno con su propia transacción. Ventas orquesta el flujo como una saga:

**Venta POS**
1. Ventas crea la venta `PENDIENTE_PAGO` con la clave de idempotencia del cliente.
2. Ventas llama a `Inventario POST /interno/salidas`. Si responde `409`, marca la venta `RECHAZADA` y devuelve el error.
3. Ventas llama a `Pagos POST /interno/pagos-presenciales` y marca la venta `PAGADA`.

**Compra e-commerce**
1. Ventas crea la venta `PENDIENTE_PAGO` y llama a `Inventario POST /interno/reservas`.
2. Ventas llama a `Pagos POST /interno/transacciones`, que crea la transacción en Webpay y devuelve la URL de pago.
3. El cliente paga y vuelve a `Pagos /webpay/retorno`; Pagos confirma con Webpay.
4. Si fue autorizado, Pagos llama a `Ventas /interno/ventas/:id/pago-confirmado`; Ventas confirma la reserva en Inventario, marca `PAGADA` y pide a Logística crear el pedido.
5. Si la confirmación de la reserva falla, Ventas pide a Pagos el reverso y marca `REVERSADA`.
6. Si fue rechazado o anulado, Ventas libera la reserva y marca `RECHAZADA`.

Garantías:

- Toda llamada interna que modifica datos lleva una clave de idempotencia (el `id_venta` o la clave del cliente). Repetirla devuelve el resultado original.
- Una tarea de reconciliación revisa cada minuto las ventas `PENDIENTE_PAGO` con más de 15 minutos: consulta el estado en Pagos y completa o deshace el flujo. Cubre la caída de un servicio a mitad de camino.
- Las llamadas internas se autentican con un token de servicio y no pasan por el gateway.

- Alternativa: eventos con un broker y patrón outbox. Desacopla mejor, pero suma infraestructura y complejidad de depuración que el plazo no permite.

### 8. Autenticación con JWT y control por rol en dos niveles

- Usuarios emite un token de acceso JWT de 15 minutos firmado con RS256 y un token de refresco de 7 días guardado como hash en `sesiones`, lo que permite revocar sesiones al cerrar sesión o desactivar una cuenta.
- Contraseñas con hash Argon2id.
- El gateway valida el token y el rol por ruta. Cada servicio vuelve a validar la firma con la clave pública y aplica sus propios guards, de modo que un error de configuración del gateway no exponga datos.
- Los campos sensibles se filtran en el servicio según el rol: el costo de compra solo se serializa para el Gerente.

Matriz de permisos:

| Operación | Cliente | Vendedor | Bodega | Gerente | RRHH |
|---|---|---|---|---|---|
| Catálogo, carrito, checkout, sus pedidos | Sí | — | — | — | — |
| Venta POS y comprobante | — | Sí | — | Consulta | — |
| Consultar stock | — | Sí | Sí | Sí | — |
| Traspasos y ajustes por conteo | — | Sí | Sí | — | — |
| Devoluciones | — | Sí | — | — | — |
| Ingresos y mermas | — | — | Sí | — | — |
| Crear y editar productos y variantes | — | — | Sí | Sí | — |
| Precio, costo y tasas de comisión | — | — | — | Sí | — |
| Preparar pedidos | — | Sí | Sí | — | — |
| Generar despacho | — | Sí | — | — | — |
| Historial de movimientos | — | — | Sí | Sí | — |
| Transacciones de pago y dashboard | — | — | — | Sí | — |
| Administrar cuentas internas | — | — | — | Sí | — |
| Ver lista de cuentas internas | — | — | — | Sí | Solo lectura |

- Alternativa: sesiones con cookie en servidor. Sirve para la web, pero es incómoda en la app móvil y exige estado compartido en el gateway.

### 9. Contratos de los servicios

Rutas públicas bajo `/api/v1`. JSON en todas. Errores con el formato `{ codigo, mensaje, detalle? }`. Los contratos completos (cuerpos y respuestas) se escriben como especificación OpenAPI por servicio y como tipos en `packages/contracts`.

**Usuarios**

| Ruta | Acceso | Uso |
|---|---|---|
| `POST /usuarios/auth/registro` | Público | Crea cuenta Cliente |
| `POST /usuarios/auth/login`, `/refresh`, `/logout` | Público / sesión | Sesión |
| `GET /usuarios/yo` | Sesión | Datos propios |
| `GET /usuarios/internos` | Gerente, RRHH | Lista de cuentas internas |
| `POST /usuarios/internos`, `PATCH /usuarios/internos/:id` | Gerente | Alta, cambio y desactivación |

**Inventario**

| Ruta | Acceso | Uso |
|---|---|---|
| `GET /inventario/catalogo/productos`, `/:id` | Público | Catálogo con disponibilidad |
| `GET /inventario/catalogo/disponibilidad?variantes=` | Público | Disponibilidad al instante |
| `POST /inventario/productos`, `PATCH /:id`, `POST /:id/variantes` | Gerente, Bodega | Gestión del catálogo |
| `GET /inventario/variantes/por-codigo/:codigo` | Vendedor, Bodega | Búsqueda por escaneo |
| `GET /inventario/variantes?q=` | Vendedor, Bodega | Búsqueda manual por SKU o nombre; sin texto, lista todas las variantes con su stock |
| `POST /inventario/etiquetas` | Gerente, Bodega | PDF de etiquetas |
| `GET /inventario/existencias?variante=` | Vendedor, Bodega, Gerente | Stock por ubicación |
| `POST /inventario/movimientos/ingresos`, `/mermas` | Bodega | Ingresos y mermas |
| `POST /inventario/movimientos/traspasos`, `/ajustes` | Vendedor, Bodega | Actualización de inventario |
| `POST /inventario/movimientos/devoluciones` | Vendedor | Devolución de una venta |
| `GET /inventario/movimientos` | Bodega, Gerente | Historial |
| `POST /inventario/busquedas`, `PATCH /:id` | Vendedor, Bodega | Tiempo de búsqueda |
| `POST /inventario/carga-inicial/importar`, `/conteos`, `/activar` | Gerente, Bodega | Migración |
| `POST /interno/salidas`, `/reservas`, `/reservas/:id/confirmar`, `/liberar`, `/despachos` | Servicios | Stock de ventas |
| `GET /interno/reportes/inventario` | Gateway | KPIs |

**Ventas**

| Ruta | Acceso | Uso |
|---|---|---|
| `POST /ventas/pos` | Vendedor | Registra venta POS |
| `GET /ventas`, `/:id` | Vendedor (propias), Gerente | Consulta |
| `GET /ventas/:id/comprobante`, `POST /:id/comprobante/enviar` | Vendedor, Gerente | Comprobante interno |
| `POST /ventas/carrito/validar` | Público | Precios y disponibilidad actuales |
| `POST /ventas/checkout` | Cliente | Crea la compra, reserva e inicia el pago |
| `POST /ventas/visitas` | Público | Registro de visita |
| `GET`/`PUT /ventas/parametros-financieros` | Gerente | Inversión, tasa y horizonte |
| `POST /interno/ventas/:id/pago-confirmado`, `/pago-fallido`, `/costo-despacho` | Servicios | Saga |
| `GET /interno/reportes/comerciales`, `/financieros` | Gateway | KPIs |

**Pagos**

| Ruta | Acceso | Uso |
|---|---|---|
| `GET`/`POST /pagos/webpay/retorno` | Público | Retorno desde Webpay |
| `GET /pagos/transacciones` | Gerente | Listado |
| `GET`/`PUT /pagos/medios` | Gerente | Tasas de comisión |
| `POST /interno/transacciones`, `/:id/reversar`, `GET /:id` | Servicios | Pago en línea |
| `POST /interno/pagos-presenciales` | Servicios | Pago POS |

**Logística**

| Ruta | Acceso | Uso |
|---|---|---|
| `GET /logistica/regiones`, `/comunas` | Público | Destinos |
| `POST /logistica/fletes/cotizar` | Público | Cotización |
| `GET /logistica/pedidos/mios`, `/:id` | Cliente (propios) | Pedido y tracking |
| `GET /logistica/pedidos?estado=` | Vendedor, Bodega, Gerente | Pedidos por preparar |
| `PATCH /logistica/pedidos/:id/preparacion` | Vendedor, Bodega | Cambio de estado |
| `POST /logistica/pedidos/:id/despacho` | Vendedor | Genera el despacho |
| `POST /interno/pedidos` | Servicios | Crea el pedido tras el pago |
| `GET /interno/reportes/logistica` | Gateway | KPIs |

**Gateway**: `GET /dashboard?desde=&hasta=` (Gerente) compone los reportes; `GET /salud` verifica el catálogo.

### 10. Disponibilidad en tiempo real sin caché

El catálogo calcula la disponibilidad en cada consulta y no se cachea. El e-commerce vuelve a pedir `disponibilidad` cada 30 segundos mientras el detalle de un producto o el carrito están abiertos, y la valida de nuevo al agregar al carrito y al iniciar el pago. La garantía real contra la sobreventa es la reserva de la decisión 6, no lo que se muestra en pantalla.

- Alternativa: WebSockets o SSE para empujar los cambios. Mejora la inmediatez visual, pero no cambia la garantía y añade conexiones persistentes que mantener.

### 11. Webpay Plus mediante el SDK oficial de Transbank

- Flujo: crear transacción, redirigir al cliente, recibir el retorno y confirmar. Se usa el ambiente de integración de Transbank en desarrollo y pruebas.
- El retorno es idempotente por `token_webpay`: un token ya resuelto devuelve el resultado guardado.
- Pago sin retorno: la reconciliación (decisión 7) consulta el estado de la transacción en Webpay y la resuelve.
- **Pago fallido**: se registra la transacción con su estado y motivo, se libera la reserva y la venta queda `RECHAZADA`.
- **Reverso automático**: si el pago fue autorizado pero la venta no puede confirmarse, Pagos invoca la reversa o anulación de Webpay y registra el estado `REVERSADO`. Si falla, reintenta con espera creciente hasta cinco veces y luego marca la transacción para revisión del Gerente.
- La comisión no viene en la respuesta de Webpay: se calcula con la tasa configurada en `medios_pago` según el tipo de pago informado.

### 12. Starken detrás de un adaptador, con caché de tarifas y cola de reintentos

Toda la comunicación con Starken pasa por un adaptador en Logística con una interfaz propia (`cotizar`, `emitirDespacho`, `consultarSeguimiento`) y un tiempo máximo de espera de 5 segundos. El resto del sistema no conoce la API de Starken.

- **Cotización**: el peso y el volumen totales se redondean a tramos. Cada respuesta se guarda en `tarifas_cache` por comuna y tramo. Una tarifa con menos de 24 horas se usa directamente; con Starken caído se usa la última guardada aunque esté vencida y, si no hay, `tarifas_respaldo` por zona (Santiago o regiones).
- **Emisión de despacho**: si Starken falla, el pedido pasa a `DESPACHO_PENDIENTE` y entra en `despachos_pendientes`. Una tarea programada reintenta con espera creciente (1, 5, 15, 60 minutos y luego cada hora, hasta 24 horas); después pasa a `ATENCION_MANUAL`. La emisión envía el `id_pedido` como referencia para no duplicar la orden.
- **Seguimiento**: una tarea consulta cada 30 minutos los pedidos despachados no entregados.
- Las tareas usan `@nestjs/schedule` sobre tablas de PostgreSQL. Alternativa BullMQ con Redis: más capaz, pero añade otra pieza de infraestructura para un volumen bajo.

### 13. Clientes

- **`ecommerce-web`**: React con Vite, React Router y TanStack Query. Carrito en `localStorage`, validado contra `carrito/validar`. Diseño adaptable partiendo de 360 px.
- **`backoffice-web`**: misma base. Módulo POS (búsqueda, lector de códigos tipo teclado y cámara), comprobante con vista de impresión, pedidos por preparar, dashboard con Recharts y administración.
- **`bodega-mobile`**: Ionic Angular con componentes standalone y Capacitor. Escáner con `@capacitor-mlkit/barcode-scanning`, con búsqueda manual como alternativa. Estado con signals.
- Los tres generan una clave de idempotencia por formulario y deshabilitan el botón de confirmar mientras hay un envío en curso.
- Alternativa para el e-commerce: Next.js con renderizado en servidor. Mejora el SEO, pero añade un servidor más que desplegar; queda como mejora posterior.

### 13.1. La app de bodega se desarrolla contra un backend simulado

La app de bodega se construyó antes que los servicios de Usuarios e Inventario. Para poder ejecutarla y probarla, incluye un backend en memoria (`core/mock`) que responde las rutas del contrato que usa y aplica las mismas reglas: existencia no negativa, unidades reservadas, variante desactivada, motivo obligatorio e idempotencia por clave. Un interceptor HTTP lo activa con la opción de entorno `useMockApi`; el resto de la app no distingue entre el backend simulado y el real.

- Por qué: permite avanzar la app sin esperar al backend y deja pruebas que ejercitan los flujos completos, incluidas las fallas de conexión.
- Consecuencia: las tareas del grupo 6 quedan verificadas contra el backend simulado. La integración con los servicios reales se valida al completar el grupo 5; si el contrato cambia, el ajuste queda en `packages/contracts`, el cliente de API y el backend simulado.
- `environment.prod.ts` mantiene `useMockApi: true` mientras no existan los servicios. Debe pasar a `false` antes del piloto.
- La app solo admite cuentas con rol Bodega; cualquier otro rol es rechazado al iniciar sesión.
- Alta de productos desde la app: `POST /inventario/productos` recibe nombre, categoría, banda, talla, color, foto (data URL), cantidad recibida y ubicación de ingreso. En una sola operación crea la variante y registra esas unidades como un movimiento de ingreso, y responde la variante con el SKU, el código escaneable y el código de ubicación que genera el servicio. Si el producto ya existe, agrega la talla y color como variante nueva; una combinación repetida responde `409 VARIANTE_DUPLICADA`. El precio y el costo no se piden aquí: los define el Gerente.
- Bandas, categorías y colores como catálogos propios: `GET` y `POST /inventario/bandas`, `/inventario/categorias` y `/inventario/colores` (Gerente, Bodega) permiten registrar un nombre sin crear un producto. Responden la lista completa en orden alfabético, y registrar un nombre que ya existe conserva el existente. Los filtros y el formulario de producto leen estas listas, de modo que una banda sin prendas también aparece.
- Código de ubicación: `B-<zona>-<posición>`, donde la zona son tres letras de la categoría y la posición es correlativa dentro de ella (por ejemplo `B-POL-04`). Es por producto, de modo que todas sus tallas y colores comparten ubicación. El formato es una propuesta del backend simulado y debe ajustarse a cómo está organizada la bodega real.

### 13.2. El backend arranca como un solo servicio, con una imagen Docker por pieza

El primer backend real es una única aplicación NestJS (`services/api`) con los dominios de Usuarios, Inventario y Logística como módulos, en lugar del gateway y los cinco servicios de las decisiones 1 a 3. El sistema se entrega en tres contenedores: `app` (la app de bodega servida por nginx), `api` y `db` (PostgreSQL), definidos en `docker-compose.yml`.

- Por qué: el encargo pidió un backend en su propio contenedor para la app que ya existe. Seis aplicaciones para servir a un solo cliente multiplican la configuración sin que haya todavía llamadas entre servicios que la justifiquen.
- Lo que se conserva del diseño: las rutas públicas son las mismas (`/api/v1/usuarios/...`, `/inventario/...`, `/logistica/...`), de modo que separar los módulos en servicios no cambia a los clientes. Se mantienen un esquema de PostgreSQL por dominio (decisión 4), la transacción con bloqueo de existencias (decisión 6), el JWT RS256 con token de refresco revocable y Argon2id (decisión 8), el formato de error y la matriz de permisos.
- Lo que cambia: el acceso a datos usa SQL explícito con `pg` en lugar de Prisma, y las migraciones son archivos `.sql` en `db/migrations` que el servicio aplica al arrancar. Hay un solo usuario de base de datos, no uno por servicio. El módulo de Logística lee las líneas del pedido directamente de los esquemas `ventas` e `inventario`; al separarse en servicios deberá pedirlas por API.
- Idempotencia: la clave de cada operación se guarda en `inventario.operaciones` y los movimientos la referencian. La decisión 5 pedía la clave única en `movimientos`, pero un ingreso de varias prendas registra varios movimientos con una misma clave.
- Categorías: `inventario.categorias` guarda si la categoría usa banda, su zona de bodega y la última posición entregada, y `inventario.categorias_tallas` las tallas que admite, en orden.
- Pendiente respecto del diseño: el límite de solicitudes por IP, los endpoints de Usuarios distintos de la sesión, y los módulos de Ventas y Pagos. El esquema `ventas` existe solo con las tablas que necesita un pedido.
- La app usa la API real en la imagen Docker (configuración `docker` de Angular, con `apiUrl: '/api/v1'` y sin el backend simulado en el paquete).

### 13.3. La app instalada elige su servidor en tiempo de ejecución

En un teléfono la dirección del backend no se conoce al compilar y cambia con la red, así que la app la guarda en el dispositivo y permite cambiarla desde la pantalla de inicio de sesión. Esto reemplaza lo dicho en 13.1 sobre `useMockApi` como opción fija de entorno.

- Dos modos: **Servidor**, con la dirección del backend, y **Demostración**, que responde con el backend simulado y no necesita red. `useMockApi` pasa a ser solo el modo inicial.
- Los clientes de API siguen armando sus direcciones con el prefijo `environment.apiUrl`. Un interceptor al final de la cadena cambia ese prefijo por el servidor elegido; en modo demostración el backend simulado responde antes.
- Un servidor solo se guarda si responde la verificación de vida (`GET /api/v1/salud`), para no dejar la app sin poder entrar.
- `npm run apk` compila con `--define SERVIDOR_API=...` y fija como servidor inicial la dirección del equipo en la red local. Sin dirección, el APK arranca en modo demostración.
- El APK permite tráfico HTTP sin cifrar (`server.cleartext` y `android.allowMixedContent` en la configuración de Capacitor), porque el backend de desarrollo no tiene certificado. Debe quitarse cuando el backend se publique por HTTPS.
- En la imagen Docker la conexión no es configurable: la app y la API comparten origen.

### 13.4. Etiquetas QR de los espacios de bodega

Cada producto ocupa un espacio de la bodega, identificado por su código de ubicación (`B-<zona>-<número>`, ver 13.1). La app genera una etiqueta por espacio con un código QR y su número, para pegarla en la repisa.

- El QR contiene solo el código del espacio, por ejemplo `B-POL-03`. Lo dibuja la app como SVG, de modo que funciona sin conexión y también en modo demostración.
- La pantalla "Espacios de bodega" lista los espacios, muestra la etiqueta de cada uno y, en la versión web, imprime una o todas. La app instalada no imprime: no tiene diálogo de impresión.
- El espacio lo asigna el servicio al crear el producto; la pantalla de producto creado muestra su QR. La app no permite todavía mover un producto a otro espacio.
- Escanear la etiqueta de un espacio desde cualquier pantalla con escáner muestra las tallas y colores guardados ahí; si hay una sola, queda elegida.
- `GET /inventario/variantes?q=` busca también por código de ubicación. No hay endpoint propio de espacios: la app los agrupa a partir de las variantes.
- Etiquetas de prendas: la pantalla "Etiquetas de prendas" genera una etiqueta por variante con un QR que contiene su SKU, más el nombre, la talla y el color. `GET /inventario/variantes/por-codigo/:codigo` ya acepta el SKU, de modo que el escáner de la app de bodega la reconoce, y el POS podrá leerla igual cuando exista. En la versión web se imprime una, una por unidad en stock (con tope de 60) o una por cada prenda visible.
- Esto cubre en la app lo que la tarea 5.3 pedía como PDF generado por el servicio (`POST /inventario/etiquetas`), que no se implementó.
- El punto de venta no existe todavía: hoy la etiqueta sirve para contar, mover y dar de baja desde la app de bodega. Descontar por venta requiere el módulo de Ventas.
- En modo demostración, la pantalla principal lo avisa: esos datos no llegan a la base.

### 13.5. Modelo de datos completo

Las tablas de la decisión 5 están todas creadas, en las migraciones `001` a `009` de `db/migrations`. El modelo, sus reglas, la justificación de 3FN y los diagramas generados desde la base están en `docs/modelo-datos.md`.

Diferencias con la decisión 5, todas explicadas en ese documento:

- `logistica.solicitudes_despacho` guarda el destino de una compra mientras se paga. Al confirmarse el pago se convierte en pedido y se elimina.
- `ventas.visitas` lleva un identificador de sesión único; `ventas.detalle_venta` registra la ubicación de origen de cada línea POS.
- `pagos.medios_pago` agrega nombre y si es presencial; `pagos.transacciones` agrega los intentos de reverso y la marca de revisión manual.
- `inventario.reservas` e `inventario.movimientos` referencian la venta con clave foránea, y una venta reserva cada prenda una sola vez.
- Están las 346 comunas de Chile. Las tasas de comisión nacen en cero y las tarifas de respaldo vacías: las define el Gerente.

Pendiente de las tareas del grupo 2: un usuario de base de datos por servicio (2.1) y las migraciones de reversa (2.2).

### 14. Cálculo de los indicadores

Cada servicio expone un reporte interno de sus propios datos y el gateway los compone.

- **Rentabilidad neta por venta** = `total` − Σ(`costo_unitario` × `cantidad`) − `comision_pago` − `costo_despacho`. Ventas guarda el costo unitario al vender; Pagos y Logística le informan la comisión y el costo de despacho.
- **ROI** = (Σ flujos − inversión) / inversión. **VAN** = −inversión + Σ flujo_t / (1 + i)^t, con i = (1 + tasa anual)^(1/12) − 1. **TIR** por bisección sobre el VAN, anualizada; "no calculable" si el VAN no cambia de signo.
- **Exactitud de inventario** = conteos sin diferencia / conteos del periodo. **Diferencias de stock** = Σ|contado − sistema| / Σ sistema.
- **Disponibilidad del catálogo**: el gateway consulta el catálogo cada minuto y guarda el resultado; el indicador es el porcentaje de verificaciones correctas. Es una medición, no una garantía de 100%.
- **Conversión** = ventas e-commerce pagadas / visitas.

### 15. Pruebas

- Unitarias por servicio y por cliente, entregadas con cada grupo de tareas.
- De integración por servicio contra un PostgreSQL real en contenedor, incluida una prueba de concurrencia que lanza ventas simultáneas sobre la última unidad.
- Dobles de prueba para Webpay y Starken detrás de sus adaptadores, con modos de falla (rechazo, tiempo de espera, caída).
- De extremo a extremo con Playwright para los flujos de compra web y venta POS.

## Risks / Trade-offs

- [El alcance es muy amplio para 12 semanas: seis aplicaciones de backend, tres clientes y dos integraciones] → Los sprints entregan flujos completos y utilizables en orden de valor (inventario y POS antes que e-commerce). Si el plazo aprieta, lo primero en recortarse es ROI/VAN/TIR, el envío de comprobantes por correo y la medición del tiempo de búsqueda, que no bloquean la operación.
- [Caída de la API de Starken] → Caché de tarifas con respaldo por zona y cola de reintentos de despacho (decisión 12). El checkout y el POS siguen funcionando.
- [La tarifa en caché o de respaldo difiere de la real] → Se cobra lo mostrado al cliente; la diferencia la absorbe la tienda y queda visible en la rentabilidad. El Gerente puede ajustar las tarifas de respaldo.
- [Pago fallido o autorizado sin venta confirmada] → Registro de toda transacción, reverso automático con reintentos y marca para revisión manual (decisión 11).
- [Un servicio cae a mitad de una venta] → Idempotencia en todas las llamadas internas y tarea de reconciliación (decisión 7). Ventana máxima de inconsistencia: 15 minutos.
- [Migración del inventario en papel con errores] → Carga inicial con importación validada, etiquetado, doble conteo por personas distintas y activación bloqueada mientras haya diferencias (ver Migration Plan).
- [La API de Starken no está documentada públicamente y exige cuenta comercial] → El adaptador aísla la integración; se desarrolla contra un doble de prueba y las credenciales se solicitan en el Sprint 1. Sin credenciales al inicio del Sprint 4, el piloto opera con tarifas de respaldo y despacho manual.
- [Bloqueo de filas bajo alta concurrencia] → El volumen de una tienda es bajo y las transacciones de stock son cortas y sin llamadas externas dentro.
- [Las claves foráneas entre esquemas acoplan los servicios en la base] → Aceptado a cambio de integridad referencial; el acceso a los datos sigue pasando por la API del servicio dueño.
- [Una sola instancia de PostgreSQL es un punto único de falla] → Respaldos automáticos diarios y prueba de restauración antes del piloto.
- [El comprobante interno no reemplaza la boleta] → Lleva la leyenda "no es documento tributario"; la tienda sigue emitiendo boleta por su medio actual.
- [El KPI de disponibilidad de 100% no puede garantizarse con una sola instancia] → El sistema lo mide y lo reporta; alcanzarlo exigiría redundancia fuera del alcance del MVP.

## Migration Plan

Carga inicial del inventario en papel, antes de activar el sistema:

1. **Catálogo**: el Gerente completa una plantilla CSV con productos, categorías, tallas, colores, precios y costos, y la importa. La importación es todo o nada y reporta cada fila con error.
2. **Etiquetado**: se generan e imprimen las etiquetas QR por variante y se etiqueta cada prenda.
3. **Primer conteo**: Bodega escanea y cuenta cada variante por ubicación con la app.
4. **Validación cruzada**: una persona distinta repite el conteo. Las variantes con diferencia requieren un tercer conteo que la resuelve.
5. **Activación**: con cero diferencias pendientes, el Gerente activa el sistema. Los conteos validados se convierten en movimientos de ingreso con motivo "carga inicial" y se habilitan las ventas.

Puesta en marcha:

1. Despliegue en el ambiente de producción con Webpay y Starken en modo de integración; pruebas de humo.
2. Carga inicial con la tienda cerrada o fuera de horario.
3. Piloto de una semana: POS y bodega en producción, con el registro en papel en paralelo como respaldo. El e-commerce se abre al tercer día si el inventario se mantiene consistente.
4. Cambio de Webpay y Starken a credenciales de producción al abrir el e-commerce.

Vuelta atrás: durante el piloto el papel sigue siendo válido. Si el sistema falla, se cierra el e-commerce desde un interruptor de configuración, la tienda continúa en papel y las ventas hechas en papel se ingresan después como ventas POS. Las migraciones de base de datos son solo aditivas durante el piloto.

## Open Questions

- Proveedor de alojamiento para producción. No cambia el diseño: todo se entrega en contenedores.
- Proveedor de correo transaccional para comprobantes y avisos de pedido. Queda detrás de una interfaz de envío.
- Valores iniciales de las tasas de comisión y de las tarifas de respaldo; los configura el Gerente antes del piloto.
- Formato físico de la etiqueta (tamaño e impresora), que solo afecta la plantilla del PDF.
