# Design

## Context

Ver `proposal.md` (Why). Estado actual verificado en el repositorio:
- `PosRockStarStore` es una plantilla Ionic React con POS funcional (`/pos`) corriendo en `npm run dev` (localhost:5173)
- Docker existe (`Dockerfile`, `docker-compose.yml`, `nginx.conf`) pero no se usa en desarrollo
- Backend `App-mobile-docker-backend` corre en red `rockstar_default` con API en `api:3000` y sirve imágenes
- Specs base (`pos-autenticacion`, `pos-catalogo-carrito`, `pos-cobro-boleta`) ya implementadas en change `portal-pago-pos`
- Tema visual básico en `src/theme/variables.css` (oscuro, acento rojo) pero incompleto

## Goals / Non-Goals

**Goals:**
- POS 100% operativo en contenedor (`docker compose up --build -d` → `http://localhost:8082/pos`)
- Imágenes de productos cargadas desde backend con lazy-loading, WebP, fallback, reintento
- Suite e2e Cypress contra API real en contenedor (login, catálogo, carrito, checkout, boleta, registro)
- UI pulida: tema unificado, tipografía fluida, componentes refinados, animaciones, estados vacío/error
- Login centrado, atractivo, accesible (WCAG AA), con validación tiempo real y remember-me

**Non-Goals:**
- Cambiar backend ni base de datos (solo consumir endpoints existentes)
- Nuevo endpoint de venta POS (reusa `ventas/checkout` + `pagos/webpay/retorno`)
- PWA/offline-first (requiere red para operar)
- PDF boleta o impresora fiscal (solo `window.print()` con CSS print)
- Tests unitarios nuevos (los existentes en `src/lib/api.test.ts` cubren API client)

## Decisions

### 1. Docker-first development
**Decisión**: Usar `docker compose up` como flujo principal de desarrollo, no `npm run dev`.
**Racional**: Paridad dev/prod, evita "funciona en mi máquina", prueba proxy API real, healthchecks.
**Alternativa**: Mantener `npm run dev` + Docker solo para deploy. Descartada: duplica config, proxy Vite ≠ nginx.

### 2. Imágenes: lazy-loading + IntersectionObserver + WebP
**Decisión**: Cargar imágenes solo al entrar en viewport, placeholder shimmer durante carga, `Accept: image/webp`.
**Racional**: 7 variantes iniciales → escalable a 100+, ahorra ancho de banda, UX suave.
**Alternativa**: Cargar todas al inicio. Descartada: lento en móvil, flash de contenido.

### 3. Reintento de imágenes: 3 intentos con backoff exponencial
**Decisión**: `onError` → `setTimeout(retry, 500ms * 2^attempt)` hasta 3, luego placeholder error + botón "Reintentar".
**Racional**: Fallos transitorios de red/CDN comunes, recupera sin intervención.
**Alternativa**: Sin reintento o reintento infinito. Descartada: UX rota o loop infinito.

### 4. E2E contra API real en contenedor (no mocks)
**Decisión**: Cypress levanta `docker compose up` en `beforeAll`, prueba contra `http://localhost:8082` + backend real.
**Racional**: Detecta problemas de proxy, CORS, healthchecks, variables de entorno, tiempos reales.
**Alternativa**: Mock Service Worker (MSW). Descartada: no prueba infra real, falso positivo.

### 5. Tema visual: tokens CSS + dark.always + scale fluida
**Decisión**: Variables CSS en `:root` (colores, espaciado, tipografía `clamp`), `@ionic/react/css/palettes/dark.always.css`, grid 4px.
**Racional**: Consistente, mantenible, responsive sin media queries complejas, modo oscuro garantizado.
**Alternativa**: Tailwind / Styled Components. Descartada: añade dependencia, Ionic ya usa CSS variables.

### 6. Login: centrado perfecto con `min-height: 100dvh` + flex
**Decisión**: `IonContent` con `class="login-page"` → flex column center, `min-height: 100dvh`, safe-area-insets.
**Racional**: Centrado real en móvil (notch, barra navegación), desktop, landscape. `dvh` evita salto al ocultar barra URL.
**Alternativa**: `100vh` fijo / position absolute. Descartada: problemas en móvil moderno.

### 7. Validación tiempo real: `onIonInput` + regex + strength meter
**Decisión**: Email: regex RFC5322 simplificada. Password: zxcvbn-inspired (longitud, mayús, números, símbolos) → barra 3 colores.
**Racional**: Feedback inmediato reduce errores de submit, mejor conversión.
**Alternativa**: Validación solo en submit. Descartada: UX pobre, frustración.

### 8. Remember-me: refresh token 30d en localStorage
**Decisión**: Checkbox "Recordarme" → `refreshToken` con `exp: now + 30d` en localStorage. Al cargar app, si `refreshToken` válido → `POST /auth/refresh` (si existe) o re-login silencioso.
**Racional**: Sesión persistente sin cookies (SPA), compatible con contenedor efímero.
**Alternativa**: HttpOnly cookies. Descartada: requiere backend CORS/cookie config, complejidad extra.

### 9. Animaciones: `prefers-reduced-motion` + 150-250ms ease-out
**Decisión**: `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`. Transiciones: `transform`, `box-shadow`, `opacity`, `background-color`.
**Racional**: Accesibilidad, rendimiento, sensación "nativa".
**Alternativa**: Framer Motion / Animate.css. Descartada: peso extra, CSS nativo suficiente.

## Risks / Trade-offs

- [Riesgo] Backend `App-mobile-docker-backend` no corriendo → POS no levanta (healthcheck API falla)
  → Mitigación: `docker-compose.yml` documenta dependencia, script `dev:up` levanta ambos

- [Riesgo] Imágenes WebP no servidas por backend → fallback JPEG/PNG transparente
  → Mitigación: `Accept` header condicional, backend ignora si no soporta

- [Riesgo] E2E lentas (levanta Docker) → CI tarda 3-5 min
  → Mitigación: `cypress.config.ts` `baseUrl: http://localhost:8082`, tests paralelos, cache Docker layers

- [Riesgo] Login centrado con `100dvh` no soportado en Safari < 15.4
  → Mitigación: Fallback `100vh` + `@supports (height: 100dvh)` progressive enhancement

- [Riesgo] Refresh token en localStorage vulnerable a XSS
  → Mitigación: CSP estricto en nginx, tokens cortos (15min access), HTTPS obligatorio en prod

- [Compromiso] Sin tests unitarios nuevos → confiar en e2e + tests existentes
  → Mitigación: e2E cubren flujos críticos, unit tests cubren API client

## Migration Plan

1. **Desarrollo**: `docker compose up --build` levanta POS en `:8082` + proxy API
2. **Deploy**: Mismo `docker-compose.yml` en servidor, variables `.env.production`
3. **Rollback**: `docker compose down` + imagen anterior (tags `latest`/`v1.2.3`)
4. **Datos**: Cuenta CLIENTE mostrador (`cliente@rockstar.cl`) y datos "Retiro en tienda" pre-configurados en backend

## Open Questions

- ¿Endpoint `/auth/refresh` existe en backend? (Si no, re-login silencioso con credenciales guardadas)
- ¿Backend sirve WebP automático o hay que configurar? (Investigar `App-mobile-docker-backend`)
- ¿Umbral "Últimas unidades" fijo en 5 o configurable? (Dejar en 5 por ahora, configurable en v2)