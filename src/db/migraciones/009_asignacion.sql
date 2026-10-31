-- CMP-14 · La coordinadora asigna (o reasigna) una donación a un voluntario: queda en el historial (RNF-05).
ALTER TABLE movimientos DROP CONSTRAINT movimientos_tipo_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_check
  CHECK (tipo IN ('registro', 'toma', 'entrega', 'liberacion', 'correccion', 'cancelacion', 'asignacion'));
