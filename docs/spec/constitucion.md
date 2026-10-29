# Constitución del proyecto

Equipo **Overflow** — *Que ninguna idea se desborde sin resolver*.
Proyecto Informático 2 (UAO) · Caso: Red de Rescate de Alimentos · Fundación Mesa Común.

## 1. Equipo y roles

El equipo tiene dos integrantes para cinco roles; así se cubren.

| Integrante | Usuario de GitHub | Roles que cubre | Artefacto que produce |
|---|---|---|---|
| Fabio Jordan | [FabioJDev](https://github.com/FabioJDev) | Product Owner, UX Designer, DevOps Engineer, Developer | Backlog priorizado (tablero), pantallas (`docs/ux/pantallas.md`), CI y despliegue, incremento de código |
| Juan David Morales | [juandavidmorales317](https://github.com/juandavidmorales317) | QA Engineer y revisor (Developer de apoyo) | Revisión y aprobación de cada PR nombrando los CA verificados, verificación manual en la URL desplegada, firma en `docs/qa/plan-de-pruebas.md` |

## 2. Herramientas acordadas

- **GitHub** (repositorio, pull requests y Projects como tablero).
- **Node.js 20** y **Express** para la aplicación.
- **PostgreSQL**, alojado en **Neon** (plan gratis).
- **Render** como hosting (plan gratis).
- **Jest + Supertest** para las pruebas automáticas.
- **GitHub Actions** para correr las pruebas en cada pull request.

La justificación de cada elección está en `docs/spec/plan-tecnico.md` y en los ADR de `docs/decisiones/`.

## 3. Convenciones

- **Ramas:** `feat/CMP-03-tomar-donacion`, `docs/constitucion`, `infra/ci`, `test/CMP-03-concurrencia`.
- **Commits** (Conventional Commits, en español, con ID):
  `feat(CMP-03): bloquear la segunda toma [CA-03.2]`, `docs(spec): agregar CMP-04`,
  `test(CMP-03): prueba de toma simultánea [CA-03.2]`, `ci: agregar pruebas en cada PR`.
- **Título del PR:** `[CMP-03] Tomar una donación con bloqueo de segunda toma`.
- **Cuerpo del PR:** la plantilla `.github/pull_request_template.md`, con `Closes #<issue>` para enlazar y cerrar la tarjeta (GitHub solo entiende la palabra en inglés).
- **Pruebas:** un archivo por comportamiento (`tests/cmp-03.test.js`); cada caso empieza con su ID:
  `test('CA-03.2 · dos voluntarios toman al mismo tiempo: solo uno queda asignado', ...)`.
- **IDs estables:** CMP-01…CMP-05 y CA-0X.Y nunca se renumeran. Si un CA se elimina, se marca «(retirado)»
  con su razón y el número no se reutiliza.
- **La especificación manda:** si algo cambia, se cambia primero `docs/spec/comportamientos.md` (con la razón)
  y después el código.
- **Nunca** se hace push directo a `main` y nada se integra sin la aprobación de la otra persona.
- **Idioma:** todo en español (documentos, commits, PR, issues, código y mensajes de la interfaz).

## 4. Revisión del trabajo

- **Regla operativa:** todo lo que se escribe lo revisa el equipo; ningún PR se integra sin que otra persona lo
  verifique contra sus criterios de aceptación; cualquier integrante debe poder explicar cualquier parte.

## 5. Criterio de prioridad del backlog

Primero lo que construye el flujo núcleo de punta a punta, y **CMP-03 antes que lo accesorio**, porque es el
corazón del caso (el problema de los dos voluntarios) y el más riesgoso técnicamente.

## 6. Definición de Listo

Gobierna la entrada de una tarea a «Por hacer». Una tarea está **Lista** cuando cumple todo lo siguiente.

**Base obligatoria**
- [ ] Tiene ID de comportamiento (CMP-0X) y está trazada a su requerimiento del Módulo 1 (RF/RNF).
- [ ] Sus criterios de aceptación están escritos en Gherkin y son verificables (se puede decir sí o no).
- [ ] Incluye al menos un caso de rechazo.
- [ ] Es atómica: una persona la termina en una sesión de trabajo.
- [ ] Tiene responsable asignado en el tablero.
- [ ] No depende de una tarea que no esté terminada o en revisión.

**Criterios propios**
- [ ] Si guarda datos, los campos ya existen en el modelo de datos del plan técnico.
  *Justificación:* evita inventar campos en el código que no están en la especificación.
- [ ] Si tiene pantalla, la acción principal se completa en máximo tres pasos.
  *Justificación:* RNF-03; comerciantes y voluntarios tienen poco tiempo y poca familiaridad tecnológica.

## 7. Definición de Terminado

Gobierna la salida de una tarea a «Terminado». Una tarea está **Terminada** cuando cumple todo lo siguiente.

**Base obligatoria**
- [ ] Integrada en `main`.
- [ ] Entró por un PR aprobado por alguien distinto de quien lo construyó.
- [ ] La aprobación nombra los CA verificados.
- [ ] La tarjeta está en «Terminado» en el tablero.
- [ ] Las pruebas automáticas de sus CA pasan en el check de CI del PR.

**Criterios propios**
- [ ] Funciona en la URL desplegada, no solo en el computador de quien lo hizo.
  *Justificación:* la guía 3B lo exige: «no cuando funciona en la máquina de alguien».
- [ ] Si durante la construcción cambió un CA, `comportamientos.md` ya tiene el cambio con su razón.
  *Justificación:* la especificación es la fuente de verdad; un cambio solo en el código es una desviación.
- [ ] Probado en pantalla de celular (vista de 360 px de ancho).
  *Justificación:* los usuarios reales (voluntarios y comerciantes) usan celular.

## 8. Prueba de las definiciones con CMP-03

Tomemos **CMP-03 · Tomar una donación**.

**¿Está Lista?** Sí, si: tiene ID y viene de RF-03, RF-08 y RNF-05; sus CA-03.1 a CA-03.6 están en Gherkin
(con rechazos: CA-03.2, 03.3, 03.4 y 03.6); está partida en tareas atómicas (T-03.1, T-03.2, T-03.3) con
responsable; los campos que usa (`estado`, `voluntario_id`, `tomada_en`) ya están en el modelo de `donaciones`;
y no depende de nada sin terminar (T-00.1, T-00.2 y T-00.4 ya están en revisión o terminadas). Si falta
cualquiera de esos puntos, no entra a «Por hacer»; no hay nada que discutir.

**¿Está Terminada?** Sí, solo si: su PR está en `main`; lo aprobó Juan David (no quien lo construyó); el
comentario de aprobación nombra CA-03.1, CA-03.2 y CA-03.3; la tarjeta está en «Terminado»; el check
«pruebas» está en verde, incluida la prueba de toma simultánea; funciona en la URL desplegada con dos
voluntarios en dos navegadores; y se vio en pantalla de 360 px. Si falta un solo punto, sigue «En revisión».
