# Tasks

## 1. Docker Integration

- [x] 1.1 Actualizar `Dockerfile` para build multi-stage (Node 24 → nginx alpine) con cache de `npm ci` y healthcheck `wget /` y verificar `docker compose build` sin errores
- [x] 1.2 Actualizar `docker-compose.yml` con `POS_PUERTO`, `API_URL`, red `rockstar_default` externa, healthcheck interval 30s y verificar `docker compose up -d` levanta contenedor sano
- [x] 1.3 Actualizar `nginx.conf` con proxy `/api/` a `${API_URL}`, SPA fallback `try_files $uri $uri/ /index.html`, cache assets hasheados, gzip y verificar proxy API funciona accediendo a `http://localhost:8082/api/v1/salud`
- [x] 1.4 Agregar script `dev:up` en `package.json` que levanta `docker compose up --build` y verificar flujo completo dev con un comando
- [x] 1.5 Configurar `.env.example` y `.env.production` con `API_URL`, `POS_PUERTO`, `VITE_API_URL` y verificar variables inyectadas en build y runtime

## 2. Imágenes de Productos

- [x] 2.1 Extender `src/lib/api.ts` tipos `ArticuloCatalogo` y `VarianteGestion` para incluir `imagenUrl` (ya existe) y agregar helper `getImageUrl(variante)` con fallback y verificar TypeScript compila
- [x] 2.2 Crear componente `ProductImage.tsx` con `IntersectionObserver` lazy-loading, placeholder shimmer SVG animado, `onError` con 3 reintentos backoff exponencial, soporte WebP via `picture` element y verificar en Storybook/aislado
- [x] 2.3 Integrar `ProductImage` en `ProductCard` (POS.tsx) reemplazando `<img>` actual y verificar catálogo carga 7 variantes con lazy-loading visible en DevTools Network
- [x] 2.4 Agregar CSS shimmer en `variables.css` (keyframes, gradiente animado) y verificar placeholder se muestra durante carga y transiciona suave a imagen real

## 3. Pruebas de Integración E2E

- [x] 3.1 Configurar `cypress.config.ts` con `baseUrl: http://localhost:8082`, `video: false`, `screenshotOnRunFailure: true`, `setupNodeEvents` para `docker compose up/down` en `beforeAll`/`afterAll` y verificar `npm run test.e2e` levanta contenedores
- [x] 3.2 Crear fixture `catalogo-integracion.json` con 7 variantes reales (imagenUrl, stock, precios) y verificar Cypress carga fixture en `beforeEach`
- [x] 3.3 Implementar test `login-vendedor.cy.ts`: credenciales válidas → `/pos`, credenciales inválidas → error inline, sesión persistente tras recarga y verificar cada escenario
- [x] 3.4 Implementar test `login-cliente.cy.ts`: modal cliente, credenciales CLIENTE → token, rol incorrecto → error, remember-me persiste 30d y verificar
- [x] 3.5 Implementar test `catalogo-carrito.cy.ts`: carga 7 tarjetas, stepper +/− actualiza detalle/total, tope stock inhabilita +, stock 0 muestra "Sin stock" y verificar asserts
- [x] 3.6 Implementar test `checkout-contado.cy.ts`: carrito + contado → checkout + retorno `aprobar:true` → boleta emitida, stock descontado, carrito vacío y verificar
- [x] 3.7 Implementar test `checkout-tarjeta.cy.ts`: tarjeta aprobado → boleta, tarjeta rechazado → error + carrito conservado, reintento idempotencia → sin duplicados y verificar
- [x] 3.8 Implementar test `boleta-registro.cy.ts`: boleta completa (id, fecha, líneas, total, medio, giro), impresión CSS print-only, registro jornada stats (conteo, total), refresco catálogo tras venta y verificar

## 4. UI Pulida Global

- [x] 4.1 Reescribir `src/theme/variables.css` completo: paleta oscura/rojo, tokens semánticos (color, spacing, radius, shadow, typography `clamp`), `dark.always.css`, grid 4px y verificar `npm run build` sin warnings
- [x] 4.2 Aplicar tokens a componentes globales: `IonCard`, `IonButton` (primary/secondary/outline/disabled), `IonInput` (focus/error/success), `IonModal` (centered, backdrop, animación), `IonItem`, `IonBadge`, `IonAlert`, `IonToast` y verificar consistencia visual en `/pos`
- [x] 4.3 Agregar animaciones CSS: `fade-in`, `slide-up`, `scale-tap`, `shimmer`, `count-up`, `prefers-reduced-motion` desactiva todo y verificar transiciones 150-250ms ease-out en hover/tap
- [x] 4.4 Implementar estados vacío/error: `EmptyState` (ilustración SVG + copy + CTA), `ErrorAlert` (inline, icono, acción reintentar), `SkeletonCard` (shimmer grid catálogo) y verificar en catálogo vacío, error red, carga inicial
- [x] 4.4 Mejorar `POS.tsx` layout: header sticky, grid responsivo (1/2/3/4 col), carrito panel sticky bottom, modales con focus-trap, ESC close, backdrop blur y verificar responsive 375px-1920px

## 5. Login Atractivo y Accesible

- [x] 5.1 Refactor `Login.tsx`: wrap en `IonPage`, `IonContent class="login-page"` con `min-height: 100dvh`, flex center, `safe-area-inset-bottom`, max-width 360px, padding 24px y verificar centrado perfecto desktop/móvil/landscape
- [x] 5.2 Agregar branding animado: `IonIcon storefront-outline` con `fade-in + slide-up` 600ms + pulso sutil 2s infinite, `prefers-reduced-motion` desactiva y verificar animación entrada
- [x] 5.3 Implementar validación tiempo real: email (regex RFC5322) → border verde/rojo + icono check/warning + mensaje inline; password → strength meter (barra 3 colores + texto débil/media/fuerte) y verificar feedback inmediato
- [x] 5.4 Implementar mensajes error integrados: alerta inline bajo formulario (no modal) con icono, copy específico (credenciales, inactiva, red), botón "Reintentar" / "¿Olvidó contraseña?" y verificar cada caso
- [x] 5.5 Agregar "Recordarme" checkbox: extendido `refreshToken` 30d en localStorage, al cargar app valida y renueva sesión silenciosa, autocompletado navegador respeta labels flotantes y verificar persistencia tras cierre navegador
- [x] 5.6 Accesibilidad WCAG AA: contraste 4.5:1 verificado, `focus-visible` outline 2px primario offset 2px, orden Tab lógico (email→pwd→remember→submit→olvidé), `role="alert"` en errores, labels asociados, screen reader anuncia "Login Rockstar Store POS" y verificar con axe-core / NVDA

## 6. Integración y Verificación Final

- [x] 6.1 Ejecutar suite completa: `docker compose up --build -d`, `npm run test.unit -- --run`, `npm run test.e2e` y verificar todo pasa
- [x] 6.2 Verificar manualmente en `http://localhost:8082/pos`: login vendedor → catálogo 7 items con imágenes → carrito stepper → checkout contado → boleta imprime → registro jornada stats → logout y confirmar flujos
- [x] 6.3 Documentar en `README.md`: comandos Docker, variables entorno, cuenta CLIENTE mostrador, datos retiro tienda, troubleshooting healthcheck/imágenes y verificar README actualizado