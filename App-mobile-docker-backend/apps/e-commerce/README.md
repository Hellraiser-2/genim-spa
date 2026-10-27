# Rockstar e-commerce (Ionic Angular + Capacitor)

Tienda online de ropa Rock & Metal, conectada al backend de Rockstar (`services/api`). No guarda datos propios: el catálogo, las cuentas, las compras y el inventario viven en el backend.

## Qué hace

- Catálogo con las prendas que tienen precio, con su disponibilidad al momento.
- Barra de navegación fija con un menú desplegable por categoría: ver todo, sus bandas y sus tallas. Sale del catálogo, sin listas escritas a mano.
- Buscador en la barra de navegación. Filtra en el navegador sobre el catálogo ya cargado: el texto no viaja al backend. Cómo se limpia y se muestra ese texto está en `src/app/data/search.ts`.
- Página de bandas, con una tarjeta por banda que lleva a sus prendas. La foto de cada banda la entrega el backend, que la guarda en la base de datos; se muestra con su crédito.
- Carrito como panel lateral, que se conserva en el dispositivo y se pone al día con los precios y el stock actuales.
- Cuentas de clientes: registro e inicio de sesión con correo y contraseña.
- Compra: datos de despacho, flete según la comuna, reserva de las unidades por 15 minutos y pago.
- Mis pedidos: estado de cada pedido y, cuando se despacha, su código de seguimiento.
- Perfil: el botón con el nombre, en el encabezado, abre los datos de la cuenta y sus compras. Las pendientes son las que aún esperan pago y se pueden retomar; las hechas son las pagadas, con el estado de su pedido.
- Acceso del personal con sus cuentas del backend. Bodega ingresa stock y registra mermas; el Gerente define precio y descripción y ve las cifras.
- Chat de soporte Roxy, con respuestas locales.
- Probador 3D: el botón **Probar** de cada prenda abre un maniquí 3D con la altura y el peso del cliente, vestido con la talla elegida. Indica si queda apretada, bien u holgada y corta o larga, recomienda una talla y la agrega al carrito. Las medidas se recuerdan en el navegador y no se envían al backend.

El pago es **simulado**: no se pide tarjeta ni se cobra. La pantalla de pago deja elegir si se aprueba o se rechaza.

## Desarrollo

Las dependencias son propias de esta carpeta (usa otra versión de Angular que la app de bodega), así que se instalan aquí y no desde la raíz del repositorio.

```bash
npm install
npm start          # http://localhost:4300
npm run build      # genera www/browser
npm test           # pruebas unitarias (Vitest) del cálculo de tallas
```

`npm start` reenvía `/api` al backend en `http://localhost:3000` (ver `proxy.conf.json`). El backend se levanta con `docker compose up` en la raíz, o con `npm run local` en `services/api`.

Con Docker, la tienda queda en http://localhost:8081 junto al resto del sistema.

## Cuentas de demostración

Las crea el backend cuando la base está vacía.

| Correo | Contraseña | Rol |
| --- | --- | --- |
| `cliente@rockstar.cl` | `cliente123` | Cliente |
| `bodega@rockstar.cl` | `bodega123` | Bodega |
| `gerente@rockstar.cl` | `gerente123` | Gerente |

El personal entra por "Acceso administrador" en la pantalla inicial.

## Estructura

```
src/app/
├── app.config.ts            Proveedores: rutas, HTTP con el interceptor de sesión, Ionic
├── app.routes.ts            Rutas con carga diferida
├── app.component.ts         Marco: encabezado, pestañas según el rol y avisos
├── core/
│   ├── api.ts               Dirección del backend y mensajes de error
│   └── auth.interceptor.ts  Agrega el token y renueva la sesión vencida
├── components/
│   ├── shop-nav.component.ts     Barra de categorías con menús desplegables
│   ├── cart-drawer.component.ts  Panel lateral del carrito
│   ├── order-card.component.ts   Tarjeta de una compra pagada, en Mis pedidos y en el perfil
│   ├── cart-panel.component.ts   Contenido del carrito: productos, despacho y totales
│   └── probador.component.ts     Probador 3D: medidas, tallas, ajuste y botón al carrito
├── data/
│   ├── models.ts            Modelos de la interfaz y formato de precios y fechas
│   ├── probador.ts          Medidas del cuerpo, tabla de tallas, ajuste y recomendación
│   └── search.ts            Limpieza del texto de búsqueda y coincidencia con los productos
├── probador/
│   └── escena-maniqui.ts    Maniquí y prendas en three.js; se carga solo al abrir el probador
├── services/
│   ├── auth.service.ts      Sesión: inicio, registro, cierre y renovación
│   ├── products.service.ts  Catálogo publicado
│   ├── cart.service.ts      Carrito, datos de despacho y checkout
│   ├── shop.api.ts          Destinos, flete, pago y pedidos del cliente
│   ├── admin.service.ts     Inventario, mermas y cuentas para el personal
│   └── toast.service.ts     Avisos
└── pages/
    ├── entry/               Inicio de sesión, registro y acceso del personal
    ├── shop/                Tienda; filtra por `?categoria=`, `?banda=`, `?talla=` y `?q=`
    ├── bandas/              Bandas en tarjetas
    ├── cart/                Abre la tienda con el carrito desplegado
    ├── pago/                Pago simulado y resultado
    ├── pedidos/             Mis pedidos
    ├── perfil/              Datos de la cuenta, compras pendientes y compras hechas
    ├── warehouse/           Bodega (personal)
    ├── admin/               Finanzas y cuentas (Gerente)
    └── support/             Chat Roxy
```

Los tipos de las respuestas del backend vienen de `packages/contracts`, compartidos con el backend y la app de bodega.

## Móvil (Capacitor)

El proyecto conserva la configuración de Capacitor, pero la app empaquetada no está conectada: llama al backend por una dirección relativa (`/api/v1`), que solo existe cuando la sirve un servidor web. Para usarla como app nativa falta darle la dirección del backend.

## Stack

- **Angular 18** (standalone, signals)
- **Ionic 8**
- **Capacitor 6**
- **TypeScript 5.5**
- **three.js** para el probador 3D
- **Vitest** para las pruebas unitarias
