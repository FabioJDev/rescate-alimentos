-- Tabla de sesiones para connect-pg-simple. Guardar las sesiones en la base de datos hace que
-- un reinicio de Render (plan gratis) no cierre la sesión de todos (ver ADR-002 y ADR-003).
CREATE TABLE "session" (
  "sid"    VARCHAR NOT NULL PRIMARY KEY,
  "sess"   JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
