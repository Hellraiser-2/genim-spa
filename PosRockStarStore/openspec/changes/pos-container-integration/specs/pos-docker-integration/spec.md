# Spec Delta

## Purpose

Configura el POS para operar completamente dentro de contenedor Docker: build reproducible, runtime con nginx, proxy API transparente, healthchecks, y variables de entorno para distintos entornos.

## ADDED Requirements

### Requirement: Build reproducible en contenedor

El sistema SHALL compilar la aplicación dentro del contenedor usando Node 24 y Vite, generando archivos estáticos optimizados para nginx.

#### Scenario: Build exitoso en CI/CD
- **WHEN** se ejecuta `docker compose build`
- **THEN** la imagen se construye sin errores y contiene `/usr/share/nginx/html` con `index.html` y assets hasheados

#### Scenario: Cache de dependencias
- **WHEN** `package.json` y `package-lock.json` no cambian
- **THEN** `npm ci` usa cache y no re-descarga dependencias

### Requirement: Runtime con nginx y proxy API

El sistema SHALL servir el POS via nginx en puerto 80 y reenviar `/api/*` al backend `api:3000` sin CORS.

#### Scenario: Proxy API transparente
- **WHEN** el navegador llama a `/api/v1/inventario/catalogo`
- **THEN** nginx reenvía a `http://api:3000/api/v1/inventario/catalogo` y retorna respuesta idéntica

#### Scenario: SPA fallback
- **WHEN** se accede a ruta inexistente (ej. `/pos`)
- **THEN** nginx sirve `index.html` y React Router maneja la navegación

### Requirement: Healthchecks de contenedor

El sistema SHALL exponer healthcheck HTTP en `/` para que Docker detecte contenedor sano.

#### Scenario: Healthcheck pasa
- **WHEN** contenedor está listo y nginx responde en `/`
- **THEN** `docker inspect` muestra `health: healthy`

#### Scenario: Healthcheck falla
- **WHEN** nginx no responde o retorna error
- **THEN** contenedor marcado `unhealthy` y reiniciado según política

### Requirement: Variables de entorno por entorno

El sistema SHALL aceptar `API_URL` y `POS_PUERTO` via `docker-compose.yml` y `.env`.

#### Scenario: Configuración desarrollo
- **WHEN** `docker compose up` con `API_URL=http://api:3000` y `POS_PUERTO=8082`
- **THEN** POS accesible en `localhost:8082` y API proxy funciona

#### Scenario: Configuración producción
- **WHEN** variables sobrescritas en `.env.production`
- **THEN** contenedor usa valores de producción sin rebuild de imagen