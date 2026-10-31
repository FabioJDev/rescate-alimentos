-- CMP-13 · Corregir o cancelar una donación.
-- Nuevo estado «cancelada»: el comercio ya no tiene el alimento o se registró por error. Es definitivo.
ALTER TABLE donaciones DROP CONSTRAINT donaciones_estado_check;
ALTER TABLE donaciones ADD CONSTRAINT donaciones_estado_check
  CHECK (estado IN ('disponible', 'asignada', 'entregada', 'cancelada'));

ALTER TABLE donaciones ADD COLUMN motivo_cancelacion TEXT;
ALTER TABLE donaciones ADD COLUMN cancelada_en TIMESTAMPTZ;

-- Una donación cancelada siempre dice por qué y cuándo.
ALTER TABLE donaciones ADD CONSTRAINT cancelada_tiene_motivo
  CHECK (estado <> 'cancelada' OR (motivo_cancelacion IS NOT NULL AND cancelada_en IS NOT NULL));

-- Una cancelada puede no tener voluntario (si nadie la había tomado).
ALTER TABLE donaciones DROP CONSTRAINT asignada_tiene_voluntario;
ALTER TABLE donaciones ADD CONSTRAINT asignada_tiene_voluntario
  CHECK (estado IN ('disponible', 'cancelada') OR (voluntario_id IS NOT NULL AND tomada_en IS NOT NULL));

-- Las correcciones y cancelaciones quedan en el historial (RNF-05).
ALTER TABLE movimientos DROP CONSTRAINT movimientos_tipo_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_check
  CHECK (tipo IN ('registro', 'toma', 'entrega', 'liberacion', 'correccion', 'cancelacion'));
