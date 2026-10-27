# syntax=docker/dockerfile:1

# Imagen de la app de bodega: solo este módulo, servido como sitio estático.
# La base de datos y el backend corren en sus propios contenedores.
#
# El contexto de construcción es la raíz del repositorio, porque la app comparte los
# tipos de `packages/contracts` y el archivo de dependencias del monorepo:
#
#   docker build -f apps/bodega-mobile/Dockerfile -t rockstar-app .

# ---------- Compilación ----------
FROM node:24-slim AS compilacion
WORKDIR /repo
ENV CI=true NG_CLI_ANALYTICS=false

# Primero solo los manifiestos: la instalación queda en caché mientras no cambien las dependencias.
COPY package.json package-lock.json ./
COPY apps/bodega-mobile/package.json apps/bodega-mobile/
COPY packages/contracts/package.json packages/contracts/
COPY services/api/package.json services/api/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace=bodega-mobile

COPY packages/contracts packages/contracts
COPY apps/bodega-mobile apps/bodega-mobile
# La configuración `docker` desactiva el backend simulado y apunta la app a `/api/v1`.
RUN npm run build --workspace=bodega-mobile -- --configuration docker

# ---------- Ejecución ----------
FROM nginx:stable-alpine

# Dirección del backend dentro de la red de Docker; el servidor web le reenvía `/api`.
ENV API_URL=http://api:3000

# La imagen de nginx sustituye las variables de las plantillas al arrancar.
COPY apps/bodega-mobile/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=compilacion /repo/apps/bodega-mobile/www /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
