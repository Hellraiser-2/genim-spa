-- Teléfono y dirección de la cuenta, que el cliente entrega al registrarse. Las cuentas
-- anteriores a esta migración y las del personal no los tienen.

ALTER TABLE usuarios.usuarios
  -- Número chileno completo, con su prefijo y sin espacios: +56 seguido de nueve dígitos.
  ADD COLUMN telefono text CHECK (telefono ~ '^\+56[0-9]{9}$'),
  ADD COLUMN direccion text CHECK (btrim(direccion) <> '');
