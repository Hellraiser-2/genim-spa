-- Próximo concierto de cada banda en Chile. La tienda destaca en su portada las poleras
-- de las bandas que vienen dentro de los próximos doce meses. Una fecha ya pasada no se
-- borra sola: simplemente deja de contar.

ALTER TABLE inventario.bandas
  ADD COLUMN concierto_fecha date,
  -- Recinto y ciudad, por ejemplo "Estadio Nacional, Santiago".
  ADD COLUMN concierto_lugar text CHECK (btrim(concierto_lugar) <> ''),
  ADD CONSTRAINT bandas_concierto_con_fecha CHECK (concierto_lugar IS NULL OR concierto_fecha IS NOT NULL);
