-- CMP-09 · Catálogo de zonas. Antes la zona se escribía a mano: «Norte» y «norte» eran dos zonas distintas.
-- Las columnas `zona` de usuarios, organizaciones y donaciones siguen siendo texto con el nombre de la zona;
-- esta lista controla qué se puede elegir en los formularios.
CREATE TABLE zonas (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT TRUE
);

-- Dos zonas no pueden llamarse igual aunque cambien mayúsculas o espacios (CA-09.3).
CREATE UNIQUE INDEX uq_zonas_nombre ON zonas (lower(trim(nombre)));

-- CA-09.7: las zonas que ya estaban escritas quedan en la lista. No se cambia ningún dato existente.
INSERT INTO zonas (nombre)
SELECT DISTINCT ON (lower(trim(z.nombre))) trim(z.nombre)
  FROM (SELECT zona AS nombre FROM usuarios
        UNION ALL SELECT zona FROM organizaciones
        UNION ALL SELECT zona FROM donaciones) z
 WHERE z.nombre IS NOT NULL AND trim(z.nombre) <> ''
 ORDER BY lower(trim(z.nombre)), trim(z.nombre)
ON CONFLICT ((lower(trim(nombre)))) DO NOTHING;
