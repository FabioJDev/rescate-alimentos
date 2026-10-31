# ADR-007 · Fotos achicadas en el teléfono y guardadas en la base de datos

**Estado:** Aceptada

**Satisface:** RF-01 (foto opcional), RNF-02 (pocos datos móviles), RNF-06 (costo cero).

## Contexto

La reflexión del Módulo 1 dejó la foto como opcional en el formulario de donación. Render (plan gratis) borra el disco
en cada reinicio, así que no se puede guardar archivos ahí. Los voluntarios tienen datos limitados.

## Decisión

1. **El teléfono achica la foto antes de enviarla** (máximo 1.024 px de lado, JPEG de calidad media, unos 100 a 300 KB)
   con JavaScript del navegador. El servidor rechaza todo lo que pase de 400 KB o no sea JPEG, PNG o WebP (lo comprueba
   por los primeros bytes del archivo, no por lo que diga el nombre).
2. **Se guarda en PostgreSQL** (tabla `fotos_donacion`, columna `bytea`). Con 8 a 15 rescates por semana y ~200 KB por
   foto son unos 150 MB al año en el peor caso: cabe en el plan gratis de Neon (0,5 GB) por más de dos años.
3. **La foto no se descarga sola:** el detalle muestra «Ver foto (≈ N KB)» y solo se baja si se pide.
4. **Sin conexión no hay foto:** la cola del teléfono (ADR-004) vive en `localStorage`, que tiene unos 5 MB.

## Alternativas consideradas y por qué se descartaron

- **Disco de Render.** Se borra en cada reinicio del plan gratis.
- **Servicio de almacenamiento externo (S3, Cloudinary).** Otra cuenta, otras credenciales y posible costo; la
  fundación no tiene quien lo administre (RNF-08).
- **Guardar la foto original.** Una foto de celular pesa 3 a 5 MB: agota los datos de voluntarios y la base gratis.

## Consecuencias

- **Bueno:** sin servicios nuevos ni costo; las fotos tienen la misma copia de seguridad que los datos.
- **Malo:** si el uso crece mucho, la base gratis se llena. Mitigación: revisar el tamaño de `fotos_donacion` cada
  semestre y borrar fotos de donaciones entregadas hace más de un año.
