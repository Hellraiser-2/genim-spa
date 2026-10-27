# POS Rockstar Store

Punto de venta (Ionic React + Vite) para la tienda Rockstar. Opera **dentro de Docker**
detrás de nginx, con proxy `/api/` al backend `App-mobile-docker-backend`.

- App: `http://localhost:8082` → redirige a `/login`, POS en `/pos`
- Salud API (vía proxy): `http://localhost:8082/api/v1/salud`
- Máquina de cobro simulada: `http://localhost:8090` (contenedor `terminal`, ver abajo)

## Requisitos

- Docker Desktop con la red externa `rockstar_default` creada por el backend
- Backend corriendo: `App-mobile-docker-backend` (`db + api + app + tienda`, API en `api:3000`)

## Comandos Docker

```bash
# Levantar (construir + iniciar) en segundo plano
docker compose up --build -d

# Ver estado / salud del contenedor
docker ps --format "{{.Names}} {{.Status}}"

# Verificar proxy API (debe responder {"estado":"ok"})
curl http://localhost:8082/api/v1/salud

# Ver logs
docker compose logs -f pos

# Detener (conserva todo, no hay volúmenes propios)
docker compose down

# Flujo dev de un comando
npm run dev:up
```

## Variables de entorno

| Variable       | Dónde                  | Valor producción            | Descripción                              |
| -------------- | ---------------------- | --------------------------- | ---------------------------------------- |
| `API_URL`      | contenedor (compose)   | `http://api:3000`           | Backend dentro de `rockstar_default`     |
| `POS_PUERTO`   | host (compose)         | `8082`                      | Puerto publicado (`${POS_PUERTO:-8082}`) |
| `VITE_API_URL` | build (Dockerfile)     | `/api/v1`                   | Mismo origen: nginx proxea, sin CORS     |
| `VITE_API_URL` | desarrollo (`.env`)    | `http://localhost:3000/api/v1` | Solo `npm run dev` fuera de Docker    |

Ver `.env.example` (desarrollo) y `.env.production` (valores del contenedor).

## Cuentas y flujo de caja

- **Vendedor** (`/login`): email `vendedor@rockstar.cl` + contraseña del backend.
  Solo `VENDEDOR` puede cobrar; `BODEGA` y `GERENTE` entran pero el backend rechaza la
  venta. Con "Recordarme" la sesión dura 30 días (`refreshToken` en `localStorage`);
  sin marcarla, dura la jornada (8 h).
- **Cliente mostrador** (opcional): en el cobro, "Identificar cliente" pide el correo y
  la contraseña de una cuenta rol `CLIENTE`, p. ej. `cliente@rockstar.cl`. Si se
  identifica, queda anotado en la venta y en el comprobante; si no, la venta sale sin
  cliente. Vale para una sola venta: el siguiente comprador parte sin cliente.
- **Venta**: `POST /ventas/pos` con el token del vendedor. Registra la venta pagada,
  descuenta el stock al momento y devuelve el comprobante. Sin flete ni pedido de
  despacho: el comprador se lleva la prenda.
- **Stock**: sale de la sala de ventas. Si la sala no alcanza, el backend responde
  `409 EXISTENCIA_EN_BODEGA` y el POS ofrece "Retirar de bodega"; al aceptar reenvía
  con `permitirBodega` y la misma clave de idempotencia.
- **Medios de pago**: efectivo, tarjeta o transferencia (Webpay es de la tienda web).
  - **Efectivo**: monto recibido con atajos ($15.000, $20.000…) y vuelto; no deja
    confirmar si el monto no alcanza. Recibido y vuelto salen en la boleta.
  - **Tarjeta**: débito o crédito. Con la máquina de cobro activa se cobra enviándole
    el monto (ver abajo); sin ella, se pasa por un terminal aparte y el POS solo
    registra el medio.
  - **Transferencia**: muestra los datos de la cuenta de la tienda (con "Copiar datos")
    y pide el número de operación del comprobante, opcional; se guarda con la venta.
    Los datos de la cuenta son de ejemplo: están en `src/utils/pago.ts`.
- **Cierre de caja** (ícono de billetera, barra superior): muestra las ventas del
  vendedor desde su último cierre por medio de pago, pide el fondo inicial (propone
  el del cierre anterior) y el efectivo contado, y calcula el esperado (fondo + ventas
  en efectivo). Si no cuadra, la observación es obligatoria. El cierre queda en la
  base (`POST /ventas/pos/cierres`), se puede imprimir y aparece en el panel de
  finanzas del Gerente en la tienda (Finanzas & RRHH → Cierres de caja).
- **Boleta**: comprobante interno sin validez tributaria, con id, fecha, vendedor,
  cliente, líneas, total y medio; impresión con CSS print-only (`window.print()`). Tras
  la venta: stock se refresca, carrito se vacía y el registro de jornada
  (`GET /ventas/pos`, ventas del día del vendedor) suma la venta.

## Escaneo de etiquetas

La grilla del POS ("Productos de la venta") muestra solo lo que se está vendiendo: empieza
vacía y cada prenda escaneada o elegida aparece ahí, la última primero y destacada, con
su `+/−`. Al bajar a 0 sale de la grilla; tras cobrar, la grilla queda vacía.

El resto del catálogo está en la barra de búsqueda: al escribir despliega las prendas
que calzan por nombre, banda, categoría, color o SKU (cada palabra desde su comienzo,
en cualquier orden; una talla como `m` o `xl` filtra por talla). Se eligen con clic o
con las flechas y Enter. Con Enter y sin elegir: el SKU exacto, o la única
coincidencia; con varias pide elegir; sin ninguna lo busca como código de barras.

Cada prenda se suma al carrito y se cobra con el flujo de siempre. Hay tres formas de agregarla:

- **Cámara**: botón "Escanear con cámara". Lee de forma continua el QR (trae el SKU) y el
  código de barras EAN-13 de la etiqueta. Para sumar otra unidad del mismo producto se
  retira la etiqueta y se vuelve a mostrar. El navegador solo entrega la cámara en
  `https` o en `localhost`: desde otro equipo por `http://<ip>:8082` hay que usar las
  otras dos formas.
- **Pistola USB**: escribe el código en el campo de la barra y presiona Enter sola. El
  campo queda con el foco al abrir el POS.
- **A mano**: escribir el SKU o el código de barras en el mismo campo.

El SKU se busca en el catálogo cargado; el código de barras se resuelve con
`GET /inventario/variantes/por-codigo/:codigo` (token del vendedor). Una prenda sin
precio no está a la venta y el POS lo avisa. Las etiquetas se imprimen desde la app de
bodega, pantalla "Etiquetas de prendas".

## Máquina de cobro

La máquina de cobro (terminal de tarjetas) se conecta por la red de la tienda: el
navegador de la caja le envía el monto por HTTP a su IP y espera el resultado. Mientras
no haya una máquina real, el contenedor `terminal` hace de máquina simulada.

**Activarla en la caja**: botón con ícono de tarjeta (barra superior) o el aviso
"Activar máquina de cobro". Se enciende "Usar la máquina de cobro", se escribe su
dirección (IP y puerto) y "Probar conexión" debe responder "Conectada". La
configuración queda en esa caja (`localStorage`, clave `pos_maquina_cobro`).

- Si el POS se abre en el mismo equipo de Docker, la dirección es `localhost:8090`.
- Desde otra caja de la red, la IP del equipo de Docker, p. ej. `192.168.1.20:8090`
  (se ve con `ipconfig`, "Dirección IPv4"). Windows puede pedir permitir el puerto 8090
  en el firewall.

**Cobro**: con débito o crédito, "Cobrar $X en la máquina" envía el monto y el POS
muestra "Esperando el pago en la máquina". Al aprobarse, registra la venta y la boleta
lleva el código de autorización y los últimos dígitos de la tarjeta. Si se rechaza,
el vendedor reintenta o cambia el medio de pago; "Cancelar cobro" desiste en la
máquina. Si la máquina no responde, "Ya cobré aparte: registrar la venta" registra la
venta sin ella. El efectivo nunca pasa por la máquina.

Un cobro aprobado cuya venta no se registra (por ejemplo, al cancelar el retiro desde
bodega) se **anula** en la máquina: el cliente no queda cobrado sin venta.

**Máquina simulada**: su pantalla está en `http://<IP del equipo>:8090`; ábrela en un
celular de la misma red (o en otra pestaña) y usa "Pasar tarjeta (aprobar)" o
"Rechazar" con un motivo. Para demostraciones sin tocar la pantalla,
`TERMINAL_APROBAR_AUTOMATICO_MS=3000 docker compose up -d` aprueba cada cobro solo a
los 3 segundos. Un cobro sin pagar se cancela solo a los 2 minutos.

**Máquina real**: el POS habla con la máquina a través de la interfaz `MaquinaDeCobro`
(`src/lib/terminal.ts`). Para una máquina real (Transbank POS Integrado, Mercado Pago
Point, Getnet, SumUp…) se escribe otro cliente que cumpla esa interfaz; el flujo de
venta no cambia. El protocolo de la simulada está documentado en
`terminal-simulada/servidor.mjs`.

**Códigos de autorización**: cada venta cobrada en la máquina envía su pago
(`pagoMaquina` en `POST /ventas/pos`) y el backend lo guarda en `pagos.transacciones`,
en la misma transacción que la venta: `codigo_autorizacion`, `ultimos_digitos` (nunca el
número completo) e `id_cobro_maquina`. Un cobro paga una sola venta: si llega con otra,
el backend responde `409 COBRO_YA_USADO` y el POS no ofrece anularlo. La boleta y el
registro de jornada muestran la autorización guardada. Para buscar una venta por el
código del voucher:

```sql
SELECT t.id_venta, t.monto, t.ultimos_digitos, t.creado_en
FROM pagos.transacciones t
WHERE t.codigo_autorizacion = '970317';
```

Los cobros que se anulan en la máquina (porque la venta no se registró) no generan
venta y no quedan en la base; los muestra el reporte de la propia máquina.

## App Android (APK)

El POS también se instala en un teléfono o tablet Android:

```bash
npm run apk                                          # la app pide la IP del servidor al abrirse
npm run apk -- --servidor=http://192.168.1.20:3000   # parte con esa dirección en vez de pedirla
```

El APK queda en `apk/rockstar-pos.apk`. Cópialo al dispositivo y ábrelo para instalarlo;
Android pedirá permitir la instalación desde esa fuente.

- El equipo con el backend y el dispositivo deben estar en la misma red: el Wi-Fi del
  local o la zona Wi-Fi de un celular, a la que se conectan el equipo y los teléfonos.
- Al abrirse, la app pide la IP del equipo servidor (`ipconfig`, "Dirección IPv4" del
  adaptador Wi-Fi). Basta con la IP: si no se indica puerto, usa el 3000. "Ingresar" queda
  deshabilitado hasta que el servidor responde.
- La app recuerda la dirección. Si al abrirla no responde (por ejemplo, porque se cambió
  de red), lo avisa y vuelve a pedirla. También se cambia con "Cambiar", en el inicio de sesión.
- Al conectarse, la máquina de cobro pasa a la misma IP con el puerto 8090, salvo que se
  haya configurado otra a mano en sus ajustes.
- Requiere JDK 21 y el SDK de Android con la plataforma 36 (`ANDROID_HOME` o
  `android/local.properties`), como la app de bodega. Si el Java del sistema es más
  antiguo, define `JAVA_HOME` con el JDK 21 antes de ejecutar el comando.
- Si el teléfono no llega al servidor, revisa que el firewall de Windows permita
  conexiones entrantes a los puertos 3000 y 8090 en la red privada.

## Pruebas

```bash
npm run test.unit -- --run   # Vitest (cliente API, servidor, búsqueda, máquina de cobro, smoke App)
npm run test.terminal        # máquina de cobro simulada (node --test)
npm run test.e2e             # Cypress contra http://localhost:8082 (requiere contenedores)
```

La suite e2e (51 tests) usa intercepts con `cypress/fixtures/catalogo-integracion.json`
(7 variantes) salvo salud/login reales. `maquina-cobro.cy.ts` responde la máquina con
intercepts; `maquina-cobro-real.cy.ts` cobra contra el contenedor `terminal` de verdad.
Desde la terminal integrada de VS Code, Cypress necesita
`env -u ELECTRON_RUN_AS_NODE npx cypress run`. Notas:

- Cypress desactiva animaciones CSS vía `cypress/support/e2e.ts` (determinismo visual).
- Viewport e2e: 1280×1080 (pantalla de caja típica).
- Las imágenes del fixture son SVG `data:` URI para no depender de red externa.

## Troubleshooting

- **Contenedor `unhealthy` o `/api/v1/salud` no responde**: el backend no está
  corriendo o no comparte la red. Verifica `docker network ls | grep rockstar_default`
  y que `rockstar-api-1` esté `healthy`. Luego `docker compose up --build -d`.
- **Login redirige pero `/pos` queda vacío / error de catálogo**: revisa el proxy —
  `curl http://localhost:8082/api/v1/inventario/catalogo` debe devolver JSON.
  Revisa `nginx.conf` (`proxy_pass ${API_URL}` y `try_files ... /index.html`).
- **Imágenes no cargan (placeholder o "Sin imagen")**: `ProductImage` reintenta 3
  veces con backoff (500 ms × 2^n) y luego muestra estado de error con botón
  "Reintentar". Las fotos (`assets/prendas/*` según el backend) se sirven desde el
  propio contenedor: copia en `public/prendas/` (origen: bodega-mobile
  `src/assets/prendas/`, ver `CREDITOS.md`), resueltas por `getImageUrl()` a
  `/prendas/<archivo>` con caché de 7 días en nginx. Confirma que el backend sirve
  `imagenUrl` en `GET /inventario/catalogo`.
- **`docker compose up` falla por red externa**: crea/levanta primero el backend,
  que es quien crea `rockstar_default` (`external: true` aquí, no la crea).
- **Puerto ocupado**: cambia el mapeo con `POS_PUERTO=8083 docker compose up -d`.
