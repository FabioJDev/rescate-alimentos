-- CMP-16 · Límite de intentos de ingreso (ADR-006). Una fila por nombre escrito («nombre:ana pérez») y otra por
-- origen («origen:190.1.2.3»). Se cuenta por el nombre escrito, exista o no el usuario: así el bloqueo no revela
-- qué nombres existen. Vive en la base (no en memoria) para que un reinicio de Render no borre el conteo.
CREATE TABLE intentos_ingreso (
  clave           TEXT PRIMARY KEY,
  fallos          INTEGER NOT NULL DEFAULT 0,
  desde           TIMESTAMPTZ NOT NULL DEFAULT now(),
  bloqueado_hasta TIMESTAMPTZ
);
