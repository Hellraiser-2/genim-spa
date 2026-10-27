-- Las reservas y los movimientos de inventario nacieron antes que el esquema de Ventas
-- y guardaban el número de venta sin validarlo. Con las ventas ya creadas, pasa a ser
-- una clave foránea: no puede existir una reserva ni un movimiento de una venta inexistente.

ALTER TABLE inventario.reservas
  ADD CONSTRAINT reservas_id_venta_fkey FOREIGN KEY (id_venta) REFERENCES ventas.ventas;

ALTER TABLE inventario.movimientos
  ADD CONSTRAINT movimientos_id_venta_fkey FOREIGN KEY (id_venta) REFERENCES ventas.ventas;

CREATE INDEX reservas_por_venta ON inventario.reservas (id_venta);
CREATE INDEX movimientos_por_venta ON inventario.movimientos (id_venta) WHERE id_venta IS NOT NULL;

-- Una venta reserva cada prenda una sola vez: sus unidades van en la cantidad.
ALTER TABLE inventario.reservas
  ADD CONSTRAINT reservas_venta_variante_key UNIQUE (id_venta, id_variante);
