-- Índices para las consultas frecuentes sobre donaciones. Hoy no se notan (unas 800 donaciones al año), pero cada
-- lista recorría la tabla entera y eso crece con los años. Cada uno corresponde a una consulta que ya existe.

-- «Todas las donaciones» por páginas (CA-05.7) y el reporte del periodo (CMP-07), que filtran u ordenan por creación.
CREATE INDEX idx_donaciones_creada ON donaciones (creada_en DESC, id DESC);

-- «Mis donaciones» del comercio (CA-05.6).
CREATE INDEX idx_donaciones_donante ON donaciones (donante_id, creada_en DESC);

-- «Mis recogidas» y el control de asignadas al desactivar o cambiar de rol a un voluntario (CA-10.7).
CREATE INDEX idx_donaciones_voluntario_asignada ON donaciones (voluntario_id) WHERE estado = 'asignada';

-- «Recibidas» de una organización (CA-19.8).
CREATE INDEX idx_donaciones_organizacion_entregada ON donaciones (organizacion_id, entregada_en) WHERE estado = 'entregada';

-- «Vienen para nosotros» (CA-19.5).
CREATE INDEX idx_donaciones_destino ON donaciones (destino_organizacion_id) WHERE destino_organizacion_id IS NOT NULL;
