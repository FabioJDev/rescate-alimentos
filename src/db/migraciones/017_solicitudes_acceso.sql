-- CMP-24 · Solicitar acceso desde la página de ingreso. Nadie entra sin que la coordinadora revise y apruebe.
CREATE TABLE solicitudes_acceso (
  id               SERIAL PRIMARY KEY,
  nombre           TEXT NOT NULL,
  telefono         TEXT NOT NULL,
  rol              TEXT NOT NULL CHECK (rol IN ('donante', 'voluntario', 'organizacion')),
  zona             TEXT,
  direccion        TEXT,  -- solo para donantes: punto de recogida por defecto (igual que usuarios).
  organizacion_id  INTEGER REFERENCES organizaciones(id),  -- solo para rol organizacion.
  estado           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo   TEXT,
  creada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_en      TIMESTAMPTZ,
  resuelta_por_id  INTEGER REFERENCES usuarios(id),
  usuario_creado_id INTEGER REFERENCES usuarios(id),
  -- Resuelta siempre dice cuándo y quién; rechazada siempre dice el motivo (CA-24.8 y CA-24.9).
  CONSTRAINT solicitud_resuelta_tiene_datos CHECK (
    estado = 'pendiente' OR (resuelta_en IS NOT NULL AND resuelta_por_id IS NOT NULL)),
  CONSTRAINT solicitud_rechazada_tiene_motivo CHECK (
    estado <> 'rechazada' OR motivo_rechazo IS NOT NULL)
);

-- CA-24.5: no puede haber dos solicitudes pendientes con el mismo nombre (comparado sin mayúsculas ni espacios
-- de más, igual que en usuarios, migración 011).
CREATE UNIQUE INDEX idx_solicitud_pendiente_nombre ON solicitudes_acceso
  (lower(translate(regexp_replace(trim(nombre), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ')))
  WHERE estado = 'pendiente';

CREATE INDEX idx_solicitudes_estado ON solicitudes_acceso (estado, creada_en);
