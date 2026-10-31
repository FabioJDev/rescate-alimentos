-- CMP-12 · Administrar las organizaciones receptoras. Se desactivan, nunca se borran: las entregas pasadas
-- apuntan a ellas (RNF-05) y el reporte las sigue mostrando.
ALTER TABLE organizaciones ADD COLUMN telefono TEXT;
ALTER TABLE organizaciones ADD COLUMN activa BOOLEAN NOT NULL DEFAULT TRUE;

-- «Comedor Esperanza» y «comedor esperanza» serían la misma organización (CA-12.3).
CREATE UNIQUE INDEX uq_organizaciones_nombre_sin_mayusculas ON organizaciones (lower(trim(nombre)));
