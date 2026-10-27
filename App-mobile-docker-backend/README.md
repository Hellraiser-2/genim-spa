# Rockstar

Plataforma de inventario y venta para una tienda de ropa: app de bodega, tienda web, backend y base de datos.

| Pieza | Carpeta | Tecnología |
|---|---|---|
| App de bodega | `apps/bodega-mobile` | Ionic Angular + Capacitor |
| Tienda web | `apps/e-commerce` | Ionic Angular (dependencias propias, fuera del espacio de trabajo de npm) |
| Backend | `services/api` | NestJS |
| Base de datos | `db/migrations` | PostgreSQL |
| Contratos de la API | `packages/contracts` | Tipos de TypeScript compartidos |

El diseño completo y el plan de trabajo están en `openspec/changes/plataforma-omnicanal-mvp/`.

## Levantar todo con Docker

Cada pieza corre en su propio contenedor.

```
docker compose up --build
```

| Contenedor | Qué es | Dirección |
|---|---|---|
| `app` | App de bodega servida por nginx | http://localhost:8080 |
| `tienda` | Tienda web servida por nginx | http://localhost:8081 |
| `api` | Backend | http://localhost:3000/api/v1 |
| `db` | PostgreSQL | `localhost:5432`, solo desde este equipo |

Al arrancar, el backend crea las tablas y, si la base está vacía, carga datos de demostración.

| Cuenta | Contraseña | Rol |
|---|---|---|
| `bodega@rockstar.cl` | `bodega123` | Bodega. Es la única que entra a la app de bodega |
| `vendedor@rockstar.cl` | `vendedor123` | Vendedor |
| `gerente@rockstar.cl` | `gerente123` | Gerente. En la tienda define el precio de los productos |
| `cliente@rockstar.cl` | `cliente123` | Cliente. Compra en la tienda; también se puede crear una cuenta nueva |

**Catálogo de bandas.** Con el sistema arriba, este comando carga las fotos de 17 bandas y 19 productos de muestra de bandas conocidas. Se puede repetir: no duplica nada.

```
cd services/api
npm run semilla:bandas
```

Las fotos de las bandas son reales, de Wikimedia Commons con licencia libre; sus autores y licencias están en `db/semillas/bandas/CREDITOS.md`. Los productos son de muestra y su imagen es una ilustración, no una foto de la prenda.

Para sumar chaquetas y pantalones (8 de cada uno, en varios colores y tallas), con la API corriendo:

```
cd services/api
npm run semilla:prendas
```

El catálogo está en `db/semillas/prendas/catalogo.json`. Como el de bandas, se puede ejecutar más de una vez sin duplicar nada, y sus imágenes también son ilustraciones.

**Recomendaciones de inversión.** En la tienda, el Gerente entra por "Acceso administrador" y, en Finanzas, abre "Recomendaciones de inversión". Es un modelo predictivo que usa las ventas del e-commerce y de la tienda física (`GET /api/v1/analitica/recomendaciones`, solo Gerente):

- Pronostica la demanda semanal de cada prenda (talla y color). Para cada tipo de demanda, regular o intermitente según el criterio de Syntetos-Boylan, elige entre suavizado exponencial, Syntetos-Boylan, Holt amortiguado y media móvil: se queda con el que menos erró en semanas pasadas. El error que muestra se mide en las últimas 4 semanas, que no se usan para elegir, y se compara con repetir el promedio reciente.
- Recomienda qué comprar y cuánto: la demanda del horizonte más un stock de seguridad al 95%, menos lo disponible, solo para lo que se agota antes de terminar el horizonte. También dice si va a la sala de ventas o a la bodega según dónde se vende más, y reparte un presupuesto opcional por prioridad y margen.
- Marca el capital inmovilizado (stock que no se espera vender) y las bandas y categorías en alza o a la baja.
- Los productos sin costo de compra usan un costo estimado con la proporción típica de su categoría, y la pantalla lo avisa.

Con pocas ventas reales el modelo tiene poco con qué aprender. Para demostrarlo hay un historial simulado de 26 semanas en ambos canales, que se reconoce y se borra sin tocar las ventas reales:

```
cd services/api
npm run semilla:historial            # crea el historial de demostración
npm run semilla:historial:quitar     # lo borra
```

Escribe directo en PostgreSQL (`DATABASE_URL`, por defecto la base de `docker compose` en `localhost:5432`). No mueve el stock ni crea pedidos de despacho. Las ventas de la tienda quedan en cierres de caja diarios, algunos con diferencias explicadas. Para el balance diario de Finanzas, también agrega las ventas de esta semana hasta ayer, una compra de reposición por semana y algunas mermas con su motivo; quedan como movimientos de inventario, sin cambiar el stock actual, y `semilla:historial:quitar` también las borra. Mientras exista, la pantalla avisa cuántas ventas de demostración incluye.

**Cierres de caja.** Cada vendedor cierra su caja desde el POS contando el efectivo (`GET /api/v1/ventas/pos/caja`, `POST /api/v1/ventas/pos/cierres`). El Gerente ve en Finanzas & RRHH los cierres de los últimos 30 días, por medio de pago (efectivo, débito, crédito y transferencia), con lo esperado, lo contado y la diferencia, y las cajas que siguen abiertas (`GET /api/v1/ventas/cierres`).


Un producto creado desde la bodega no aparece en la tienda hasta que el Gerente le pone precio: en la tienda, "Acceso administrador", pestaña Bodega, botón Editar.

Los pagos y los despachos son simulados: la tienda no cobra dinero y el código de seguimiento no existe en Starken. Ambos están detrás de adaptadores (`services/api/src/pagos/pasarela.ts` y `services/api/src/logistica/transportista.ts`) que se reemplazan al tener credenciales de Transbank y de Starken.

Otros comandos:

```
docker compose down              # detiene y conserva los datos
docker compose down --volumes    # detiene y borra la base y las claves
docker compose logs -f api       # registro del backend
```

Para cambiar contraseñas o puertos, copia `.env.example` a `.env`.

### Asesor de inversión

En la tienda, el panel Finanzas del Gerente recomienda en qué bandas y tipos de producto invertir. Lo calcula el backend con reglas fijas (`services/api/src/asesor/recomendaciones.ts`), a partir de las ventas pagadas, el stock, los conciertos registrados de las bandas y su popularidad en Deezer, que consulta por su API pública: no pide clave ni tiene costo. Si Deezer no responde, recomienda igual con los datos de la tienda.

El mismo panel tiene un chat con IA, opcional y de pago: aparece solo si el backend tiene `ANTHROPIC_API_KEY` (ver `.env.example`).

### Copia de demostración con ventas de ejemplo

Una tienda recién abierta tiene pocas ventas para que el asesor recomiende con datos propios. Para mostrarlo con más historia sin ensuciar la base real, se levanta una copia aparte con los mismos datos y un historial de ventas inventado. En PowerShell, desde la raíz:

```
docker exec rockstar-db-1 pg_dump -U rockstar -d rockstar --no-owner | Out-File -Encoding utf8 db/respaldos/demo.sql
$env:TIENDA_PUERTO = "8091"; $env:API_PUERTO = "3001"; $env:DB_PUERTO = "5433"
docker compose -p rockstar-demo up -d db
Get-Content db/respaldos/demo.sql | docker exec -i rockstar-demo-db-1 psql -q -U rockstar -d rockstar
docker compose -p rockstar-demo up --build -d api tienda
cd services/api
$env:DATABASE_URL = "postgres://rockstar:rockstar_dev@localhost:5433/rockstar"
npm run ventas:ejemplo -- --demo
```

La copia queda en http://localhost:8091, con las mismas cuentas. El generador exige `--demo` y se niega a usar el puerto de la base real; sus ventas llevan la clave `ejemplo:<n>` y `npm run ventas:ejemplo -- --demo --borrar` las quita. Para eliminar la copia completa: `docker compose -p rockstar-demo down --volumes`.

### Si Docker Desktop no arranca en Windows

Docker necesita la característica "Plataforma de máquina virtual" de Windows. Si Docker Desktop avisa que no hay virtualización, abre PowerShell **como administrador**, ejecuta lo siguiente y reinicia el equipo:

```
wsl --install
```

Si después del reinicio el aviso sigue, hay que activar la virtualización (Intel VT-x o AMD-V) en la BIOS del equipo.

## Trabajar sin Docker

Se necesita Node.js 22 o superior, y `npm install` en la raíz.

**Backend con base en memoria.** Levanta la API en http://localhost:3000 con un PostgreSQL embebido. No requiere instalar nada más, y los datos se pierden al cerrar.

```
cd services/api
npm run local
```

**Backend contra un PostgreSQL propio.**

```
cd services/api
npm run build
$env:DATABASE_URL = "postgres://usuario:clave@localhost:5432/rockstar"   # PowerShell
$env:SEMBRAR_DEMO = "true"
npm start
```

**App.** Por defecto usa un backend simulado en memoria, de modo que funciona sola.

```
cd apps/bodega-mobile
npm start
```

Para que use la API real, pulsa "Modo demostración" bajo el botón de inicio de sesión, elige "Servidor" y escribe la dirección del backend, por ejemplo `http://localhost:3000`.

## Etiquetas QR de los espacios de bodega

La pantalla "Ubicaciones" muestra los racks de la bodega y el código QR de cada uno, con su número, por ejemplo `B-POL-03`. Para imprimirlas, abre la app en el navegador del computador (http://localhost:8080), entra a esa pantalla y usa "Imprimir etiquetas". Salen tres por fila, con línea de corte.

Al escanear una etiqueta desde la app, en cualquier pantalla con el botón "Escanear código", aparecen las prendas guardadas en ese espacio.

## Etiquetas QR de las prendas

La pantalla "Etiquetas de prendas", que se abre desde la ficha de una prenda (en "Buscar producto") o al crear un producto, muestra el código QR de cada SKU, con el nombre, la talla y el color. Se imprimen igual que las de los espacios, desde el navegador del computador. Al abrir una prenda se puede imprimir una etiqueta por cada unidad en stock, para rotularlas todas.

El QR contiene el SKU. Al escanearlo, la app identifica la talla y el color exactos de la prenda para buscarla, ingresarla o darla de baja.

## Dos direcciones distintas de la app en el navegador

- http://localhost:8080 es la app de Docker: usa el backend y la base de datos reales.
- http://localhost:4200 es el servidor de desarrollo (`npm start`): arranca en modo demostración, con datos de ejemplo que no llegan a la base. La pantalla principal lo avisa. Para conectarlo al backend, pulsa "Modo demostración" en el inicio de sesión, elige "Servidor" y escribe `http://localhost:3000`.

## APK para el teléfono

```
cd apps/bodega-mobile
npm run apk
```

El APK queda en `apps/bodega-mobile/apk/rockstar-bodega.apk`. Cópialo al teléfono y ábrelo para instalarlo; Android pedirá permitir la instalación desde esa fuente.

Para que la app instalada funcione contra el backend:

1. Los contenedores deben estar corriendo en el equipo (`docker compose up -d`).
2. El teléfono debe estar en la misma red que el equipo: el Wi-Fi del local o la zona Wi-Fi de un celular, a la que se conectan el equipo y los teléfonos.
3. Al abrirse, la app pide la IP del equipo servidor. Basta con la IP, por ejemplo `192.168.43.10`: si no se indica puerto, usa el 3000. La IP del equipo se ve con `ipconfig`, en "Dirección IPv4" del adaptador Wi-Fi.
4. La app recuerda la dirección. Si al abrirla no responde (por ejemplo, porque el equipo se conectó a otra red), lo avisa y vuelve a pedirla. También se puede cambiar con "Servidor", bajo el botón de inicio de sesión.

Sin servidor a mano, la misma pantalla permite pasar a "Demostración", que funciona sola con datos de ejemplo.

Otras formas de compilar:

```
npm run apk -- --servidor=http://192.168.1.20:3000   # parte con esa dirección en vez de pedirla
npm run apk -- --demo                                 # arranca en modo demostración
```

Requisitos para compilar, una sola vez por equipo:

- JDK 21. Si el Java del sistema es más antiguo, indica el JDK en `%USERPROFILE%\.gradle\gradle.properties` con `org.gradle.java.home=<ruta del JDK>`.
- SDK de Android con la plataforma 36, y su ruta en `apps/bodega-mobile/android/local.properties` como `sdk.dir=<ruta>` o en la variable `ANDROID_HOME`.

El APK es de depuración: sirve para instalarlo directamente, no para publicarlo en una tienda. La app habla con el backend por HTTP sin cifrar, lo que es aceptable dentro de la red de la tienda y no fuera de ella.

## Pruebas

```
cd apps/bodega-mobile
npm test -- --watch=false     # pruebas de la app
npm run lint

cd services/api
npm test                      # pruebas unitarias
npm run test:e2e              # pruebas del contrato de la API, con base en memoria
```

Las pruebas de contrato también pueden correr contra los contenedores:

```
$env:API_URL = "http://localhost:3000/api/v1"
npm run test:e2e
```

## Variables del backend

| Variable | Uso | Por defecto |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL. Obligatoria | |
| `PUERTO` | Puerto en que escucha | `3000` |
| `SEMBRAR_DEMO` | Carga los datos de demostración si la base está vacía | `false` |
| `CORS_ORIGENES` | Orígenes permitidos, separados por coma. Vacío acepta cualquiera | vacío |
| `JWT_CLAVES_DIR` | Carpeta del par de claves que firma los tokens. Se genera si no existe | `claves` |
| `JWT_CLAVE_PRIVADA`, `JWT_CLAVE_PUBLICA` | Claves en formato PEM, en lugar de la carpeta | |
| `DB_POOL_MAX` | Conexiones simultáneas a la base | `10` |
| `MIGRACIONES_DIR` | Carpeta de migraciones | `db/migrations` |
| `ANTHROPIC_API_KEY` | Clave del servicio de IA del chat del asesor. Sin ella, el chat no se muestra | vacío |
| `DEEZER_API_URL` | API de donde el asesor toma la popularidad de las bandas | `https://api.deezer.com` |

Las cuentas de demostración tienen contraseñas públicas. Fuera de desarrollo, usa `SEMBRAR_DEMO=false`.
