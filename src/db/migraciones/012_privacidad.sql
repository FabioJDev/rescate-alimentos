-- CMP-18 · Aviso de privacidad y autorización de datos (Ley 1581 de 2012). Vacío = todavía no lo aceptó: al entrar
-- debe leerlo y aceptarlo. Los usuarios que ya existían también deben aceptarlo la próxima vez que entren.
ALTER TABLE usuarios ADD COLUMN privacidad_aceptada_en TIMESTAMPTZ;
