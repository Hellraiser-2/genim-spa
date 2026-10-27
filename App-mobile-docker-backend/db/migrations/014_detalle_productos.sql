-- Lo que la página de un producto muestra además de su foto y su precio: cómo está
-- estampado y cuánto mide cada talla.

-- Técnica del estampado, por ejemplo "Serigrafía" o "Bordado". Es del producto.
ALTER TABLE inventario.productos
  ADD COLUMN tipo_estampado text CHECK (btrim(tipo_estampado) <> '');

-- Guía de tallas: las medidas de la prenda extendida, en centímetros. Son de la categoría
-- y no de cada producto, porque todas las poleras de una talla miden lo mismo. El ancho es
-- de lado a lado, a la altura del pecho o de la cintura según la prenda.
ALTER TABLE inventario.categorias_tallas
  ADD COLUMN ancho_cm integer CHECK (ancho_cm > 0),
  ADD COLUMN largo_cm integer CHECK (largo_cm > 0);
