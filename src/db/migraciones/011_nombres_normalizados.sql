-- CMP-17 · Nombres de usuario fáciles de escribir. «Ana Pérez», «ANA PÉREZ» y «ana   pérez» son el mismo usuario.
-- Se normaliza a mano (espacios, mayúsculas, vocales con tilde y ñ) para que funcione igual sin importar la
-- configuración de idioma de la base de datos. La misma expresión se usa al ingresar (servicios/usuarios.js).
DROP INDEX uq_usuarios_nombre_sin_mayusculas;
CREATE UNIQUE INDEX uq_usuarios_nombre_normalizado
  ON usuarios (lower(translate(regexp_replace(trim(nombre), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ')));
