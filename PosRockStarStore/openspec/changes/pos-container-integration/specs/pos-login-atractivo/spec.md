# Spec Delta

## Purpose

Rediseño completo de la pantalla de login: centrada vertical/horizontalmente, branding animado, validación en tiempo real, mensajes integrados, remember-me, y accesibilidad completa (WCAG AA).

## ADDED Requirements

### Requirement: Layout centrado perfecto

El sistema SHALL renderizar el formulario de login centrado en viewport (flexbox + min-height 100vh/dvh) sin scroll innecesario.

#### Scenario: Centrado en desktop
- **WHEN** viewport ≥ 768px
- **THEN** formulario centrado exacto (horizontal + vertical), max-width 360px, padding 24px

#### Scenario: Centrado en móvil
- **WHEN** viewport < 768px
- **THEN** formulario usa ancho 100% - 32px, centrado vertical con safe-area-inset-bottom

#### Scenario: Orientación landscape móvil
- **WHEN** móvil en landscape
- **THEN** formulario sigue centrado, no queda cortado, usa `100dvh`

### Requirement: Branding animado

El sistema SHALL mostrar logo/icono de marca con animación de entrada sutil.

#### Scenario: Animación de entrada
- **WHEN** página carga
- **THEN** icono `storefront-outline` aparece con `fade-in + slide-up` 600ms ease-out, luego pulso sutil infinito (2s)

#### Scenario: Reduce motion
- **WHEN** `@media (prefers-reduced-motion: reduce)`
- **THEN** animaciones desactivadas, estado final inmediato

### Requirement: Validación en tiempo real

El sistema SHALL validar email y password al escribir, con feedback visual inmediato.

#### Scenario: Email válido
- **WHEN** usuario escribe email con formato válido
- **THEN** border verde, checkmark icono, mensaje "Email válido" (verde)

#### Scenario: Email inválido
- **WHEN** usuario escribe email sin @ o dominio
- **THEN** border rojo, icono warning, mensaje "Formato de email inválido" (rojo)

#### Scenario: Password requirements
- **WHEN** usuario escribe en password
- **THEN** muestra fuerza (débil/media/fuerte) con barra de color + texto

### Requirement: Mensajes de error integrados

El sistema SHALL mostrar errores de API inline (no modal) con icono, copy claro, y acción.

#### Scenario: Credenciales inválidas
- **WHEN** API retorna 401
- **THEN** alerta inline roja bajo formulario: "Credenciales incorrectas. Verifica email y contraseña." + botón "¿Olvidó contraseña?"

#### Scenario: Cuenta inactiva
- **WHEN** API retorna 403 "Cuenta inactiva"
- **THEN** alerta: "Esta cuenta está desactivada. Contacte al administrador."

#### Scenario: Error de red
- **WHEN** fetch falla
- **THEN** alerta: "Sin conexión. Verifique su red e intente de nuevo." + botón "Reintentar"

### Requirement: Remember-me y autocompletado

El sistema SHALL ofrecer "Recordarme" (extiende refresh token 30d) y respetar autofill del navegador.

#### Scenario: Remember-me activado
- **WHEN** checkbox marcado al login
- **THEN** `refreshToken` almacenado con expiración 30d, sesión sobrevive a cierre de navegador

#### Scenario: Autocompletado navegador
- **WHEN** usuario tiene credenciales guardadas
- **THEN** inputs se autollenan, labels flotan correctamente, validación dispara

### Requirement: Accesibilidad WCAG AA

El sistema SHALL cumplir contraste 4.5:1, focus-visible, labels, ARIA, orden de tabulación lógico.

#### Scenario: Navegación por teclado
- **WHEN** usuario usa Tab
- **THEN** orden: email → password → remember-me → submit → olvidé pwd → registro

#### Scenario: Focus visible
- **WHEN** elemento enfocado por teclado
- **THEN** outline 2px sólido primario + offset 2px, nunca `outline: none`

#### Scenario: Screen reader
- **WHEN** NVDA/VoiceOver lee página
- **THEN** anuncia "Login Rockstar Store POS", labels asociados, errores con `role="alert"`