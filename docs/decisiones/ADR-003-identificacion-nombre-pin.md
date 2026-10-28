# ADR-003 · Identificación con nombre + PIN, sin contraseñas ni correo

**Estado:** Aceptada

**Satisface:** RNF-03 (máximo tres pasos), RNF-04 (acceso solo para roles autorizados).

## Contexto

Los usuarios son comerciantes ocupados, voluntarios con poco tiempo y personas con poca familiaridad
tecnológica; algunos comparten un celular. El sistema necesita saber **quién** hace cada cosa (trazabilidad,
RNF-05) y **qué rol** tiene (donante, voluntario o coordinadora). Con un rol por tipo de actor basta.

## Decisión

El ingreso es con **nombre + PIN de 4 dígitos**. El PIN se guarda con hash (`bcryptjs`). La sesión se mantiene
con una cookie y se guarda en la base de datos. El rol del usuario controla qué puede hacer cada ruta.

## Alternativas consideradas y por qué se descartaron

- **Correo y contraseña.** Obliga a registro, verificación y recuperación; demasiados pasos para estos usuarios.
- **Inicio de sesión con Google o WhatsApp.** Suma dependencias externas y no todos tienen cuenta propia.
- **Sin autenticación.** No habría trazabilidad ni control por rol (incumple RNF-04 y RNF-05).

## Consecuencias

- **Bueno:** ingreso en segundos y fácil de entender; no requiere correo.
- **Malo:** seguridad básica. Un PIN de 4 dígitos se puede adivinar; es suficiente para el MVP con datos poco
  sensibles (no hay datos de beneficiarios), pero no para producción real.
  *Mitigación:* revisar en la 3C (límite de intentos, PIN más largo).
- **Malo:** los usuarios con celular compartido deben cerrar sesión para no actuar a nombre de otro.
