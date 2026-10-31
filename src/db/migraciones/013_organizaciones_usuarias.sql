-- CMP-19 · Las organizaciones receptoras usan la aplicación con el rol «organizacion» y piden donaciones.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('donante', 'voluntario', 'coordinadora', 'organizacion'));

-- Un usuario de una organización siempre dice a cuál pertenece.
ALTER TABLE usuarios ADD COLUMN organizacion_id INTEGER REFERENCES organizaciones(id);
ALTER TABLE usuarios ADD CONSTRAINT organizacion_tiene_organizacion
  CHECK (rol <> 'organizacion' OR organizacion_id IS NOT NULL);

-- La organización que pidió la donación (destino). La entrega real sigue en `organizacion_id` (CMP-04).
ALTER TABLE donaciones ADD COLUMN destino_organizacion_id INTEGER REFERENCES organizaciones(id);

-- Pedir y dejar de pedir una donación queda en el historial (RNF-05).
ALTER TABLE movimientos DROP CONSTRAINT movimientos_tipo_check;
ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_check
  CHECK (tipo IN ('registro', 'toma', 'entrega', 'liberacion', 'correccion', 'cancelacion', 'asignacion',
                  'solicitud', 'retiro_solicitud'));
