-- CMP-23 · Foto opcional de la donación (ADR-007). Una foto por donación, ya achicada en el teléfono.
-- Se guarda en la base porque el disco del plan gratis de Render se borra en cada reinicio.
CREATE TABLE fotos_donacion (
  donacion_id INTEGER PRIMARY KEY REFERENCES donaciones(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp')),
  datos       BYTEA NOT NULL,
  bytes       INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 409600),
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
