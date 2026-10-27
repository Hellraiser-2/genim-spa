-- Ofertas mensuales: el precio rebajado que un producto tiene durante un mes calendario.
-- La tienda cobra ese precio mientras dura el mes. Al terminar, el producto vuelve solo a
-- su precio normal y la fila queda como historial de lo que estuvo en oferta.

CREATE TABLE inventario.ofertas (
  id_oferta integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_producto integer NOT NULL REFERENCES inventario.productos,
  -- Primer día del mes en que rige la oferta.
  mes date NOT NULL CHECK (EXTRACT(day FROM mes) = 1),
  -- Debe ser menor que el precio normal del producto. Lo valida el servicio, que conoce ambos.
  precio_oferta integer NOT NULL CHECK (precio_oferta > 0),
  -- Quién la definió.
  id_usuario integer NOT NULL REFERENCES usuarios.usuarios,
  creada_en timestamptz NOT NULL DEFAULT now(),
  -- Un producto tiene a lo más una oferta por mes.
  UNIQUE (id_producto, mes)
);
