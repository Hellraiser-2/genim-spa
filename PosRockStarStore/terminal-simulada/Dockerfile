# syntax=docker/dockerfile:1

# Maquina de cobro simulada: hace de terminal de tarjetas en la red de la tienda.
# Sin dependencias: solo Node.
FROM node:24-alpine
WORKDIR /maquina
COPY servidor.mjs ./
ENV PUERTO=8090
EXPOSE 8090
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8090/api/estado || exit 1
CMD ["node", "servidor.mjs"]
