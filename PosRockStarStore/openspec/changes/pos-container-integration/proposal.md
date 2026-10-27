# Proposal

## Why

El POS actual corre en modo desarrollo local (`npm run dev`) y no está completamente integrado en el contenedor Docker de producción. Las imágenes de productos no se cargan desde el backend, faltan pruebas de integración reales, y la interfaz (especialmente el login) necesita mejoras visuales significativas para uso en caja real.

## What Changes

- **Docker-first**: Configurar el proyecto para que funcione completamente dentro del contenedor (build, runtime, proxy API, healthchecks)
- **Imágenes de productos**: Integrar carga y visualización de imágenes desde el backend Rockstar (bucket/storage configurado en `App-mobile-docker-backend`)
- **Pruebas de integración**: Agregar pruebas e2e reales contra la API en contenedor (login, catálogo, checkout, boleta, registro)
- **UI pulida**: Rediseño visual del frontend (tema tienda, tarjetas, formularios, feedback visual)
- **Login centrado y atractivo**: Pantalla de acceso centrada vertical/horizontalmente, con branding, validación visual, y mejor UX

## Capabilities

### New Capabilities

- `pos-docker-integration`: Configuración completa de Docker (Dockerfile, docker-compose, nginx, healthchecks, variables de entorno) para operación en contenedor
- `pos-imagenes-productos`: Carga, caché y visualización de imágenes de productos desde el backend con fallback y reintento
- `pos-pruebas-integracion`: Suite de pruebas e2e contra API real en contenedor (login vendedor/cliente, catálogo, carrito, checkout contado/tarjeta, boleta, registro jornada, refresco stock)
- `pos-ui-pulida`: Mejoras visuales globales (tema oscuro/rojo consistente, tipografía, espaciado, sombras, animaciones sutiles, estados de carga/error/vacío)
- `pos-login-atractivo`: Pantalla de login centrada, con logo animado, validación en tiempo real, mensajes de error integrados, remember-me, y accesibilidad completa

### Modified Capabilities

- `pos-autenticacion`: Extender para soportar sesión persistente en contenedor (cookies/tokens en localStorage sobreviviendo a recargas de contenedor) y validación visual de credenciales
- `pos-catalogo-carrito`: Agregar requerimiento de mostrar imágenes de productos con lazy-loading, placeholder animado, y error state visual
- `pos-cobro-boleta`: Agregar requerimiento de pruebas de integración completas contra API real en contenedor

## Impact

- **Código**: `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `src/pages/Login.tsx`, `src/pages/POS.tsx`, `src/theme/variables.css`, `src/lib/api.ts`, `cypress/`
- **APIs**: `GET /inventario/catalogo` (imagenUrl), `GET /inventario/productos` (imagenes), endpoints de autenticación existentes
- **Dependencias**: Ninguna nueva - usa stack actual (Ionic React, Vite, Cypress, Vitest)
- **Sistemas**: Requiere `App-mobile-docker-backend` corriendo (red `rockstar_default`, API en `api:3000`, imágenes servidas por backend)
- **Despliegue**: `docker compose up --build -d` levanta POS en `:8082` listo para producción