-- CMP-20 · Personas atendidas, sin doble conteo. Una cifra por organización y por día: la restricción única impide
-- que el mismo reporte se sume dos veces (el problema del Excel armado con mensajes de WhatsApp, Módulo 2).
-- No se guarda ningún dato de los beneficiarios: solo cuántos fueron (Módulo 1).
CREATE TABLE atenciones (
  id                SERIAL PRIMARY KEY,
  organizacion_id   INTEGER NOT NULL REFERENCES organizaciones(id),
  fecha             DATE NOT NULL,
  personas          INTEGER NOT NULL CHECK (personas > 0 AND personas <= 5000),
  registrada_por_id INTEGER NOT NULL REFERENCES usuarios(id),
  registrada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  corregida_por_id  INTEGER REFERENCES usuarios(id),
  corregida_en      TIMESTAMPTZ,
  CONSTRAINT una_por_organizacion_y_dia UNIQUE (organizacion_id, fecha)
);
