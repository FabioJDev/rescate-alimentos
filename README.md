# Rescate de Alimentos

Equipo: Overflow — Que ninguna idea se desborde sin resolver

Alternativa seleccionada: B – Formulario web adaptado a móvil + base de datos

## Qué hace

Hoy la Fundación Mesa Común coordina el rescate de alimentos por varios grupos de WhatsApp: los mensajes se
pierden, a veces llegan dos voluntarios al mismo sitio y a veces ninguno, y no queda un registro confiable.
Este sistema reemplaza ese desorden por una página web que se usa desde el celular. Un comercio avisa qué
alimento tiene, hasta qué hora sirve y dónde recogerlo; los voluntarios ven las donaciones disponibles y
toman una (si otro ya la tomó, el sistema se lo dice antes de que viaje en vano); al final se registra a
qué organización se entregó. Marcela y su equipo pueden consultar en cualquier momento en qué estado está
cada donación y quién hizo qué.

## Cómo levantarlo

Necesitas Node.js 20 o superior y una base de datos PostgreSQL (local o en Neon).

1. Instalar dependencias: `npm ci`
2. Copiar `.env.example` como `.env` y poner en `DATABASE_URL` la cadena de conexión a tu PostgreSQL.
3. Crear las tablas: `npm run db:migrar`
4. Cargar los datos de demostración: `npm run db:semilla`
   (para borrar todo y volver a cargarlos: `npm run db:semilla -- --reiniciar`)
5. Arrancar: `npm start` y abrir http://localhost:3000
6. Pruebas automáticas: `npm test` (necesitan la base de datos del paso 2)

**Usuarios de demostración** (los PIN son solo para demostración):

| Usuario | Rol | Zona | PIN |
|---|---|---|---|
| Marcela | coordinadora | — | 0000 |
| Ana | voluntario | Norte | 1111 |
| Bruno | voluntario | Norte | 2222 |
| Carlos | voluntario | Sur | 3333 |
| Panadería La Espiga | donante | Norte | 4444 |
| Plaza de Mercado Puesto 12 | donante | Sur | 5555 |

### Dónde verlo

**URL desplegada:** https://rescate-alimentos.onrender.com

Está en Render (plan gratis). Si nadie la visita en unos 15 minutos, Render la «duerme» y la primera visita tarda
(ver [ADR-002](docs/decisiones/ADR-002-hosting-render-neon.md)): ábrela unos minutos antes de usarla.

### Despliegue en Render + Neon

1. **Base de datos:** crear un proyecto PostgreSQL gratis en [Neon](https://neon.tech) y copiar su cadena de conexión.
2. **Aplicación:** en [Render](https://render.com), «New +» → «Blueprint», elegir este repositorio. Render lee `render.yaml`.
3. Cuando Render pida las variables, escribirlas en esa página (nunca en el repositorio ni en un chat):
   - `DATABASE_URL`: la cadena de Neon.
   - `PRIMERA_COORDINADORA_NOMBRE` y `PRIMERA_COORDINADORA_PIN` (4 números): la persona que administrará la página.
   - `SESSION_SECRET` lo genera Render solo.
4. Al arrancar, la aplicación aplica las migraciones y, si no hay ninguna coordinadora activa, crea la primera con esas
   variables. Al entrar por primera vez, la página le pide cambiar el PIN; desde ahí ella crea los demás usuarios,
   zonas y organizaciones (Inicio → Administración).
5. **En producción no se cargan los datos de demostración**: sus PIN están publicados arriba. Si una base ya los tiene
   (por ejemplo, la de la demostración de la 3B), antes de usarla de verdad la coordinadora debe cambiar su PIN y
   desactivar o restablecer el PIN de cada usuario de demostración (ver el [manual de operación](docs/manual-operacion.md)).

### Cómo retomar el proyecto

Para quien reciba el proyecto y quiera seguir construyéndolo.

1. **Lee en este orden** (unos 30 minutos): este README → [constitución](docs/spec/constitucion.md) →
   [especificación](docs/spec/comportamientos.md) → [plan técnico](docs/spec/plan-tecnico.md) → los
   [ADR](docs/decisiones/). La especificación es la fuente de verdad: si algo cambia, se cambia primero ahí, con su razón.
2. **Levántalo en tu computador** con los pasos de arriba y corre `npm test` (las pruebas necesitan un PostgreSQL real).
3. **Ubícate en el código.** Cada petición va de una ruta (`src/rutas/`) a un servicio (`src/servicios/`, donde viven las reglas y
   el SQL) y de ahí a una vista (`src/vistas/`). Hay un archivo de pruebas por comportamiento en `tests/` (`cmp-01.test.js` …
   `cmp-23.test.js`, más `seguridad.test.js`), y el nombre de cada prueba empieza con el ID de su criterio de aceptación
   (por ejemplo, `CA-03.2`). `tests/preparar.js` corre antes de cada archivo: aplica las migraciones, limpia el conteo de
   intentos de ingreso y, **solo en la base de pruebas**, hace que los usuarios nazcan con el aviso de privacidad aceptado.
4. **Trabaja así:** una tarea por rama, un pull request con la plantilla de `.github/`, el check «pruebas» en verde y la
   aprobación de **otra persona** que nombre los criterios que verificó. Los commits van en español con el ID
   (`feat(CMP-03): … [CA-03.2]`). Más detalle en `REGLAS.md` y en la constitución.
5. **Qué sigue:** el [tablero](https://github.com/users/FabioJDev/projects/1). Ya están el modo sin conexión (CMP-08), soltar
   una donación (CMP-06), el reporte (CMP-07) y la administración (CMP-09 a CMP-15: usuarios, PIN, zonas, organizaciones,
   corregir, cancelar e intervenir donaciones, teléfonos) y la seguridad y los requerimientos que faltaban (CMP-16 a
   CMP-23 y T-SEG: límite de intentos, origen de los formularios y cabeceras, errores con código, nombres sin importar
   mayúsculas, aviso de privacidad, organizaciones con usuario, personas atendidas, por vencer con WhatsApp, kilos
   aproximados y foto). Limitaciones conocidas: los recordatorios los envía la coordinadora (no hay envío automático), las
   personas atendidas son atenciones por día y no personas distintas, y el aviso de privacidad es un texto base que la
   fundación debe revisar con apoyo jurídico.
6. **Cuentas que necesitas:** el repositorio en GitHub, un servicio en [Render](https://render.com) y una base de datos en
   [Neon](https://neon.tech). Las variables de entorno son `DATABASE_URL`, `SESSION_SECRET` y, para el primer arranque,
   `PRIMERA_COORDINADORA_NOMBRE` y `PRIMERA_COORDINADORA_PIN` (ver `.env.example`).

**Cosas que sorprenden la primera vez**
- «Vencida» **no se guarda**: se calcula (donación disponible con la hora límite cumplida).
- Tomar, entregar, soltar, corregir, cancelar, liberar y asignar una donación son **una sola actualización atómica
  condicional** en la base de datos (ver [ADR-001](docs/decisiones/ADR-001-toma-atomica.md)). No la separes en «leer y luego escribir»: reaparecería el problema de los
  dos voluntarios. `tests/cmp-03-concurrencia.test.js` lo vigila.
- `npm run db:semilla -- --reiniciar` **borra todos los datos**. Sin esa opción, la semilla se niega a correr si ya hay usuarios.
  Con `NODE_ENV=production` se niega siempre.
- Las horas son de Colombia (UTC-5, sin horario de verano). Los mensajes de error los da el servidor, no el navegador.
- Usuarios, zonas y organizaciones **no se borran nunca**: se desactivan, porque el historial apunta a ellos (ADR-005).
- Si cambias un archivo que el teléfono guarda (lista `ESTATICOS` de `src/publico/sw.js`, como `estilos.css`), sube la
  `VERSION` de `sw.js`; si no, los teléfonos seguirán mostrando la versión vieja.
- El plan gratis de Render «duerme» la aplicación tras unos 15 minutos sin visitas.
- Todo POST que viene de otro sitio se rechaza mirando la cabecera `Origin` (ADR-006). Por eso la cabecera
  `Referrer-Policy` es `same-origin` y **no** `no-referrer`: con `no-referrer` el navegador manda `Origin: null` y se
  rechazarían todos los formularios propios. Las pruebas automáticas no simulan un navegador; prueba los cambios de
  seguridad también en el navegador.
- Los errores inesperados muestran un código de 6 caracteres; búscalo en los Logs de Render para ver el detalle (T-SEG.2).

## Documentación

- [Manual de operación](docs/manual-operacion.md): para la coordinadora, los comercios y los voluntarios (sin términos técnicos).
- [Pantallas del MVP](docs/ux/pantallas.md): cada pantalla con su comportamiento y capturas.
- [Constitución del proyecto](docs/spec/constitucion.md): equipo, convenciones y definiciones de Listo y Terminado.
- [Especificación del MVP](docs/spec/comportamientos.md): comportamientos y criterios de aceptación.
- [Plan técnico](docs/spec/plan-tecnico.md): arquitectura, modelo de datos y despliegue.
- [Decisiones de arquitectura](docs/decisiones/): ADR.
- [Cómo revisar un PR](docs/qa/como-revisar.md) y [plan de pruebas](docs/qa/plan-de-pruebas.md).

## Revisión del trabajo

Todo lo que se escribe lo revisa el equipo. Ningún pull request se integra sin que otra persona lo verifique
contra sus criterios de aceptación, y cualquier integrante debe poder explicar cualquier parte del
proyecto.
