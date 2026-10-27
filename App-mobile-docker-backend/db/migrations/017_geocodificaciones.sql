-- Coordenadas de las direcciones de despacho, para la ruta de reparto de la bodega.
--
-- Ubicar una dirección en el mapa se hace con un servicio externo (Nominatim, de
-- OpenStreetMap) que pide no repetir consultas: cada dirección se busca una vez y su
-- resultado queda aquí. La clave es la dirección completa ya normalizada (minúsculas, sin
-- tildes), así dos pedidos a la misma dirección comparten la búsqueda.
CREATE TABLE logistica.geocodificaciones (
  consulta text PRIMARY KEY CHECK (btrim(consulta) <> ''),
  -- Sin coordenadas: el servicio no encontró la dirección. Se reintenta después de un día.
  lat double precision CHECK (lat BETWEEN -90 AND 90),
  lon double precision CHECK (lon BETWEEN -180 AND 180),
  -- DIRECCION: la calle y el número; COMUNA: solo se encontró la comuna (ubicación aproximada).
  precision text CHECK (precision IN ('DIRECCION', 'COMUNA')),
  buscada_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((lat IS NULL) = (lon IS NULL) AND (lat IS NULL) = (precision IS NULL))
);
