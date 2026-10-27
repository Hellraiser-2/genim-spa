-- Esquema de Pagos: medios de pago con su comisión y una transacción por cada cobro.
-- Nunca se guardan datos de tarjeta: el cobro en línea ocurre en la pasarela, y el
-- presencial en el terminal de la tienda.

CREATE SCHEMA pagos;

CREATE TABLE pagos.medios_pago (
  id_medio smallint PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  -- Verdadero para lo que se cobra en la tienda; falso para lo que informa la pasarela web.
  presencial boolean NOT NULL,
  -- Fracción del monto que se queda el medio de pago: 0.0200 es 2%.
  tasa_comision numeric(5, 4) NOT NULL DEFAULT 0 CHECK (tasa_comision >= 0 AND tasa_comision < 1)
);

-- Las tasas nacen en cero: las configura el Gerente antes de operar.
INSERT INTO pagos.medios_pago (id_medio, codigo, nombre, presencial) VALUES
  (1, 'EFECTIVO', 'Efectivo', true),
  (2, 'DEBITO_PRESENCIAL', 'Tarjeta de débito', true),
  (3, 'CREDITO_PRESENCIAL', 'Tarjeta de crédito', true),
  (4, 'WEBPAY_DEBITO', 'Webpay débito', false),
  (5, 'WEBPAY_CREDITO', 'Webpay crédito', false),
  (6, 'WEBPAY_PREPAGO', 'Webpay prepago', false);

CREATE TABLE pagos.transacciones (
  id_transaccion bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_venta bigint NOT NULL REFERENCES ventas.ventas,
  -- Vacío mientras la pasarela no informa con qué se pagó.
  id_medio smallint REFERENCES pagos.medios_pago,
  monto integer NOT NULL CHECK (monto >= 0),
  estado text NOT NULL CHECK (estado IN ('PENDIENTE', 'AUTORIZADA', 'RECHAZADA', 'ANULADA', 'EXPIRADA', 'REVERSADA')),
  -- Identifica la transacción en la pasarela. Único: el retorno del pago es idempotente por este valor.
  token_webpay text UNIQUE,
  codigo_autorizacion text,
  motivo_rechazo text,
  -- Monto calculado con la tasa del medio al resolverse el pago; no cambia si después cambia la tasa.
  comision integer NOT NULL DEFAULT 0 CHECK (comision >= 0),
  -- Reverso automático de un pago autorizado cuya venta no pudo confirmarse.
  intentos_reverso smallint NOT NULL DEFAULT 0 CHECK (intentos_reverso >= 0),
  requiere_revision boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,
  -- Una transacción está pendiente exactamente mientras no tiene fecha de resolución.
  CHECK ((estado = 'PENDIENTE') = (resuelto_en IS NULL))
);

CREATE INDEX transacciones_por_venta ON pagos.transacciones (id_venta);
CREATE INDEX transacciones_pendientes ON pagos.transacciones (creado_en) WHERE estado = 'PENDIENTE';
CREATE INDEX transacciones_por_revisar ON pagos.transacciones (id_transaccion) WHERE requiere_revision;

-- Las ventas pagadas antes de existir este esquema quedan con su transacción, para que
-- toda venta pagada tenga una. El medio se deja vacío: no quedó registrado.
INSERT INTO pagos.transacciones (id_venta, monto, estado, creado_en, resuelto_en)
SELECT v.id_venta, v.total, 'AUTORIZADA', v.fecha, v.fecha
FROM ventas.ventas v
JOIN ventas.estados_venta e ON e.id_estado = v.id_estado
WHERE e.codigo = 'PAGADA';
