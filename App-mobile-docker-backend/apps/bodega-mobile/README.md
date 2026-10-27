# Rockstar Bodega

App móvil de bodega (Ionic Angular + Capacitor): los envíos del e-commerce y cuatro operaciones (ingresar producto, buscar producto, ubicaciones, que son los racks de la bodega, e ingreso de merma), con escaneo de QR y códigos de barras.

## Ejecutar

Desde la raíz del repositorio, una sola vez:

```
npm install
```

Desde `apps/bodega-mobile`:

| Comando | Qué hace |
|---|---|
| `npm start` | Abre la app en el navegador (`http://localhost:4200`) |
| `npm test -- --watch=false` | Ejecuta las pruebas unitarias |
| `ionic build` | Genera la app web en `www/` |
| `npx cap sync` | Copia `www/` y los plugins al proyecto Android |

## Backend simulado

Los servicios de la plataforma aún no existen, así que la app trae un backend en memoria que responde el mismo contrato y aplica las mismas reglas (stock no negativo, unidades reservadas, idempotencia). Se controla en `src/environments/environment*.ts`:

- `useMockApi: true` usa el backend simulado. Los datos vuelven a su estado inicial al recargar la app.
- `useMockApi: false` envía las solicitudes al API Gateway indicado en `apiUrl`.

Cuentas del backend simulado:

| Correo | Contraseña | Rol |
|---|---|---|
| `bodega@rockstar.cl` | `bodega123` | Bodega (puede entrar) |
| `vendedor@rockstar.cl` | `vendedor123` | Vendedor (la app lo rechaza) |

Productos de ejemplo: SKU `RS-0001` a `RS-0008`, con códigos de barras `7800000000001` a `7800000000008`. `RS-0002` tiene unidades reservadas y `RS-0006` está desactivado. Varios pertenecen a una banda (Misfits, Metallica, Iron Maiden, AC/DC).

## Escáner

El escáner solo funciona en un dispositivo. En el navegador, y cuando se deniega el permiso de cámara, la app ofrece buscar por SKU o nombre.

## Android

Requiere Android Studio con su SDK.

```
ionic build
npx cap sync
npx cap open android
```

Para probar contra servicios reales desde un teléfono, `apiUrl` debe apuntar a la IP del equipo donde corre el gateway, no a `localhost`.
