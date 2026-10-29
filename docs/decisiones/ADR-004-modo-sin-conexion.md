# ADR-004 · Registrar sin conexión con una cola en el teléfono y sincronización repetible

**Estado:** Aceptada (3C)

**Satisface:** RNF-01 (funcionar con señal deficiente). Es el riesgo técnico que dejó el Módulo 2: «sin señal no se
puede registrar».

## Contexto

Los comercios y voluntarios a veces están en sótanos, bodegas o barrios con señal intermitente. En el MVP, si la
señal se cae justo al enviar el formulario, la persona pierde lo escrito y vuelve al WhatsApp. La aplicación
genera las páginas en el servidor (ADR de alternativa B), así que sin red no hay página.

## Decisión

Solo **registrar una donación** (CMP-01) funciona sin conexión, con tres piezas pequeñas:

1. **Un service worker** (`src/publico/sw.js`) guarda en el teléfono la pantalla «Publicar donación», los estilos
   y el script. Con conexión siempre pide primero la versión nueva al servidor; sin conexión usa la guardada.
   Cualquier otra pantalla sin conexión muestra «Sin conexión» (CA-08.6).
2. **Una cola de pendientes** en `localStorage` del navegador (`src/publico/sin-conexion.js`). Si el envío falla
   por falta de red, la donación se guarda con un identificador único generado en el teléfono (`id_local`).
3. **Un punto de sincronización** `POST /api/donaciones/sincronizar` que recibe una donación pendiente, la valida
   con **las mismas reglas** de CMP-01 y la registra. El `id_local` es único en la base de datos (columna
   `donaciones.id_local`): enviar lo mismo dos veces devuelve la donación ya creada, no una nueva (CA-08.3).

La cola se vacía sola al volver la señal (evento `online`) y cada vez que se abre una pantalla con conexión.

## Por qué solo registrar, y no tomar ni entregar

**Tomar** (CMP-03) solo es seguro si el servidor decide quién gana. Un teléfono sin señal no puede saber si otro
voluntario ya la tomó: dejarlo «tomar» sin conexión reabriría el problema que el sistema existe para resolver (dos
voluntarios en el mismo sitio). **Entregar** sí podría encolarse, pero depende de haber tomado antes y se hace
al llegar a la organización, donde casi siempre hay señal; se deja fuera para no ampliar el alcance sin necesidad.

## Alternativas consideradas y por qué se descartaron

- **Aplicación nativa o PWA completa con base local (IndexedDB + reglas duplicadas).** Duplica la lógica de
  validación en el teléfono y en el servidor; mucho más código para dos estudiantes. Descartada por simplicidad.
- **Cola solo en memoria de la página.** Se pierde si se cierra el navegador, justo cuando más se necesita.
- **Dejar que el servidor reciba la hora del teléfono como la fecha de registro.** El reloj del teléfono no es
  confiable; la fecha de registro la sigue poniendo el servidor al sincronizar. La hora en que se guardó en el
  teléfono queda anotada en el historial como dato informativo.

## Consecuencias

- **Bueno:** nadie pierde lo escrito por una caída de señal; las reglas de validación son las del servidor, sin duplicarlas.
- **Bueno:** el envío repetido es seguro (idempotente), lo que también ayuda con la mala señal en general.
- **Malo:** una donación guardada sin conexión puede vencerse antes de sincronizar; se rechaza y se avisa (CA-08.4).
- **Malo:** la pantalla guardada puede traer el punto de recogida de la última sesión en ese teléfono. Por eso la
  cola guarda el usuario que escribió cada pendiente y el servidor **no registra** a nombre de otro (CA-08.5).
- **Malo:** `localStorage` no está cifrado; no se guarda ningún PIN ni dato sensible, solo lo del formulario.
