-- CMP-22 · Kilos aproximados. Opcional: el comercio puede decir cuántos kilos calcula cuando la unidad no es kg.
-- Es una cifra declarada, no pesada (nadie pesa el alimento, Módulo 2).
ALTER TABLE donaciones ADD COLUMN kg_aproximados NUMERIC CHECK (kg_aproximados IS NULL OR kg_aproximados > 0);
