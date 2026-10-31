# ADR-006 · Seguridad básica: intentos, origen de los formularios, cabeceras y errores

**Estado:** Aceptada

**Satisface:** RNF-04 (acceso solo para roles autorizados), RNF-08 (mantenible sin personal técnico). Completa la
mitigación que el ADR-003 dejó pendiente.

## Contexto

El PIN de 4 dígitos (ADR-003) es fácil de usar pero fácil de adivinar si no hay límite. Además, cualquier página web
podría intentar enviar un formulario a la aplicación usando la sesión abierta de alguien (falsificación de peticiones
entre sitios, CSRF), y un error inesperado solo decía «Algo salió mal», sin forma de encontrarlo después.

## Decisión

1. **Límite de intentos en la base de datos.** 5 fallos seguidos bloquean ese usuario 15 minutos; 20 fallos desde el
   mismo origen (IP) en 15 minutos bloquean ese origen. Se guarda en PostgreSQL y no en memoria, porque Render reinicia
   el servidor seguido (plan gratis) y el conteo se perdería. Restablecer el PIN desbloquea (CMP-16).
2. **Comprobar el origen de cada envío.** Todo POST que trae la cabecera `Origin` (o, si no, `Referer`) de otro sitio se
   rechaza. Los navegadores siempre la mandan en un POST, así que un ataque desde otra página se detecta. Se suma a la
   cookie `SameSite=Lax` que ya existía.
3. **Cabeceras de seguridad con `helmet`.** Política de contenido que solo permite scripts propios, prohíbe mostrar la
   aplicación dentro de otra página y adivinar tipos de archivo. Las vistas ya no usan scripts en línea.
4. **Errores con código.** Cada error inesperado recibe un código corto que ve el usuario y que queda en el registro de
   Render junto a la ruta, el usuario y el error.

## Alternativas consideradas y por qué se descartaron

- **Token CSRF en cada formulario.** Es la defensa más conocida, pero obliga a tocar las ~30 vistas y todas las
  pruebas, y la comprobación de `Origin` más `SameSite=Lax` cubre el mismo ataque para navegadores actuales. Si un día
  se sirve la aplicación en varios dominios, se reconsidera.
- **Límite de intentos en memoria** (por ejemplo `express-rate-limit`). Se pierde en cada reinicio de Render.
- **PIN más largo.** Más difícil de recordar para estos usuarios (RNF-03); con el límite de intentos el de 4 dígitos
  alcanza para datos de esta sensibilidad.

## Consecuencias

- **Bueno:** adivinar un PIN pasa de minutos a meses; el registro permite resolver un error con el código que dicta el usuario.
- **Malo:** alguien que conozca un nombre puede bloquear a esa persona 15 minutos fallando a propósito. Se acepta: es
  temporal y la coordinadora lo resuelve restableciendo el PIN.
