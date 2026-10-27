# syntax=docker/dockerfile:1

# Imagen del backend en NestJS. La base de datos corre en su propio contenedor.
#
# El contexto de construcción es la raíz del repositorio, porque el backend comparte
# los tipos de `packages/contracts`, las migraciones de `db/migrations` y el archivo
# de dependencias del monorepo:
#
#   docker build -f services/api/Dockerfile -t rockstar-api .

FROM node:24-slim AS base
WORKDIR /repo
# Solo los manifiestos: la instalación queda en caché mientras no cambien las dependencias.
COPY package.json package-lock.json ./
COPY apps/bodega-mobile/package.json apps/bodega-mobile/
COPY packages/contracts/package.json packages/contracts/
COPY services/api/package.json services/api/

# ---------- Compilación ----------
FROM base AS compilacion
RUN --mount=type=cache,target=/root/.npm npm ci --workspace=api
COPY packages/contracts packages/contracts
COPY services/api services/api
RUN npm run build --workspace=api

# ---------- Dependencias de ejecución, sin las de desarrollo ----------
FROM base AS dependencias
RUN --mount=type=cache,target=/root/.npm npm ci --workspace=api --omit=dev

# ---------- Ejecución ----------
FROM node:24-slim
ENV NODE_ENV=production PUERTO=3000 JWT_CLAVES_DIR=/claves

# La misma estructura del repositorio: el servicio busca las migraciones en `db/migrations`.
COPY --from=dependencias /repo /repo
COPY --from=compilacion /repo/services/api/dist /repo/services/api/dist
COPY db/migrations /repo/db/migrations

# Carpeta del par de claves con que se firman los tokens. Montar un volumen aquí
# conserva las sesiones entre reinicios.
RUN mkdir /claves && chown node:node /claves
VOLUME /claves

WORKDIR /repo/services/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PUERTO + '/api/v1/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "dist/services/api/src/main.js"]
