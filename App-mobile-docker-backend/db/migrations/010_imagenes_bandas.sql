-- Foto de cada banda, para mostrarla en la tienda. La imagen se guarda en la base y el
-- backend la entrega por una dirección propia, de modo que ningún cliente necesita
-- traerla incluida.

ALTER TABLE inventario.bandas
  ADD COLUMN imagen bytea,
  -- Solo formatos de foto: lo guardado se entrega tal cual a los navegadores.
  ADD COLUMN imagen_tipo text CHECK (imagen_tipo IN ('image/jpeg', 'image/png', 'image/webp')),
  -- Cambia con la imagen. Va en su dirección, para que el navegador la guarde sin volver a pedirla.
  ADD COLUMN imagen_huella text,
  -- Autor y licencia de la foto, que la tienda muestra junto a ella.
  ADD COLUMN imagen_credito text,
  ADD CONSTRAINT bandas_imagen_completa CHECK ((imagen IS NULL) = (imagen_tipo IS NULL) AND (imagen IS NULL) = (imagen_huella IS NULL));
