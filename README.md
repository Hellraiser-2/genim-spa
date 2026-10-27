# Genim SPA

Plataforma omnicanal para una tienda de ropa: tienda web, punto de venta (POS), app de bodega y backend, con un solo inventario para todos los canales.

| Carpeta | Qué contiene |
|---|---|
| [`App-mobile-docker-backend`](App-mobile-docker-backend) | Backend (NestJS + PostgreSQL), tienda web y app de bodega (Ionic Angular + Capacitor) |
| [`PosRockStarStore`](PosRockStarStore) | Punto de venta (Ionic React + Vite + Capacitor) y máquina de cobro simulada |

## Levantar el sistema

Requiere Docker. El POS se une a la red que crea el backend, así que el backend va primero:

```
cd App-mobile-docker-backend
docker compose up -d

cd ../PosRockStarStore
docker compose up -d
```

| Módulo | Dirección |
|---|---|
| Tienda web | http://localhost:8081 |
| App de bodega | http://localhost:8080 |
| POS | http://localhost:8082 |
| API | http://localhost:3000/api/v1 |

Las cuentas de demostración, las pruebas y las apps Android se explican en el README de cada carpeta.
