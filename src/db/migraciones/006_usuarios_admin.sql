-- CMP-10 y CMP-11 · Administrar usuarios (ADR-005).
-- Los usuarios se desactivan, nunca se borran: el historial de las donaciones apunta a ellos (RNF-05).
ALTER TABLE usuarios ADD COLUMN telefono TEXT;
ALTER TABLE usuarios ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE;
-- PIN temporal pendiente: al entrar, la persona debe cambiarlo antes de usar la aplicación (CA-11.4).
ALTER TABLE usuarios ADD COLUMN debe_cambiar_pin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN creado_en TIMESTAMPTZ NOT NULL DEFAULT now();

-- Con el nombre se ingresa: «Ana» y «ana» no pueden ser dos usuarios distintos (CA-10.4).
CREATE UNIQUE INDEX uq_usuarios_nombre_sin_mayusculas ON usuarios (lower(trim(nombre)));
