-- Completa el esquema de Logística: el destino de una compra mientras se paga, las
-- tarifas de despacho y la cola de despachos que no se pudieron emitir.

-- Destino que el cliente indica en el checkout. Existe solo mientras la compra está
-- sin pagar: al confirmarse el pago se convierte en un pedido y la fila se elimina; si
-- el pago falla o vence, también. Así el destino no queda guardado en dos lugares.
CREATE TABLE logistica.solicitudes_despacho (
  id_venta bigint PRIMARY KEY REFERENCES ventas.ventas,
  id_comuna integer NOT NULL REFERENCES logistica.comunas,
  direccion text NOT NULL CHECK (btrim(direccion) <> ''),
  destinatario text NOT NULL CHECK (btrim(destinatario) <> ''),
  telefono text NOT NULL CHECK (btrim(telefono) <> ''),
  -- El flete mostrado al cliente: es lo que se le cobra, aunque la tarifa real difiera.
  flete_cotizado integer NOT NULL CHECK (flete_cotizado >= 0),
  creada_en timestamptz NOT NULL DEFAULT now()
);

-- Última tarifa que respondió Starken para una comuna y un tramo de peso y volumen.
-- Con menos de 24 horas se usa directamente; con Starken caído se usa aunque esté vencida.
CREATE TABLE logistica.tarifas_cache (
  id_comuna integer NOT NULL REFERENCES logistica.comunas,
  -- Límite superior del tramo, en gramos y en centímetros cúbicos.
  tramo_peso integer NOT NULL CHECK (tramo_peso > 0),
  tramo_volumen integer NOT NULL CHECK (tramo_volumen > 0),
  valor integer NOT NULL CHECK (valor >= 0),
  consultado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id_comuna, tramo_peso, tramo_volumen)
);

-- Tarifa que se cobra cuando Starken no responde y no hay una guardada para la comuna.
-- Los valores los define el Gerente.
CREATE TABLE logistica.tarifas_respaldo (
  zona text NOT NULL CHECK (zona IN ('SANTIAGO', 'REGIONES')),
  tramo_peso integer NOT NULL CHECK (tramo_peso > 0),
  valor integer NOT NULL CHECK (valor >= 0),
  PRIMARY KEY (zona, tramo_peso)
);

-- Pedidos cuyo despacho falló al emitirse. Una tarea los reintenta con espera creciente;
-- agotados los reintentos, el pedido pasa a atención manual y sale de esta cola.
CREATE TABLE logistica.despachos_pendientes (
  id_pedido bigint PRIMARY KEY REFERENCES logistica.pedidos,
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  proximo_intento timestamptz NOT NULL,
  ultimo_error text
);

CREATE INDEX despachos_por_reintentar ON logistica.despachos_pendientes (proximo_intento);
CREATE INDEX historial_por_pedido ON logistica.historial_pedido (id_pedido, fecha);
CREATE INDEX pedidos_despachados_sin_entregar ON logistica.pedidos (despachado_en)
  WHERE despachado_en IS NOT NULL AND entregado_en IS NULL;
