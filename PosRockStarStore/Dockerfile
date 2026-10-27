# syntax=docker/dockerfile:1

# POS Rockstar Store: frontend Ionic React + Vite, servido como sitio estatico.
# La base de datos (PostgreSQL) y el backend (NestJS) corren en los contenedores
# rockstar-db-1 y rockstar-api-1 del proyecto App-mobile-docker-backend.
# Este contenedor solo sirve el POS y reenvia /api al backend.

# ---------- Compilacion ----------
FROM node:24-slim AS compilacion
WORKDIR /app
ENV CI=true

# Primero solo los manifiestos: la instalacion queda en cache si no cambian.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . ./
RUN npm run build

# ---------- Ejecucion ----------
FROM nginx:stable-alpine

# Direccion del backend dentro de la red rockstar_default.
# Al arrancar con docker compose se pasa API_URL=http://api:3000.
ENV API_URL=http://api:3000

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=compilacion /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
