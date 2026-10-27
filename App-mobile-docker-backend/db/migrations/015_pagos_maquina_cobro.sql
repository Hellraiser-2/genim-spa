-- Cobros con tarjeta en la máquina de cobro de la tienda. La máquina informa el código
-- de autorización (va en `codigo_autorizacion`), los últimos cuatro dígitos de la tarjeta
-- y el identificador de su cobro. Nunca se guarda el número completo de la tarjeta.

ALTER TABLE pagos.transacciones
  ADD COLUMN ultimos_digitos char(4) CHECK (ultimos_digitos ~ '^[0-9]{4}$'),
  -- Único: un cobro aprobado en la máquina paga una sola venta.
  ADD COLUMN id_cobro_maquina text UNIQUE,
  ADD CONSTRAINT transacciones_cobro_maquina_autorizado
    CHECK (id_cobro_maquina IS NULL OR (codigo_autorizacion IS NOT NULL AND estado = 'AUTORIZADA'));

-- Para buscar una venta por el código que aparece en el voucher de la máquina.
CREATE INDEX transacciones_por_autorizacion ON pagos.transacciones (codigo_autorizacion) WHERE codigo_autorizacion IS NOT NULL;
