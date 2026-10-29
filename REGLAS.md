# Reglas permanentes del proyecto
Proyecto: Rescate de Alimentos · Fundación Mesa Común · Equipo Overflow (Proyecto Informático 2, UAO).

**Idioma.** El usuario no sabe inglés. Todo va en español: documentos, commits, pull requests, issues,
comentarios del código, nombres de variables y funciones, mensajes de la interfaz y de error. Cuando el
usuario tenga que hacer algo en una página en inglés (GitHub, Render, Neon), dile qué botón pulsar con su
texto en inglés y qué significa.

## 1. Flujo de trabajo
- **La especificación es la fuente de verdad.** Si algo cambia, se cambia primero
  `docs/spec/comportamientos.md` (con la razón) y después el código. Nunca al revés.
- **Una tarea a la vez**, cada una en su rama, cada una con su pull request.
- **Nunca hagas push directo a `main`.** Nunca hagas merge sin la aprobación del compañero.
- **Nunca apruebes PRs** ni escribas comentarios de aprobación en nombre de nadie.
- Antes de abrir un PR: las pruebas pasan localmente y el código hace lo que dicen sus CA.
- Si un PR está esperando aprobación, puedes seguir con la siguiente tarea en una rama creada **a partir
  de la rama anterior** (PR apilado). En la descripción escribe «Depende de #N». Cuando el anterior se
  integre, cambia la base del PR a `main`.
- No uses secretos en el código. Las credenciales van en `.env` (que está en `.gitignore`);
  en el repositorio solo va `.env.example` con nombres de variables y valores falsos.
- El código tiene que ser **simple y explicable** por estudiantes: nada de abstracciones innecesarias,
  comentarios en español que expliquen el porqué de las partes importantes.

## 2. Convenciones
- **Ramas:** `feat/CMP-03-tomar-donacion`, `docs/constitucion`, `infra/ci`, `test/CMP-03-concurrencia`.
- **Commits** (Conventional Commits, en español, con ID):
  `feat(CMP-03): bloquear la segunda toma [CA-03.2]`, `docs(spec): agregar CMP-04`,
  `test(CMP-03): prueba de toma simultánea [CA-03.2]`, `ci: agregar pruebas en cada PR`.
- **Título del PR:** `[CMP-03] Tomar una donación con bloqueo de segunda toma`.
- **Cuerpo del PR:** usa la plantilla `.github/pull_request_template.md`. Incluye `Closes #<issue>` (en inglés: es la única palabra que GitHub entiende para cerrar el issue)
  para enlazar la tarjeta.
- **Pruebas:** un archivo por comportamiento (`tests/cmp-03.test.js`) y cada caso de prueba empieza
  con su ID: `test('CA-03.2 · dos voluntarios toman al mismo tiempo: solo uno queda asignado', ...)`.
- **IDs estables:** CMP-01…CMP-05 y CA-0X.Y nunca se renumeran. Si un CA se elimina, se marca
  «(retirado)» con su razón; no se reutiliza el número.

## 3. Roles
Dos integrantes cubren los cinco roles:
- **Integrante que construye (Fabio Jordan):** Product Owner, UX Designer, DevOps Engineer, Developer.
  Artefactos: backlog priorizado, pantallas, CI y despliegue, incremento.
- **Compañero (Juan David Morales):** QA Engineer y revisor (Developer de apoyo). Artefactos: revisión y
  aprobación de cada PR nombrando los CA verificados, verificación manual en la URL desplegada, y su firma
  en `docs/qa/plan-de-pruebas.md`.

## 4. Revisión del trabajo
- Regla operativa: todo lo que se escribe lo revisa el equipo; ningún PR se integra sin que otra persona lo
  verifique contra sus CA; cualquier integrante debe poder explicarlo.
