-- CMP-08 · Registrar sin conexión (ADR-004): el teléfono genera un identificador por cada donación guardada
-- sin señal. Si se envía dos veces, la base de datos no deja crear dos (CA-08.3).
-- Es único por quien la registra: un usuario no puede chocar con (ni adivinar) los identificadores de otro.
ALTER TABLE donaciones ADD COLUMN id_local TEXT;
CREATE UNIQUE INDEX uq_donaciones_id_local ON donaciones (registrada_por_id, id_local) WHERE id_local IS NOT NULL;
