# Tasks

Cuatro sprints de tres semanas. Los grupos 1 a 4 corresponden al Sprint 1, los grupos 5 a 7 al Sprint 2, los grupos 8 y 9 al Sprint 3 y los grupos 10 a 12 al Sprint 4.

## 1. Sprint 1 (semanas 1-3): Arquitectura y entorno

- [x] 1.1 Crear el monorepo con workspaces de npm y las carpetas `services/`, `apps/`, `packages/contracts/` y `db/`, y verificar que `npm install` en la raíz termina sin errores
- [ ] 1.2 Generar los proyectos NestJS del gateway y de los servicios usuarios, inventario, ventas, pagos y logistica con un endpoint de salud cada uno, y verificar que cada uno responde `200` en su ruta de salud
- [ ] 1.3 Crear `docker-compose.yml` con PostgreSQL, el gateway y los cinco servicios, y verificar que `docker compose up` deja todo arriba y saludable
- [ ] 1.4 Implementar en el gateway el enrutamiento por prefijo a cada servicio, CORS, límite de solicitudes e identificador de correlación, y verificar con pruebas de integración que cada prefijo llega a su servicio y que los servicios no son alcanzables fuera de la red interna
- [ ] 1.5 Implementar la autenticación entre servicios con token de servicio y el formato común de error `{ codigo, mensaje, detalle }`, y verificar con pruebas que una llamada interna sin token es rechazada
- [ ] 1.6 Definir en `packages/contracts` los tipos de los contratos de la decisión 9 del diseño y publicar la especificación OpenAPI de cada servicio, y verificar que servicios y clientes compilan importando esos tipos
- [ ] 1.7 Configurar la integración continua con lint, compilación y pruebas de todos los workspaces, y verificar que una ejecución completa pasa en la rama principal
- [ ] 1.8 Solicitar las credenciales de integración de Webpay y la cuenta comercial y documentación de la API de Starken, y verificar que la solicitud quedó enviada y registrada en `docs/integraciones.md` con su estado
- [ ] 1.9 Documentar en `README.md` cómo levantar el entorno, ejecutar pruebas y agregar un servicio, y verificar que los comandos funcionan tal como están escritos en una copia limpia del repositorio

## 2. Sprint 1 (semanas 1-3): Base de datos

- [ ] 2.1 Crear los esquemas `usuarios`, `inventario`, `ventas`, `pagos` y `logistica` con un usuario de base de datos por servicio, y verificar con una prueba que cada usuario no puede leer tablas de otro esquema
- [ ] 2.2 Escribir las migraciones del esquema `usuarios` (roles, usuarios, sesiones) con los cinco roles como datos iniciales, y verificar que se aplican y revierten sin errores
- [x] 2.3 Escribir las migraciones del esquema `inventario` (categorías, productos, tallas, colores, variantes, ubicaciones, existencias, reservas, tipos de movimiento y de merma, movimientos, conteos, búsquedas), y verificar con pruebas las restricciones de unicidad y los `CHECK` de cantidad no negativa
- [x] 2.4 Escribir las migraciones de los esquemas `ventas`, `pagos` y `logistica` con sus claves foráneas entre esquemas, y verificar que el conjunto completo se aplica en orden sobre una base vacía
- [x] 2.5 Cargar los datos de referencia (ubicaciones, tipos de movimiento, tipos de merma, estados, medios de pago, regiones y comunas de Chile), y verificar con una consulta que cada tabla de referencia tiene sus filas
- [x] 2.6 Generar el diagrama entidad-relación en `docs/modelo-datos.md` con la justificación de 3FN de cada corrección, y verificar que el diagrama coincide con las tablas creadas por las migraciones

## 3. Sprint 1 (semanas 1-3): Usuarios, sesión y control por rol

- [ ] 3.1 Implementar el registro de clientes con hash Argon2id y validación de correo único, y verificar con pruebas los escenarios de registro correcto, correo repetido e intento de registrar otro rol
- [ ] 3.2 Implementar inicio de sesión, renovación y cierre de sesión con JWT RS256 y token de refresco revocable, y verificar con pruebas los escenarios de credenciales correctas, incorrectas, cuenta desactivada, sesión expirada y cierre de sesión
- [ ] 3.3 Implementar la gestión de cuentas internas por el Gerente (alta, cambio de rol, desactivación con revocación de sesiones), y verificar con pruebas que solo el Gerente puede hacerlo y que una cuenta desactivada pierde sus sesiones
- [ ] 3.4 Implementar la validación del token y el control por rol en el gateway y el guard de roles reutilizable en los servicios, y verificar con pruebas una ruta permitida y una denegada por cada rol de la matriz de permisos
- [ ] 3.5 Implementar la lista de cuentas internas de solo lectura para RRHH, y verificar con pruebas que RRHH la obtiene y que recibe rechazo en dashboard, ventas, transacciones y movimientos
- [ ] 3.6 Crear un script que genere una cuenta inicial de Gerente, y verificar que con ella se puede iniciar sesión en un entorno recién levantado

## 4. Sprint 1 (semanas 1-3): UI/UX y base de los clientes

- [ ] 4.1 Diseñar los flujos y prototipos navegables de e-commerce, POS, app de bodega y dashboard, y verificar que quedan aprobados por el dueño del producto en la revisión de diseño
- [ ] 4.2 Definir la guía de estilos (colores, tipografía, componentes base) con identidad de la tienda en `docs/ui.md`, y verificar que los tres clientes usan los mismos valores de diseño
- [ ] 4.3 Generar `apps/ecommerce-web` y `apps/backoffice-web` con React, Vite, enrutamiento y cliente de API tipado con `packages/contracts`, y verificar que ambos compilan y muestran su página inicial
- [x] 4.4 Generar `apps/bodega-mobile` con Ionic Angular y Capacitor para Android, y verificar que `ionic build` y `npx cap sync` terminan sin errores
- [ ] 4.5 Implementar en los tres clientes el inicio de sesión, el manejo de sesión expirada, el cierre de sesión y la navegación según rol, y verificar con pruebas que cada rol ve solo sus módulos y que una sesión expirada lleva al inicio de sesión
- [ ] 4.6 Realizar la review y la retrospectiva del Sprint 1 con demostración del entorno, la base de datos y el inicio de sesión por rol, y verificar que el acta con acuerdos queda en `docs/sprints/sprint-1.md`

## 5. Sprint 2 (semanas 4-6): Catálogo e inventario

- [ ] 5.1 Implementar la gestión de productos y variantes con asignación automática de SKU y código, y verificar con pruebas los escenarios de creación con variantes, variante duplicada, SKU o código repetido y desactivación
- [ ] 5.2 Implementar la restricción de precio y costo al Gerente y el ocultamiento del costo para otros roles, y verificar con pruebas que Bodega y Vendedor no pueden modificarlos ni recibir el costo en las respuestas
- [ ] 5.3 Implementar la generación del PDF de etiquetas con QR, SKU, nombre, talla y color, y verificar que el QR de una etiqueta generada se lee e identifica su variante
- [ ] 5.4 Implementar la operación atómica de stock con bloqueo ordenado de filas y cálculo de disponibilidad, y verificar con una prueba de concurrencia que de 20 ventas simultáneas sobre una unidad exactamente una tiene éxito
- [ ] 5.5 Implementar ingresos, mermas, traspasos, ajustes por conteo y devoluciones con registro de movimiento y motivo, y verificar con pruebas todos los escenarios de CU-08, CU-09 y de registro de mermas
- [ ] 5.6 Implementar la idempotencia de las operaciones de inventario por clave, y verificar con pruebas que un reenvío no duplica el movimiento
- [ ] 5.7 Implementar las salidas por venta, las reservas con vencimiento, su confirmación, liberación y el descuento por despacho, junto con la tarea que libera reservas vencidas, y verificar con pruebas los cuatro escenarios de reserva y que el POS no puede vender unidades reservadas
- [ ] 5.8 Implementar la consulta de existencias por ubicación, el historial de movimientos con filtros y la búsqueda de variante por código, y verificar con pruebas el orden del historial y la respuesta ante un código desconocido
- [ ] 5.9 Implementar el registro de inicio y fin de búsqueda de producto, y verificar con pruebas que una búsqueda completada guarda su duración y una cancelada no

## 6. Sprint 2 (semanas 4-6): App de bodega

- [x] 6.1 Integrar `@capacitor-mlkit/barcode-scanning` en un servicio de escaneo con manejo de permiso de cámara y búsqueda manual alternativa, y verificar con pruebas sobre un plugin simulado la lectura, la cancelación y el permiso denegado
- [x] 6.2 Implementar la consulta de variante por escaneo con existencias por ubicación, y verificar los escenarios de consulta por escaneo y de código desconocido
- [x] 6.3 Implementar la pantalla de ingreso de mercadería con varias variantes agregadas por escaneo, y verificar los escenarios de ingreso correcto, varias variantes y cantidad no válida
- [x] 6.4 Implementar las pantallas de merma (tipo y motivo obligatorios), traspaso y conteo, y verificar con pruebas las validaciones de cada formulario y los mensajes de rechazo del servicio
- [x] 6.5 Implementar el flujo de búsqueda de producto con cronómetro y confirmación por escaneo, y verificar que la duración queda registrada en el servicio
- [x] 6.6 Implementar el manejo de fallas de conexión (conservar datos, reintentar con la misma clave, botón deshabilitado durante el envío), y verificar con pruebas que un reintento no duplica la operación
- [ ] 6.7 Instalar la app en un dispositivo Android y verificar el escaneo de una etiqueta impresa real en ingreso, merma y traspaso

## 7. Sprint 2 (semanas 4-6): Ventas POS

- [ ] 7.1 Implementar en Ventas el registro de venta POS orquestando Inventario y el registro del pago presencial, con clave de idempotencia, y verificar con pruebas de integración los escenarios de venta correcta, producto sin stock y doble confirmación
- [ ] 7.2 Implementar en Pagos el registro de pagos presenciales con comisión según la tasa del medio, y verificar con pruebas los escenarios de efectivo y de tarjeta
- [ ] 7.3 Implementar la selección de ubicación de origen por línea (sala de ventas por defecto, bodega como alternativa), y verificar con pruebas ambos escenarios
- [ ] 7.4 Implementar la pantalla POS con búsqueda, escaneo, cantidades, total y medio de pago, y verificar con pruebas el cálculo del total y los rechazos por venta sin productos o sin medio de pago
- [ ] 7.5 Implementar el comprobante interno con leyenda de documento no tributario, vista de impresión, reimpresión y envío por correo, y verificar con pruebas su contenido y que una venta rechazada no lo genera
- [ ] 7.6 Implementar la consulta de ventas (propias para Vendedor, todas para Gerente), y verificar con pruebas el filtrado por rol
- [ ] 7.7 Escribir la prueba de extremo a extremo de una venta POS completa con Playwright, y verificar que pasa contra el entorno de `docker compose`
- [ ] 7.8 Realizar la review y la retrospectiva del Sprint 2 con demostración de ingreso por escaneo, merma y venta POS con descuento de stock, y verificar que el acta queda en `docs/sprints/sprint-2.md`

## 8. Sprint 3 (semanas 7-9): E-commerce

- [ ] 8.1 Implementar los endpoints públicos de catálogo con filtros, búsqueda, detalle y disponibilidad calculada en cada consulta, y verificar con pruebas todos los escenarios de CU-01 y CU-02
- [ ] 8.2 Implementar las páginas de catálogo y detalle de producto con selección de talla y color y actualización periódica de la disponibilidad, y verificar que una venta POS de la última unidad deja la variante como agotada en la web
- [ ] 8.3 Implementar el carrito en el dispositivo y el endpoint de validación de precios y disponibilidad, y verificar con pruebas todos los escenarios de CU-03
- [ ] 8.4 Implementar el registro de clientes y el paso de inicio de sesión dentro del checkout conservando el carrito, y verificar el escenario de visitante sin sesión
- [ ] 8.5 Implementar el formulario de despacho con región y comuna y el resumen con flete, usando un cotizador simulado detrás del adaptador de Starken, y verificar los escenarios de resumen y de datos incompletos
- [ ] 8.6 Implementar en Ventas el checkout que crea la venta, reserva el stock e inicia el pago, usando un pago simulado detrás del adaptador de Webpay, y verificar con pruebas los escenarios de stock disponible e insuficiente
- [ ] 8.7 Implementar la saga de confirmación (pago confirmado, pago fallido, creación del pedido, vaciado del carrito, correo de confirmación) y la tarea de reconciliación, y verificar con pruebas de integración cada rama y la recuperación tras la caída simulada de un servicio
- [ ] 8.8 Implementar el registro anónimo de visitas, y verificar que varias páginas en una misma visita cuentan una sola
- [ ] 8.9 Ajustar el diseño adaptable del e-commerce, y verificar con una prueba de Playwright a 360 px de ancho que la compra completa no produce desplazamiento horizontal

## 9. Sprint 3 (semanas 7-9): Pedidos, dashboard y carga inicial

- [ ] 9.1 Implementar en Logística la creación del pedido, sus estados con historial y la lista de pedidos por preparar con marca de urgencia, y verificar con pruebas los escenarios de estados y de pedidos por preparar
- [ ] 9.2 Implementar la consulta de pedidos del cliente con aislamiento por cuenta y las páginas de lista y detalle, y verificar con pruebas CU-05 y que un pedido ajeno responde como inexistente
- [ ] 9.3 Implementar los reportes internos de cada servicio y la composición del dashboard en el gateway con filtro de periodo, y verificar con pruebas que solo el Gerente lo obtiene
- [ ] 9.4 Implementar los indicadores comerciales y de inventario (ventas por canal, ticket promedio, conversión, exactitud, diferencias, mermas por tipo, tiempo de búsqueda), y verificar con pruebas los valores de los escenarios numéricos de la especificación
- [ ] 9.5 Implementar la rentabilidad neta por venta con costo unitario guardado al vender, comisión y costo de despacho, y verificar con pruebas los dos ejemplos numéricos y la advertencia por producto sin costo
- [ ] 9.6 Implementar los parámetros financieros y el cálculo de ROI, VAN y TIR con flujos reales y proyectados, y verificar con pruebas el caso de VAN $182.237 y ROI 20%, la TIR no calculable y los parámetros no válidos
- [ ] 9.7 Implementar la verificación periódica del catálogo en el gateway y los indicadores logísticos y de disponibilidad, y verificar con pruebas el cálculo de pedidos despachados en 24 horas
- [ ] 9.8 Implementar la pantalla del dashboard con gráficos y la comparación de cada indicador con su meta, y verificar los escenarios de meta cumplida, meta no cumplida y periodo sin datos
- [ ] 9.9 Implementar la carga inicial (importación CSV todo o nada, primer conteo, conteo de validación por otra persona, resolución de diferencias, activación y bloqueo de ventas antes de activar), y verificar con pruebas todos los escenarios del requisito de carga inicial
- [ ] 9.10 Realizar la review y la retrospectiva del Sprint 3 con demostración de una compra web con pago simulado, el pedido resultante y el dashboard, y verificar que el acta queda en `docs/sprints/sprint-3.md`

## 10. Sprint 4 (semanas 10-12): Integración con Webpay

- [ ] 10.1 Implementar el adaptador de Webpay Plus con el SDK oficial de Transbank (crear, confirmar, consultar estado, reversar) contra el ambiente de integración, y verificar con un pago de prueba autorizado de extremo a extremo
- [ ] 10.2 Implementar el retorno idempotente por token y el registro de toda transacción con su estado y motivo, y verificar con pruebas los escenarios de pago autorizado, rechazado, anulado y recarga de la página de retorno
- [ ] 10.3 Implementar la resolución de pagos sin retorno consultando el estado en Webpay desde la reconciliación, y verificar con una prueba que una compra abandonada queda expirada y con la reserva liberada
- [ ] 10.4 Implementar el reverso automático con reintentos y marca de revisión manual, y verificar con pruebas el reverso tras una reserva no confirmable y el caso de reverso que falla
- [ ] 10.5 Implementar el cálculo de comisión por tipo de pago, la pantalla de tasas del Gerente y el listado de transacciones, y verificar con pruebas el ejemplo de comisión de $1.000 y el acceso restringido al Gerente
- [ ] 10.6 Verificar con una revisión de código y de tráfico que ningún cliente ni servicio solicita, transmite ni guarda datos de tarjeta, y dejar el resultado en `docs/integraciones.md`

## 11. Sprint 4 (semanas 10-12): Integración con Starken

- [ ] 11.1 Implementar el adaptador de Starken (cotizar, emitir despacho, consultar seguimiento) con tiempo máximo de espera, y verificar una cotización real para una comuna de Santiago y una de regiones
- [ ] 11.2 Implementar la caché de tarifas por comuna y tramo y las tarifas de respaldo por zona, y verificar con pruebas los escenarios de Starken caído con y sin tarifa guardada y de comuna sin cobertura
- [ ] 11.3 Implementar la generación de despacho con descuento de stock, guardado del número de seguimiento, costo real y aviso por correo, y verificar con pruebas los escenarios de CU-11
- [ ] 11.4 Implementar la cola de reintentos de despacho con espera creciente y paso a atención manual, y verificar con pruebas los escenarios de Starken caído, recuperación, reintentos agotados y reintento sin duplicar
- [ ] 11.5 Implementar la actualización periódica del seguimiento y el paso a entregado, y verificar con pruebas los escenarios de cambio de estado, entrega y Starken caído al consultar
- [ ] 11.6 Implementar en el backoffice la pantalla de pedidos por preparar y de generación de despacho, y verificar con una prueba de extremo a extremo el flujo desde pedido pagado hasta despachado

## 12. Sprint 4 (semanas 10-12): Pruebas de integración y piloto

- [ ] 12.1 Ejecutar la suite completa de pruebas unitarias, de integración y de extremo a extremo, y verificar que pasa sin fallas en la integración continua
- [ ] 12.2 Ejecutar la prueba de doble venta entre canales: una compra web y una venta POS simultáneas sobre la última unidad, y verificar que solo una se confirma y la otra recibe stock insuficiente
- [ ] 12.3 Ejecutar las pruebas de falla de las integraciones (Webpay sin respuesta, pago rechazado, Starken caído en cotización y en emisión), y verificar que el checkout y el POS siguen operando y no quedan ventas ni reservas inconsistentes
- [ ] 12.4 Ejecutar una prueba de acceso por rol recorriendo la matriz de permisos completa con una cuenta de cada rol, y verificar que no existe ninguna operación permitida fuera de la matriz
- [ ] 12.5 Configurar el ambiente de producción con respaldos diarios de PostgreSQL, y verificar con una restauración de prueba que el respaldo es recuperable
- [ ] 12.6 Escribir los manuales breves de uso para Vendedor, Bodega y Gerente en `docs/manuales/`, y verificar que una persona de cada rol completa su flujo principal siguiéndolos
- [ ] 12.7 Ejecutar la carga inicial en la tienda (importación, etiquetado, doble conteo, resolución de diferencias y activación), y verificar que el sistema queda activado sin diferencias pendientes
- [ ] 12.8 Operar el piloto de una semana con POS y bodega en producción y papel en paralelo, abrir el e-commerce con credenciales de producción al tercer día, y verificar al cierre que la exactitud de inventario medida por conteo es mayor o igual a 98%
- [ ] 12.9 Ejecutar `openspec validate plataforma-omnicanal-mvp --strict` y verificar que no reporta errores
- [ ] 12.10 Realizar la review y la retrospectiva del Sprint 4 con demostración del flujo omnicanal completo y los resultados del piloto, y verificar que el acta queda en `docs/sprints/sprint-4.md`
