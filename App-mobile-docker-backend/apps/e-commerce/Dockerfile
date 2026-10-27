# syntax=docker/dockerfile:1

# Imagen de la tienda web, servida como sitio estático. El backend y la base de datos
# corren en sus propios contenedores.
#
# El contexto de construcción es la raíz del repositorio, porque la tienda comparte los
# tipos de `packages/contracts`. Sus dependencias son propias (`package-lock.json` de
# esta carpeta): usa otra versión de Angular que la app de bodega.
#
#   docker build -f apps/e-commerce/Dockerfile -t rockstar-tienda .

# ---------- Compilación ----------
FROM node:20-alpine AS compilacion
WORKDIR /repo/apps/e-commerce
ENV CI=true NG_CLI_ANALYTICS=false

# Primero solo los manifiestos: la instalación queda en caché mientras no cambien las dependencias.
COPY apps/e-commerce/package.json apps/e-commerce/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY packages/contracts /repo/packages/contracts
COPY apps/e-commerce ./
RUN npm run build

# ---------- Ejecución ----------
FROM nginx:stable-alpine

# Dirección del backend dentro de la red de Docker; el servidor web le reenvía `/api`.
ENV API_URL=http://api:3000

# La imagen de nginx sustituye las variables de las plantillas al arrancar.
COPY apps/e-commerce/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=compilacion /repo/apps/e-commerce/www/browser /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
