# Spec Delta

## Purpose

Integra carga, caché y visualización de imágenes de productos desde el backend Rockstar con fallback animado, lazy-loading, y reintento automático.

## ADDED Requirements

### Requirement: Carga de imágenes desde backend

El sistema SHALL obtener `imagenUrl` de `GET /inventario/catalogo` y `GET /inventario/productos` y mostrarla en tarjetas de producto.

#### Scenario: Imagen disponible
- **WHEN** variante tiene `imagenUrl` válida
- **THEN** tarjeta muestra imagen cargada con aspect-ratio 1:1 y object-fit cover

#### Scenario: Imagen nula o vacía
- **WHEN** variante tiene `imagenUrl: null` o string vacío
- **THEN** tarjeta muestra placeholder SVG animado (skeleton/shimmer) con icono de imagen

#### Scenario: Error de carga (404, red, CORS)
- **WHEN** imagen falla al cargar (`onError`)
- **THEN** se muestra placeholder estático con icono y texto "Sin imagen", sin romper layout

### Requirement: Lazy-loading y performance

El sistema SHALL cargar imágenes solo cuando entran en viewport (IntersectionObserver) con placeholder de baja calidad (LQIP) durante la carga.

#### Scenario: Imagen entra en viewport
- **WHEN** usuario hace scroll y tarjeta se vuelve visible
- **THEN** se inicia carga de `imagenUrl` y placeholder se reemplaza suavemente

#### Scenario: Imagen fuera de viewport
- **WHEN** tarjeta no es visible
- **THEN** no se solicita la imagen (ahorro de ancho de banda)

### Requirement: Reintento automático

El sistema SHALL reintentar carga de imagen fallida hasta 2 veces con backoff exponencial antes de mostrar error definitivo.

#### Scenario: Fallo transitorio recuperado
- **WHEN** primer intento falla por red y segundo tiene éxito
- **THEN** imagen se muestra normalmente sin intervención del usuario

#### Scenario: Fallo permanente
- **WHEN** 3 intentos fallan
- **THEN** se muestra placeholder de error definitivo con botón "Reintentar" manual

### Requirement: Formato y optimización

El sistema SHALL solicitar imágenes en WebP cuando el navegador lo soporte, con fallback a JPEG/PNG.

#### Scenario: Navegador soporta WebP
- **WHEN** `Accept: image/webp` en request
- **THEN** backend sirve WebP y frontend renderiza sin conversión

#### Scenario: Navegador sin WebP
- **WHEN** sin soporte WebP
- **THEN** backend sirve JPEG/PNG original