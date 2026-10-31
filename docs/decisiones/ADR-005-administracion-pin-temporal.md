# ADR-005 · Administración por la coordinadora con PIN temporal y cierre de sesiones

**Estado:** Aceptada

**Satisface:** RNF-04 (solo roles autorizados), RNF-05 (trazabilidad), RNF-08 (operable por la fundación sin
personal técnico). Completa el ADR-003.

## Contexto

Hasta la 3C los usuarios solo se creaban con la semilla de demostración o con SQL, y un PIN olvidado no tenía
arreglo: se guarda con hash y nadie lo puede leer. La fundación no tiene personal técnico, así que alguien de la
fundación tiene que poder crear usuarios, sacar a quien se fue y resolver un PIN olvidado. Pero si esa persona
conoce el PIN de todos, el historial («tomada por Ana») deja de ser confiable.

## Decisión

1. **La coordinadora administra** usuarios, zonas y organizaciones desde pantallas que solo ella ve.
2. **PIN temporal generado por el sistema.** Al crear un usuario o restablecer su PIN, el servidor genera 4 dígitos
   al azar (`crypto.randomInt`), los guarda con hash, marca `debe_cambiar_pin` y los muestra **una sola vez**. Al
   entrar, la persona debe cambiarlo antes de usar cualquier otra pantalla (CA-11.4). Así nadie más conoce su PIN.
3. **Cerrar las sesiones al cambiar algo importante.** Desactivar, editar o restablecer el PIN de un usuario borra
   sus sesiones de la tabla `session` (la sesión guarda su nombre, rol y zona). Así un usuario desactivado sale de
   inmediato y uno editado vuelve a entrar con sus datos nuevos, sin consultar la base de datos en cada petición.
4. **Desactivar, nunca borrar.** Los movimientos apuntan a usuarios y organizaciones; borrarlos rompería la
   trazabilidad sanitaria.
5. **Siempre hay una coordinadora activa.** La coordinadora no puede desactivarse ni quitarse el rol.

## Alternativas consideradas y por qué se descartaron

- **La coordinadora escribe el PIN del usuario.** Más simple, pero ella conocería todos los PIN y podría actuar a
  nombre de otros. Descartada por RNF-05.
- **Recuperar el PIN por SMS o correo.** Costo (SMS) y muchos usuarios no usan correo (ADR-003).
- **Revisar en cada petición si el usuario sigue activo.** Una consulta extra en cada página, en un plan gratis y
  con redes 3G. Cerrar las sesiones al cambiar logra lo mismo solo cuando hace falta.

## Consecuencias

- **Bueno:** la fundación es autónoma para el día a día; ningún cambio de usuario requiere al equipo técnico.
- **Bueno:** el historial sigue siendo confiable: solo cada persona conoce su PIN.
- **Malo:** un paso más la primera vez que alguien entra (cambiar el PIN). Se acepta: ocurre una sola vez.
- **Malo:** la coordinadora tiene que hacer llegar el PIN temporal a la persona (en persona o por llamada).
