# Proposal

## Why

La tienda controla todo su inventario en carpetas de papel: no puede confirmar stock en tiempo real, vende productos que ya no existen, no registra mermas y calcula sus márgenes "a ojo". Esto le cuesta cerca de un 22% de ingresos perdidos, un 18% de fuga de inventario y un 35% de decisiones tomadas sin datos confiables. Se necesita una única fuente de verdad de inventario que conecte bodega, punto de venta y e-commerce, disponible como MVP en 12 semanas.

## What Changes

El repositorio no tiene código todavía; todo lo siguiente es nuevo.

- Plataforma con arquitectura SOA: un API Gateway que expone cinco servicios independientes (Usuarios, Ventas, Inventario, Pagos y Logística) sobre PostgreSQL como fuente única de datos.
- E-commerce web responsive en React para clientes: catálogo con disponibilidad en tiempo real, carrito, pago con Webpay y seguimiento del pedido.
- POS web para vendedores: registro de ventas en tienda, comprobante interno de venta y generación de despachos.
- App móvil de bodega en Ionic Angular: ingreso de mercadería, escaneo de QR o código de barras, traspasos, conteos y registro de mermas.
- Dashboard administrativo para el Gerente con KPIs comerciales, de inventario, logísticos y financieros (rentabilidad neta, ROI, VAN y TIR).
- Inventario por variante (producto + talla + color) con SKU y código propios, llevado en dos ubicaciones (bodega y sala de ventas), con descuento o bloqueo atómico de stock para impedir la doble venta entre canales.
- Control de acceso por rol con credenciales independientes: Cliente, Vendedor, Bodega, Gerente/Finanzas y RRHH.
- Integración con Webpay (pagos, con reverso automático) y con Starken (cotización de flete, despachos y tracking, con caché de tarifas y reintentos).
- Proceso de carga inicial para migrar el inventario en papel, con validación física cruzada y etiquetado antes de activar el sistema.
- Reemplaza y absorbe la propuesta anterior `add-inventory-mobile-app`, que fue eliminada.

Fuera de alcance:

- Compras automáticas a proveedores, reposición con IA y logística de proveedores.
- Contabilidad y facturación electrónica: el comprobante del POS es interno, sin validez tributaria; la boleta del SII se sigue emitiendo por el medio actual de la tienda.
- Gestión financiera y remuneraciones; gestión de personal. RRHH existe solo como rol con permisos restringidos.
- Marketplace multitienda e integración con ERP.
- App móvil para clientes (solo versión web).

## Capabilities

### New Capabilities

- `auth-rbac`: registro e inicio de sesión, manejo de la sesión, cuentas internas y control de acceso por rol.
- `catalogo`: productos, variantes con SKU y código, etiquetas, consulta pública del catálogo y disponibilidad en tiempo real (CU-01, CU-02).
- `inventario`: stock por variante y ubicación, movimientos, ingresos, mermas, traspasos, conteos, escaneo, protección contra sobreventa y carga inicial (CU-08, CU-09, CU-10).
- `ventas-pos`: registro de ventas en tienda y emisión del comprobante interno (CU-06, CU-07).
- `ecommerce-checkout`: carrito, checkout, creación del pedido y consulta de pedido con tracking (CU-03, CU-05).
- `pagos-webpay`: pago con Webpay, registro de transacciones, reverso automático y comisiones (CU-04).
- `logistica-starken`: cotización de flete, generación de despachos y seguimiento mediante Starken (CU-11).
- `dashboard-kpis`: indicadores comerciales, de inventario, logísticos y financieros para el Gerente (CU-12).

### Modified Capabilities

Ninguna. No existen especificaciones previas en el proyecto.

## Impact

- **Código**: monorepo nuevo con el gateway y los cinco servicios en `services/`, y los tres clientes en `apps/` (e-commerce, backoffice con POS y dashboard, app de bodega).
- **Datos**: base PostgreSQL nueva. El modelo entregado se normaliza a 3FN: talla y color pasan a una tabla de variantes con SKU propio, y el stock sale de la tabla de productos.
- **Integraciones externas**: Webpay (Transbank) y la API de Starken. Ambas requieren credenciales comerciales que debe gestionar la tienda.
- **Operación de la tienda**: el control en papel se reemplaza. Antes de activar el sistema hay que cargar el catálogo, etiquetar las prendas y hacer un conteo físico cruzado.
- **Personas**: cada vendedor, bodeguero, gerente y encargado de RRHH necesita su propia cuenta; los clientes se registran por su cuenta en el e-commerce.
- **Plazo**: 12 semanas en cuatro sprints de tres semanas, cada uno con review y retrospectiva.
