# Spec Delta

## Purpose

Rediseño visual global del frontend: tema oscuro/rojo consistente, tipografía, espaciado, sombras, animaciones sutiles, y estados de carga/error/vacío pulidos.

## ADDED Requirements

### Requirement: Tema visual unificado

El sistema SHALL aplicar variables CSS globales (`src/theme/variables.css`) con paleta oscura, acento rojo, y tokens semánticos usados en toda la app.

#### Scenario: Colores consistentes
- **WHEN** se renderiza cualquier página
- **THEN** fondo `#121212`, primario `#e53935`, superficie `#1e1e1e`, texto `#ffffff`, medio `#92949c`

#### Scenario: Modo oscuro forzado
- **WHEN** app carga en cualquier navegador
- **THEN** usa `@ionic/react/css/palettes/dark.always.css` (no sistema)

### Requirement: Tipografía y escala espacial

El sistema SHALL usar escala tipográfica fluida (clamp) y espaciado basado en 4px/8px grid.

#### Scenario: Texto legible en móvil y desktop
- **WHEN** viewport 375px a 1920px
- **THEN** headings `clamp(1.5rem, 4vw, 2.5rem)`, body `clamp(0.875rem, 2vw, 1rem)`

#### Scenario: Espaciado consistente
- **WHEN** se inspecciona cualquier componente
- **THEN** margins/paddings múltiplos de 4px (4, 8, 12, 16, 24, 32)

### Requirement: Componentes pulidos

El sistema SHALL aplicar estilos refinados a tarjetas, botones, inputs, modales, lists, badges.

#### Scenario: Tarjetas con profundidad
- **WHEN** tarjeta producto o venta
- **THEN** `border-radius: 12px`, `box-shadow: 0 2px 8px rgba(0,0,0,0.3)`, `border: 1px solid rgba(255,255,255,0.05)`, hover `translateY(-2px)` + shadow elevada

#### Scenario: Botones con estados claros
- **WHEN** botón primary/secondary/outline/disabled
- **THEN** colores, hover, active, focus-visible, disabled distintos y accesibles (contraste AA)

#### Scenario: Inputs con validación visual
- **WHEN** input focused/error/success
- **THEN** border color cambia (primario / danger / success), label flotante suave, mensaje error inline

#### Scenario: Modales centrados con backdrop
- **WHEN** modal abierto (login, pago, boleta, registro)
- **THEN** centrado vertical/horizontal, backdrop `rgba(0,0,0,0.6)`, animación `fade-in + scale(0.95→1)`

### Requirement: Animaciones y micro-interacciones

El sistema SHALL usar transiciones CSS suaves (150-250ms, ease-out) para feedback táctil.

#### Scenario: Hover/tap en elementos interactivos
- **WHEN** usuario interactúa con botón, tarjeta, stepper
- **THEN** transición `transform`/`box-shadow`/`background` 150ms ease-out

#### Scenario: Skeleton loading
- **WHEN** catálogo cargando
- **THEN** placeholders animados (shimmer) en grid, mismos tamaños que tarjetas reales

#### Scenario: Toast/notificaciones
- **WHEN** error, éxito, info
- **THEN** toast desliza desde arriba/derecha, auto-dismiss 4s, action button opcional

### Requirement: Estados vacío y error

El sistema SHALL mostrar ilustraciones + copy amigable en estados vacío/error.

#### Scenario: Carrito vacío
- **WHEN** 0 items en carrito
- **THEN** ilustración SVG + "Agrega productos para empezar" + CTA a catálogo

#### Scenario: Error de red
- **WHEN** fetch falla
- **THEN** alerta inline + botón "Reintentar" + icono warning, no modal bloqueante