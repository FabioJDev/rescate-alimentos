-- CMP-25 · Registro de las acciones de administración: quién, cuándo y qué (RNF-05). Nunca guarda un PIN.
CREATE TABLE registro_administracion (
  id          SERIAL PRIMARY KEY,
  ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  accion      TEXT NOT NULL,
  detalle     TEXT NOT NULL
);

CREATE INDEX idx_registro_administracion_fecha ON registro_administracion (ocurrido_en DESC, id DESC);
