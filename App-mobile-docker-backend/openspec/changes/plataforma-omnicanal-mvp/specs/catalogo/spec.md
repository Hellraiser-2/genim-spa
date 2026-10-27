# Spec Delta

## Purpose

Define los productos que vende la tienda y sus variantes de talla y color, cada una identificada por un SKU y un código escaneable, y los muestra a los clientes con su disponibilidad real.

## ADDED Requirements

### Requirement: CU-01 Consultar catálogo
El sistema DEBE (SHALL) permitir que cualquier visitante, con o sin sesión, consulte los productos activos del catálogo, los filtre por categoría, talla y color, los busque por nombre y vea el detalle de cada uno con su precio y sus variantes.

#### Scenario: Listado de productos
- **WHEN** un visitante abre el catálogo
- **THEN** el sistema muestra los productos activos con nombre, imagen, precio y categoría

#### Scenario: Filtro por categoría, talla o color
- **WHEN** el visitante aplica un filtro de categoría, talla o color
- **THEN** el sistema muestra solo los productos que tienen al menos una variante que cumple el filtro

#### Scenario: Búsqueda por nombre
- **WHEN** el visitante busca un texto
- **THEN** el sistema muestra los productos cuyo nombre contiene ese texto, o indica que no hay resultados

#### Scenario: Detalle de producto
- **WHEN** el visitante abre un producto
- **THEN** el sistema muestra su descripción, precio, tallas y colores disponibles

#### Scenario: Producto desactivado
- **WHEN** un producto está desactivado
- **THEN** no aparece en el catálogo ni en las búsquedas del e-commerce

### Requirement: CU-02 Ver disponibilidad en tiempo real
El sistema DEBE (SHALL) mostrar, como parte de la consulta del catálogo, la disponibilidad de cada variante calculada al momento de la consulta, descontando lo vendido y lo reservado en cualquier canal.

#### Scenario: Variante con disponibilidad
- **WHEN** el visitante consulta un producto cuya variante tiene unidades disponibles
- **THEN** el sistema muestra esa variante como disponible y permite agregarla al carrito

#### Scenario: Variante agotada
- **WHEN** una variante no tiene unidades disponibles
- **THEN** el sistema la muestra como agotada y no permite agregarla al carrito

#### Scenario: Venta en tienda reflejada en la web
- **WHEN** el POS vende la última unidad de una variante y luego un visitante consulta ese producto
- **THEN** el sistema muestra la variante como agotada

#### Scenario: Unidades reservadas por otro comprador
- **WHEN** todas las unidades de una variante están reservadas por pagos en curso
- **THEN** el sistema muestra la variante como no disponible mientras duren esas reservas

### Requirement: Gestión de productos y variantes
El sistema DEBE (SHALL) permitir que Gerente y Bodega creen y editen productos y sus variantes de talla y color. Un producto pertenece a una categoría y cada combinación de producto, talla y color existe una sola vez.

#### Scenario: Crear producto con variantes
- **WHEN** un usuario autorizado crea un producto con sus tallas y colores
- **THEN** el sistema crea una variante por cada combinación indicada, con stock cero

#### Scenario: Variante duplicada
- **WHEN** se intenta crear una variante con una combinación de producto, talla y color que ya existe
- **THEN** el sistema la rechaza e informa que la variante ya existe

#### Scenario: Desactivar producto
- **WHEN** un usuario autorizado desactiva un producto
- **THEN** el producto deja de venderse en todos los canales y conserva su historial

### Requirement: Precio y costo administrados por el Gerente
El sistema DEBE (SHALL) permitir que solo el Gerente defina o modifique el precio de venta y el costo de compra de un producto, y mostrar el costo de compra únicamente al Gerente.

#### Scenario: Gerente cambia el precio
- **WHEN** el Gerente modifica el precio de un producto
- **THEN** las ventas nuevas usan el precio nuevo y las ventas ya registradas conservan el precio con que se hicieron

#### Scenario: Otro rol intenta cambiar precio o costo
- **WHEN** un usuario de Bodega o un Vendedor intenta modificar el precio o el costo
- **THEN** el sistema rechaza el cambio

#### Scenario: Costo oculto para otros roles
- **WHEN** un usuario que no es Gerente consulta un producto
- **THEN** la respuesta no incluye el costo de compra

### Requirement: SKU y código escaneable por variante
El sistema DEBE (SHALL) asignar a cada variante un SKU único y un código único que pueda leerse como QR o código de barras, y permitir encontrar la variante a partir de ese código.

#### Scenario: Asignación automática
- **WHEN** se crea una variante sin indicar SKU ni código
- **THEN** el sistema le asigna un SKU y un código únicos

#### Scenario: Código de fábrica existente
- **WHEN** se registra en una variante el código de barras que ya trae la prenda
- **THEN** el sistema lo acepta si no pertenece a otra variante y lo usa para identificarla al escanear

#### Scenario: SKU o código repetido
- **WHEN** se intenta guardar un SKU o un código que ya pertenece a otra variante
- **THEN** el sistema lo rechaza e indica cuál dato está en uso

### Requirement: Etiquetas imprimibles
El sistema DEBE (SHALL) generar etiquetas imprimibles para las variantes seleccionadas, con el código QR, el SKU, el nombre del producto, la talla y el color.

#### Scenario: Generar etiquetas
- **WHEN** un usuario de Bodega o el Gerente solicita etiquetas para un conjunto de variantes indicando la cantidad de cada una
- **THEN** el sistema entrega un documento imprimible con esa cantidad de etiquetas por variante

#### Scenario: Etiqueta legible
- **WHEN** se escanea el QR de una etiqueta impresa
- **THEN** el sistema identifica la variante correspondiente
