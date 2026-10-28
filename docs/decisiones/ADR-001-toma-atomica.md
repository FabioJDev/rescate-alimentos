# ADR-001 · Cómo se garantiza que solo un voluntario tome una donación

**Estado:** Aceptada

**Satisface:** CA-03.2, CA-03.3, CA-03.5 (comportamiento CMP-03).

## Contexto

El problema central del caso es que dos voluntarios llegan al mismo sitio. Cuando dos personas pulsan «Tomar»
sobre la misma donación casi al mismo tiempo, el sistema tiene que dejar a **exactamente una** como asignada y
decirle claramente a la otra que no vaya. Además, la lista que ve el voluntario puede estar desactualizada, así
que la verificación no puede apoyarse en lo que muestra la pantalla.

## Decisión

La toma se hace con **una sola actualización condicional y atómica** en la base de datos:

```sql
UPDATE donaciones
   SET estado = 'asignada', voluntario_id = $1, tomada_en = now()
 WHERE id = $2 AND estado = 'disponible' AND hora_limite > now()
RETURNING *;
```

- Si devuelve una fila, esa persona ganó la donación.
- Si no devuelve filas, se consulta la donación para dar el mensaje correcto: ya la tomó otra persona (y quién y
  cuándo), ya venció, o ya es suya (reintento).
- El registro del movimiento (`movimientos`, tipo `toma`) se escribe en **la misma transacción**.

La base de datos serializa las dos actualizaciones: la primera cambia el estado y la segunda ya no cumple la
condición `estado = 'disponible'`, así que no toca nada.

## Alternativas consideradas y por qué se descartaron

- **Leer y luego escribir desde la aplicación.** Dos voluntarios leen «disponible» a la vez y ambos ganan.
  Es justo el error que queremos evitar.
- **Bloqueo en la memoria del servidor.** No sirve si hay más de una instancia y se pierde al reiniciar
  (Render gratis reinicia el servicio).
- **`SELECT … FOR UPDATE`.** Funciona, pero es más código y más pasos para lograr lo mismo.
- **Columna de versión (bloqueo optimista).** Equivalente, pero más compleja de explicar.

## Consecuencias

- **Bueno:** una sola sentencia, fácil de probar con dos peticiones simultáneas y fácil de explicar.
  Funciona aunque haya varias instancias del servidor.
- **Malo:** la regla vive en la base de datos y depende de que todo cambio de estado pase por esa sentencia;
  si alguien escribe otra ruta que cambie `estado` sin la condición, rompe la garantía.
- **Malo:** hay que hacer una consulta adicional para armar el mensaje de rechazo.
- **Qué pasaría si se cambiara:** si se quita `AND estado = 'disponible'`, los dos voluntarios quedarían
  asignados (el segundo sobrescribiría al primero).
