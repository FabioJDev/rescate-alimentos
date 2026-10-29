-- CMP-06 · Soltar una donación tomada: el movimiento de la liberación queda en el historial (RNF-05).
-- Se reemplaza la restricción de los tipos de movimiento para aceptar también «liberacion».
ALTER TABLE movimientos DROP CONSTRAINT movimientos_tipo_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_check
  CHECK (tipo IN ('registro', 'toma', 'entrega', 'liberacion'));
