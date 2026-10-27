# Spec Delta

## Purpose

Permite al cliente de la tienda web ver cómo le queda una prenda sobre un maniquí 3D con su altura y su peso, y elegir la talla con una recomendación.

## ADDED Requirements

### Requirement: Abrir el probador desde una prenda
El sistema DEBE (SHALL) mostrar el botón Probar en las prendas de categorías con tabla de medidas (poleras, polerones, chaquetas, pantalones y cinturones) y abrir con él el probador de esa prenda.

#### Scenario: Prenda con tabla de medidas
- **WHEN** el cliente pulsa Probar en una polera
- **THEN** el sistema abre el probador con el maniquí vestido con esa polera, en su color y su talla

#### Scenario: Categoría sin tabla de medidas
- **WHEN** una prenda pertenece a una categoría sin tabla de medidas
- **THEN** su tarjeta no muestra el botón Probar

### Requirement: Maniquí según altura y peso
El sistema DEBE (SHALL) ajustar las proporciones del maniquí a la altura (140–210 cm) y el peso (35–180 kg) que ingresa el cliente, y recordar esos valores en el navegador.

#### Scenario: Cambio de medidas
- **WHEN** el cliente cambia su altura o su peso a un valor válido
- **THEN** el maniquí y la prenda se redibujan con las nuevas proporciones

#### Scenario: Medidas fuera de rango
- **WHEN** el cliente ingresa una altura o un peso fuera de rango
- **THEN** el sistema indica el rango válido y conserva el último maniquí válido

#### Scenario: Medidas recordadas
- **WHEN** el cliente abre el probador de otra prenda
- **THEN** el sistema usa la altura y el peso que ingresó antes

### Requirement: Ajuste de cada talla
El sistema DEBE (SHALL) indicar para la talla elegida si queda apretada, justa u holgada, y si el largo es corto, adecuado o largo, y dibujar la prenda con esas medidas.

#### Scenario: Talla menor que el cuerpo
- **WHEN** el contorno estimado del cliente supera el rango de la talla elegida
- **THEN** el sistema indica que la talla queda apretada y dibuja la prenda ceñida al cuerpo

#### Scenario: Talla mayor que el cuerpo
- **WHEN** el contorno estimado del cliente queda bajo el rango de la talla elegida
- **THEN** el sistema indica que la talla queda holgada y dibuja la prenda suelta

### Requirement: Recomendación de talla
El sistema DEBE (SHALL) recomendar la talla cuyo rango contiene el contorno estimado del cliente, o la más cercana, e indicar si esa talla tiene stock en el color elegido.

#### Scenario: Talla recomendada con stock
- **WHEN** la talla recomendada tiene stock
- **THEN** el probador la selecciona y permite agregarla al carrito

#### Scenario: Talla recomendada sin stock
- **WHEN** la talla recomendada no tiene stock
- **THEN** el probador lo indica y no permite agregarla al carrito
