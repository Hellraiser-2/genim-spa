-- Completa el esquema de Ventas con lo que necesitan el punto de venta, el e-commerce
-- y los indicadores: ubicación de origen de cada línea, costos de la venta, visitas y
-- parámetros financieros.

-- De dónde salió cada línea de una venta POS: la sala de ventas o la bodega. Queda
-- vacío en una compra web, cuyas unidades se descuentan al despachar.
ALTER TABLE ventas.detalle_venta ADD COLUMN id_ubicacion smallint REFERENCES inventario.ubicaciones;

CREATE INDEX ventas_por_vendedor ON ventas.ventas (id_vendedor, fecha DESC) WHERE id_vendedor IS NOT NULL;
CREATE INDEX ventas_por_cliente ON ventas.ventas (id_cliente, fecha DESC) WHERE id_cliente IS NOT NULL;
CREATE INDEX ventas_por_fecha ON ventas.ventas (fecha DESC);
CREATE INDEX detalle_por_variante ON ventas.detalle_venta (id_variante);

-- Costos de una venta que informan los otros servicios, para calcular su rentabilidad:
-- total − costo de las prendas − comisión del pago − costo del despacho.
CREATE TABLE ventas.costos_venta (
  id_venta bigint PRIMARY KEY REFERENCES ventas.ventas,
  comision_pago integer NOT NULL DEFAULT 0 CHECK (comision_pago >= 0),
  -- Lo que pagó el cliente por el despacho; es parte del total de la venta.
  flete_cobrado integer NOT NULL DEFAULT 0 CHECK (flete_cobrado >= 0),
  -- Lo que cobró el transportista. Vacío hasta que el pedido se despacha.
  costo_despacho integer CHECK (costo_despacho >= 0)
);

INSERT INTO ventas.costos_venta (id_venta, flete_cobrado)
SELECT v.id_venta, COALESCE(p.flete_cobrado, 0)
FROM ventas.ventas v
LEFT JOIN logistica.pedidos p ON p.id_venta = v.id_venta;

-- Visitas al e-commerce, para el indicador de conversión. El identificador lo genera
-- el navegador y es anónimo; su unicidad hace que varias páginas vistas en una misma
-- visita cuenten una sola.
CREATE TABLE ventas.visitas (
  id_visita bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sesion uuid NOT NULL UNIQUE,
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visitas_por_fecha ON ventas.visitas (fecha);

-- Parámetros con que se calculan ROI, VAN y TIR. Una sola fila: son los vigentes.
CREATE TABLE ventas.parametros_financieros (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  inversion_inicial bigint NOT NULL CHECK (inversion_inicial >= 0),
  -- Fracción anual: 0.1200 es 12%.
  tasa_descuento_anual numeric(6, 4) NOT NULL CHECK (tasa_descuento_anual > -1),
  horizonte_meses integer NOT NULL CHECK (horizonte_meses > 0),
  actualizado_por integer NOT NULL REFERENCES usuarios.usuarios,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
