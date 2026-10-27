-- Transferencia bancaria como medio de pago en la tienda, y cierres de caja del POS.

-- El siguiente identificador libre: otras versiones de la base pueden haber agregado medios.
INSERT INTO pagos.medios_pago (id_medio, codigo, nombre, presencial)
SELECT COALESCE(max(id_medio), 0) + 1, 'TRANSFERENCIA', 'Transferencia bancaria', true FROM pagos.medios_pago
ON CONFLICT (codigo) DO NOTHING;

-- Número de operación de una transferencia, para cuadrarla con la cartola del banco.
ALTER TABLE pagos.transacciones
  ADD COLUMN numero_operacion text CHECK (numero_operacion ~ '^[A-Za-z0-9-]{1,40}$');

-- Cierre de caja: el vendedor cuenta el efectivo al terminar y lo compara con lo esperado
-- (fondo inicial más las ventas en efectivo). Cubre todas sus ventas POS aún sin cerrar.
CREATE TABLE ventas.cierres_caja (
  id_cierre bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_vendedor integer NOT NULL REFERENCES usuarios.usuarios,
  fecha timestamptz NOT NULL DEFAULT now(),
  -- Primera y última venta que cubre; vacías en un cierre sin ventas.
  desde timestamptz,
  hasta timestamptz,
  ventas integer NOT NULL CHECK (ventas >= 0),
  total integer NOT NULL CHECK (total >= 0),
  -- Efectivo con que partió la caja.
  fondo_inicial integer NOT NULL CHECK (fondo_inicial >= 0),
  efectivo_ventas integer NOT NULL CHECK (efectivo_ventas >= 0),
  efectivo_contado integer NOT NULL CHECK (efectivo_contado >= 0),
  -- Contado menos esperado: positivo sobra, negativo falta.
  diferencia integer GENERATED ALWAYS AS (efectivo_contado - fondo_inicial - efectivo_ventas) STORED,
  observacion text,
  clave_idempotencia text NOT NULL UNIQUE,
  CHECK ((desde IS NULL) = (ventas = 0) AND (hasta IS NULL) = (ventas = 0)),
  -- Una caja descuadrada se cierra explicando la diferencia.
  CHECK (efectivo_contado = fondo_inicial + efectivo_ventas OR btrim(COALESCE(observacion, '')) <> '')
);

CREATE INDEX cierres_por_fecha ON ventas.cierres_caja (fecha DESC);
CREATE INDEX cierres_por_vendedor ON ventas.cierres_caja (id_vendedor, fecha DESC);

-- Cada venta POS queda en un solo cierre; mientras no lo tiene, está en la caja abierta.
ALTER TABLE ventas.ventas ADD COLUMN id_cierre bigint REFERENCES ventas.cierres_caja;
ALTER TABLE ventas.ventas ADD CONSTRAINT ventas_cierre_solo_pos CHECK (id_cierre IS NULL OR canal = 'POS');
CREATE INDEX ventas_por_cierre ON ventas.ventas (id_cierre) WHERE id_cierre IS NOT NULL;
CREATE INDEX ventas_sin_cerrar ON ventas.ventas (id_vendedor) WHERE canal = 'POS' AND id_cierre IS NULL;
