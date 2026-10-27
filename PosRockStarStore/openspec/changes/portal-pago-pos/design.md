# Design

## Context

Ver `proposal.md` (Why) y los specs de `pos-autenticacion`, `pos-catalogo-carrito` y `pos-cobro-boleta` para el qué. Estado actual verificado en el repositorio:

- `PosRockStarStore` es una plantilla Ionic React en blanco con `src/lib/api.ts` ya conectado (`salud`, `login`, `getCatalogo`, `getProductos`, `buscarVariantes`) y servido en Docker en `:8082` con proxy `/api` → `http://api:3000` (red `rockstar_default`).
- El backend no se modifica: `POST /usuarios/auth/login` recibe `{email, password}`; `GET /inventario/catalogo` es público; `GET /inventario/productos` exige VENDEDOR/BODEGA/GERENTE; `POST /ventas/checkout` exige CLIENTE con `{claveIdempotencia, lineas, despacho}` y responde `{idVenta, subtotal, flete, total, tokenPago, expiraEn}`; `POST /pagos/webpay/retorno` recibe `{tokenPago, aprobar?}` y responde `{estado, idVenta, total, idPedido?, motivo?}`.
- Referencia visual: `apps/e-commerce/src/app/pages/shop/shop.page.ts` (tema oscuro, acento rojo, `product-card` con insignias, `formatCLP`, aviso "Últimas unidades" y botón Agregar inhabilitado sin stock).

## Goals / Non-Goals

**Goals:**

- Onepage `/pos` que opere la jornada completa de caja sin salir de la vista.
- Cero cambios en el backend: todo el flujo POS vive en el frontend y los contratos existentes.
- Stock como invariante: el carrito nunca supera el disponible mostrado y el servidor tiene la última palabra.

**Non-Goals:**

- Nuevo endpoint de venta POS en el backend (descartado por decisión del usuario).
- Despacho a domicilio desde el POS (el checkout exige `despacho`; el POS envía datos de retiro en tienda).
- Modo sin conexión total: sin red no se puede vender, solo se conserva lo ya registrado.
- PDF de boleta o integración con impresora fiscal (solo impresión del navegador).

## Decisions

- **Doble sesión (vendedor + cliente).** El vendedor inicia sesión para operar catálogo y gestión; el checkout se ejecuta con una sesión CLIENTE (cuenta de mostrador o la del comprador). Alternativa descartada: pedir al backend un rol nuevo para vender, porque implicaba cambiar contratos y matriz de permisos. El POS guarda ambos tokens separados y usa cada uno en su dominio.
- **Catálogo base público + disponible de gestión.** Se lista `GET /inventario/catalogo` (precio + disponible) y, con sesión de vendedor, se enriquece con `GET /inventario/productos` para validación fina. Alternativa descartada: solo catálogo público, que oculta variantes sin precio que igual conviene mostrar como no vendibles.
- **Carrito como mapa `idVariante → cantidad` con tope en `disponible`.** Cada `+`/`−` mueve de a 1 y recalcula detalle y total en memoria; el `+` se inhabilita al llegar al disponible y el 0 nunca entra al detalle. Alternativa descartada: validar solo al confirmar, porque permitiría armar carritos imposibles y rompería el requisito reactivo.
- **Checkout en dos pasos con clave de idempotencia por venta (UUID generado al confirmar).** Contado = checkout + retorno `aprobar: true` inmediato; tarjeta = checkout + retorno con aprobación o rechazo simulado. Reintentos reutilizan la misma clave. Alternativa descartada: un solo paso, imposible con el contrato actual de reserva de 15 minutos.
- **Despacho de retiro en tienda.** Como el contrato exige `DatosDespacho`, el POS envía una comuna/dirección fijas de la tienda ("Retiro en tienda") sin pedirle dirección al comprador presencial.
- **Boleta como vista + CSS de impresión.** Componente de boleta con los datos del retorno y del carrito confirmado; `window.print()` con hoja de impresión que solo muestra la boleta. Alternativa descartada: generar PDF en el cliente, innecesario para el alcance ver + imprimir.
- **Registro mixto.** Historial del backend (`GET /ventas/pendientes` con sesión cliente + resultados de retornos de la jornada) más copia local persistida en el navegador (para conteo y totales de cierre aunque el backend no liste ventas cerradas). Tras cada venta se recarga el catálogo para reflejar el stock al instante.
- **Tema tienda adaptado a Ionic React.** Variables oscuras y acento rojo tomadas de la tienda, cuadrícula responsiva (2→3→4 columnas) y formato CLP con `Intl.NumberFormat('es-CL')`.

## Risks / Trade-offs

- [Riesgo] La sesión CLIENTE de mostrador es compartida: sus `pendientes` mezclan ventas de distintas cajas → Mitigación: el registro de jornada filtra por ventas iniciadas desde este POS (clave de idempotencia e idVenta locales) y la copia local es la fuente del cierre.
- [Riesgo] Stock concurrente: dos cajas pueden reservar lo último a la vez → Mitigación: el servidor rechaza con stock insuficiente; el POS muestra "Sin stock", refresca disponibilidad y retira la línea.
- [Riesgo] Reserva de 15 minutos en ventas interrumpidas (pago con tarjeta abandonado) → Mitigación: el carrito se conserva, el registro marca la venta como pendiente con su vencimiento y el refresco de catálogo muestra el disponible real.
- [Riesgo] Divergencia entre copia local y backend → Mitigación: la copia local solo complementa (conteo/cierre); ante conflicto manda el backend.
- [Compromiso] Sin endpoint POS dedicado no hay precio de caja distinto ni descuentos de vendedor: rigen los precios del catálogo.

## Migration Plan

- Despliegue: solo frontend; `npm run build` + `docker compose up --build -d` en `PosRockStarStore`, sin tocar los contenedores Rockstar.
- Rollback: la vista `/pos` es aditiva sobre la plantilla; revertir el cambio deja el POS como estaba y las ventas ya registradas quedan en el backend.
- Datos: crear o confirmar la cuenta CLIENTE de mostrador y fijar los datos de "Retiro en tienda" antes del primer turno.

## Open Questions

- Ninguna que cambie specs, enfoque o tareas. Detalles menores a fijar en implementación: credenciales de la cuenta CLIENTE de mostrador, textos del giro en la boleta y umbral del aviso "Últimas unidades".
