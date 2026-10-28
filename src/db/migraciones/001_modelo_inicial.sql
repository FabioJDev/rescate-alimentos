-- Modelo de datos inicial (ver docs/spec/plan-tecnico.md, sección 3).
-- «Vencida» NO se guarda: se calcula al consultar (disponible + hora_limite cumplida).

CREATE TABLE usuarios (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,
  rol       TEXT NOT NULL CHECK (rol IN ('donante', 'voluntario', 'coordinadora')),
  pin_hash  TEXT NOT NULL,
  zona      TEXT,
  direccion TEXT  -- solo para donantes: punto de recogida por defecto
);

CREATE TABLE organizaciones (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL UNIQUE,
  direccion    TEXT NOT NULL,
  zona         TEXT NOT NULL,
  refrigeracion BOOLEAN NOT NULL DEFAULT FALSE
);

-- Genera los códigos legibles D-0001, D-0002, ...
CREATE SEQUENCE secuencia_codigo_donacion;

CREATE TABLE donaciones (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE
                    DEFAULT ('D-' || lpad(nextval('secuencia_codigo_donacion')::text, 4, '0')),
  tipo_alimento     TEXT NOT NULL CHECK (tipo_alimento IN (
                      'Frutas y verduras', 'Panadería', 'Lácteos', 'Cárnicos',
                      'Comida preparada', 'Granos y secos', 'Otro')),
  -- La cantidad es declarada, no verificada: nadie pesa el alimento.
  cantidad          NUMERIC NOT NULL CHECK (cantidad > 0),
  unidad            TEXT NOT NULL CHECK (unidad IN ('kg', 'unidades', 'cajas', 'bultos')),
  punto_recogida    TEXT NOT NULL,
  zona              TEXT NOT NULL,
  hora_limite       TIMESTAMPTZ NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'disponible'
                    CHECK (estado IN ('disponible', 'asignada', 'entregada')),
  donante_id        INTEGER NOT NULL REFERENCES usuarios(id),
  registrada_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  voluntario_id     INTEGER REFERENCES usuarios(id),
  tomada_en         TIMESTAMPTZ,
  organizacion_id   INTEGER REFERENCES organizaciones(id),
  recibido_por      TEXT,
  entregada_en      TIMESTAMPTZ,
  -- Una donación asignada o entregada siempre tiene voluntario y hora de toma.
  CONSTRAINT asignada_tiene_voluntario CHECK (
    estado = 'disponible' OR (voluntario_id IS NOT NULL AND tomada_en IS NOT NULL)),
  -- Una donación entregada siempre tiene organización, quien recibe y hora de entrega.
  CONSTRAINT entregada_tiene_datos CHECK (
    estado <> 'entregada' OR (organizacion_id IS NOT NULL AND recibido_por IS NOT NULL AND entregada_en IS NOT NULL))
);

-- Trazabilidad sanitaria (RNF-05): quién, qué y cuándo.
CREATE TABLE movimientos (
  id          SERIAL PRIMARY KEY,
  donacion_id INTEGER NOT NULL REFERENCES donaciones(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('registro', 'toma', 'entrega')),
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
  ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  detalle     TEXT
);

CREATE INDEX idx_donaciones_estado_hora ON donaciones (estado, hora_limite);
CREATE INDEX idx_movimientos_donacion ON movimientos (donacion_id, ocurrido_en);
