# Plan de pruebas

Cómo se comprueba cada criterio de aceptación (CA) de [`comportamientos.md`](../spec/comportamientos.md): con una prueba
automática (archivo y cantidad de pruebas) y con pasos a mano en la URL desplegada.

Este documento separa con cuidado **qué se ejecutó** y **quién lo verificó**, porque no es lo mismo: las pruebas
automáticas las corre el CI; la verificación independiente a mano la tiene que hacer una persona distinta de quien
escribió el código. La verificación independiente se hizo el 29 de octubre de 2026 y está en la sección 5, con lo que sí se probó y lo que no.

## 1. Estrategia

| Tipo | Con qué | Qué cubre |
|---|---|---|
| Automática | Jest + Supertest contra un **PostgreSQL real** (no simulado) | Cada CA, incluidos los rechazos; el bloqueo de la segunda toma con sesiones simultáneas |
| En el CI | GitHub Actions, check **«pruebas»** (obligatorio en `main`) | Corre todo lo anterior en cada pull request |
| A mano | Navegador, en la URL desplegada y en vista de celular (360 px) | Que lo que ve una persona coincide con el CA: textos, orden, que quepa en pantalla |

Convenciones: un archivo por comportamiento (`tests/cmp-0X.test.js`) y el nombre de cada prueba empieza con el ID de su CA
(`CA-03.2 · …`). Para correrlas: `npm run db:migrar` y `npm test` (necesitan `DATABASE_URL` hacia un PostgreSQL).

## 2. Resultado de la ejecución automática

Ejecutada el 29 de octubre de 2026 sobre `main` (commit 4b2e7eb, ya con CMP-06 a CMP-08), en local. Antes, el 28 de
octubre, se había corrido con los CMP-01 a CMP-05 (9 archivos y 107 pruebas). En esta computadora (Node 25) Jest solo arranca con
`NODE_OPTIONS=--no-experimental-webstorage`; sin esa opción las 12 suites fallan antes de empezar.

| | |
|---|---|
| Archivos de prueba | 12 de 12 pasan |
| Pruebas | **134 de 134 pasan**, 0 fallan |
| CI en `main` | check «pruebas» en verde en el último commit |

## 3. Cobertura por criterio

«Auto» es la cantidad de pruebas automáticas cuyo nombre lleva ese CA; todas pasan. Los pasos a mano usan los usuarios de
demostración (Panadería La Espiga `4444`, Ana `1111`, Bruno `2222`, Marcela `0000`).

### CMP-01 · Registrar una donación (`tests/cmp-01.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-01.1 | 3 | Panadería → Publicar donación → llenar los 4 datos con hora límite futura → se ve el código y el estado «disponible» |
| CA-01.2 | 6 | Dejar un campo vacío (por ejemplo el tipo) y publicar: no se registra, dice cuál falta y conserva lo escrito |
| CA-01.3 | 2 | Hora límite de ayer: «La hora límite debe ser posterior a la hora actual» |
| CA-01.4 | 5 | Cantidad `0`, `-3`, `muchas` y vacía: cada una con su mensaje; `5,5` se acepta |
| CA-01.5 | 9 | Marcela → Registrar donación de un comercio → elegir comercio → en el historial dice «Registrada por Marcela» y el comercio la ve en «Mis donaciones» |
| CA-01.6 | 1 | Que todo esté en una sola pantalla con 4 campos obligatorios |

### CMP-02 · Hacerla visible (`tests/cmp-02.test.js`, CA-02.4 en `tests/cmp-05.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-02.1 | 2 | Ana → Donaciones disponibles: solo vigentes, la más urgente primero, con tiempo restante |
| CA-02.2 | 1 | Tomar una donación y comprobar que ya no aparece en la lista |
| CA-02.3 | 2 | Por defecto la zona de Ana; «Ver todas las zonas» muestra también las del Sur |
| CA-02.4 | 1 | Abrir el detalle de una donación vencida: «Vencida (no recogida)» |
| CA-02.5 | 1 | Voluntario cuya zona no tiene donaciones: «No hay donaciones disponibles en este momento» |

### CMP-03 · Tomar una donación (`tests/cmp-03.test.js` y `tests/cmp-03-concurrencia.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-03.1 | 4 | Ana → Tomar → «Sí, tomar esta donación»: se ve el punto de recogida y aparece en «Mis recogidas» |
| CA-03.2 | 4 | **Dos navegadores**: Ana y Bruno abren «tomar» sobre la misma donación y confirman a la vez; uno gana y el otro ve quién la tomó. La prueba automática incluye 10 rondas de dos sesiones y 15 tomas simultáneas |
| CA-03.3 | 1 | Bruno con la lista abierta; Ana toma; Bruno pulsa «Tomar»: ve el mismo aviso |
| CA-03.4 | 1 | Abrir «tomar» de una donación vencida: «La hora límite de esta donación ya pasó; no se puede tomar» |
| CA-03.5 | 1 | Ana vuelve a abrir «tomar» de su propia donación: «Ya tomaste esta donación», sin duplicar |
| CA-03.6 | 3 | Entrar como la panadería o como Marcela e intentar tomar: «No tienes permiso» |

### CMP-04 · Registrar la entrega (`tests/cmp-04.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-04.1 | 3 | Ana → Mis recogidas → Registrar entrega → Comedor Esperanza, «Doña Marta»: queda «entregada» |
| CA-04.2 | 1 | El formulario no tiene campo de fecha; el historial muestra la hora real |
| CA-04.3 | 4 | Confirmar el formulario vacío: «Falta elegir la organización que recibe.» y «Falta el nombre de quien recibe.» |
| CA-04.4 | 1 | Bruno intenta abrir «entregar» de una donación de Ana: se rechaza |
| CA-04.5 | 3 | Abrir «entregar» de una ya entregada: «Esta donación ya fue entregada el … a …»; de una disponible: se rechaza |
| CA-04.6 | 1 | Difícil de provocar a mano; se apoya en la prueba automática (donación con hora límite pasada) |

### CMP-05 · Consultar el estado (`tests/cmp-05.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-05.1 | 5 | Buscar por `D-0012`, `d-12` y `12`; abrir el detalle con distintos roles |
| CA-05.2 | 2 | Detalle de una entregada: historial en orden (registrada, tomada, entregada con organización y quien recibió) |
| CA-05.3 | 2 | Una disponible con la hora límite cumplida figura como «Vencida (no recogida)» |
| CA-05.4 | 2 | Buscar `D-9999`: «No existe una donación con ese código» |
| CA-05.5 | 8 | Marcela → Todas las donaciones → filtros Disponibles, Asignadas, Entregadas y Vencidas |
| CA-05.6 | 5 | Panadería → Mis donaciones: solo las suyas, con su estado |

### CMP-06 · Soltar una donación tomada (`tests/cmp-06.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-06.1 | 1 | Ana toma una donación → Mis recogidas → «No puedo recogerla: soltar» → «Sí, soltar esta donación»: vuelve a «Disponible», sale de sus recogidas y reaparece en la lista de Bruno |
| CA-06.2 | 1 | Bruno abre «soltar» de una donación de Ana: se rechaza («Solo quien la tomó puede soltarla») y no cambia nada |
| CA-06.3 | 1 | Abrir «soltar» de una disponible: «Esta donación no está asignada a nadie»; de una entregada: «ya fue entregada el … a …; no se puede soltar» |
| CA-06.4 | 1 | Repetir «soltar» después de soltarla: sale el mismo mensaje y el historial tiene un solo «Soltada por» |
| CA-06.5 | 1 | Tomar una donación con hora límite cercana, esperar a que pase y soltarla: queda «Vencida (no recogida)» y no vuelve a la lista |
| CA-06.6 | 1 | Detalle de la soltada: el historial dice «Soltada por Ana»; Bruno puede tomarla |
| CA-06.7 | 1 | Difícil de provocar a mano; se apoya en la prueba automática |
| CA-06.8 | 1 | La panadería o Marcela abren «soltar»: «No tienes permiso» |

### CMP-07 · Reporte del periodo (`tests/cmp-07.test.js`)

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-07.1 | 1 | Marcela → Reporte del periodo: cuántas donaciones se registraron y cuántas hay en cada estado |
| CA-07.2 | 1 | La cantidad rescatada sale separada por unidad (por ejemplo kg y unidades), sin sumarlas |
| CA-07.3 | 1 | Entregas por organización y donaciones por tipo de alimento |
| CA-07.4 | 1 | Poner «hasta» antes que «desde», o una fecha inválida: mensaje claro y sin datos |
| CA-07.5 | 1 | Un periodo sin donaciones (por ejemplo enero de 2026): «No hay donaciones en este periodo» |
| CA-07.6 | 1 | Ana o la panadería abren `/reporte` o `/reporte.csv`: «No tienes permiso» |
| CA-07.7 | 1 | «Descargar CSV»: una fila por donación y las tildes bien; abrirlo en Excel |

### CMP-08 · Registrar una donación sin conexión (`tests/cmp-08.test.js`)

Para quitar la señal en Chrome: herramientas de desarrollo (F12) → pestaña Network → «Offline». Antes hay que abrir «Publicar donación» con conexión.

| CA | Auto | Pasos a mano en la URL |
|---|---|---|
| CA-08.1 | 2 | Sin conexión, llenar el formulario y publicar: «Guardada en tu teléfono. Se enviará cuando haya señal.»; al recargar, «Publicar donación» sigue abriendo |
| CA-08.2 | 2 | Volver la conexión: «Se envió la donación que tenías guardada. Su código es D-…»; queda «disponible» a nombre de quien la escribió |
| CA-08.3 | 2 | La misma pendiente en dos pestañas: se registra una sola vez |
| CA-08.4 | 2 | Guardar con una hora límite que venza antes de reconectar: al volver la señal sale el rechazo con el motivo y el botón «Descartar» |
| CA-08.5 | 2 | Quitar la sesión antes de reconectar: la pendiente se queda guardada; otra persona que ingrese en ese teléfono no la ve ni se registra a su nombre |
| CA-08.6 | 1 | Sin conexión, abrir otra pantalla (por ejemplo `/`): «Sin conexión» |
| CA-08.7 | 1 | Ana (voluntaria) intenta sincronizar: 403 |

### Otras pruebas (no ligadas a un CA)

| Archivo | Qué comprueba |
|---|---|
| `tests/salud.test.js` | La ruta `/salud` responde (la usa Render) |
| `tests/base-de-datos.test.js` | Las tablas y las restricciones del modelo de datos (por ejemplo, que la base rechace una cantidad cero) |
| `tests/autenticacion.test.js` | Ingreso con nombre y PIN, sesión, salida y control por rol |

## 4. Lo que se comprobó a mano hasta ahora (no es verificación independiente)

El 28 de octubre de 2026 el autor del código (Fabio Jordan) recorrió **en local, con datos de la semilla y en
vista de celular de 360 px**: publicar con y sin errores, la lista de disponibles, confirmar la toma, el aviso a quien llega tarde,
«Mis recogidas», registrar la entrega con y sin datos, el detalle con historial, la búsqueda y «Todas las donaciones».
La evidencia son las [capturas de pantalla](../ux/capturas/) de `docs/ux/pantallas.md`.

En la **URL desplegada** se comprobó que responde, que las rutas protegidas mandan a ingresar y que un ingreso con un usuario
inexistente se rechaza (lo que confirma que la base de datos contesta). Fabio ingresó como Marcela y vio su pantalla de inicio.

Recorrer los comportamientos en la URL desplegada con los usuarios de demostración se hizo después, el 29 de octubre, y está en
la sección 5 (CMP-01 a CMP-08). Lo que sigue sin hacerse es probar en un teléfono real.

## 5. Verificación independiente

La condición de «Terminado» y el criterio de verificación piden que **alguien distinto de quien construyó** compruebe cada CA
y **diga cuáles verificó**. Esa verificación ya está registrada abajo, con fecha del 29 de octubre de 2026.

Quien verifique completa la tabla (una fila por sesión de verificación):

| Fecha | Quién verificó | CA verificados | Dónde (URL o local) | Usuarios usados | Resultado |
|---|---|---|---|---|---|
| 29/10/2026 | Juan David Morales (QA). Las pruebas las corrió Claude Code con Playwright y Juan David revisó los resultados | CMP-01 a CMP-08, 51 CA: 46 completos, 3 parciales (CA-03.2, CA-06.4, CA-07.7) y 2 no verificados (CA-02.5, CA-06.7) | URL desplegada: https://rescate-alimentos.onrender.com | Panadería La Espiga (4444), Ana (1111), Bruno (2222), Marcela (0000) | Ningún criterio falló. CMP-08 se verificó solo en Chromium automatizado |

### Verificado por

| Nombre | Rol | Fecha | Qué verificó |
|---|---|---|---|
| Juan David Morales | QA Engineer | 29 de octubre de 2026 | CMP-01 a CMP-08 en la URL desplegada: 46 CA completos, 3 parciales y 2 no verificados. Ninguno falló. Las pruebas las corrió Claude Code con Playwright y yo revisé los resultados |

> Quien firme aquí debe haber hecho la verificación. Si algo no se pudo comprobar, se escribe como «no verificado» y por qué.

#### Cómo se verificó

Las pruebas las corrió Claude Code con Playwright (Chromium automatizado) contra la URL desplegada. Yo las supervisé y revisé los
resultados; no las hice a mano. Se usaron contextos de navegador separados para simular a dos personas a la vez, y vista de celular
de 360 px (emulada). Las donaciones D-0004 a D-0016 de la base de demostración salen de estas pruebas. Las capturas y las notas
están en mi computador, fuera del repositorio.

#### Resultado por comportamiento

| Comportamiento | Resultado | Qué se vio |
|---|---|---|
| CMP-01 | CA-01.1 a CA-01.6 completos | Publicación correcta (D-0004); mensajes de campo vacío, hora de ayer y cantidad 0, -3, «muchas» y vacía; `5,5` aceptada; Marcela registra a nombre de un comercio (D-0011) |
| CMP-02 | CA-02.1 a CA-02.4 completos; CA-02.5 no verificado | Orden por urgencia con tiempo restante; «Ver todas las zonas» muestra la donación de la zona Sur (D-0012) que la zona propia no muestra |
| CMP-03 | CA-03.1 y CA-03.3 a CA-03.6 completos; CA-03.2 parcial | Ana y Bruno pulsaron «Sí, tomar» sobre D-0008 al mismo tiempo: ganó Bruno y Ana vio quién la tomó (una sola ronda) |
| CMP-04 | CA-04.1 a CA-04.6 completos | Formulario vacío y entrega a Comedor Esperanza, «Doña Marta»; entrega aceptada con la hora límite ya pasada (D-0015) |
| CMP-05 | CA-05.1 a CA-05.6 completos | Búsqueda `D-0012`, `d-12`, `12` y `D-9999`; filtros de Marcela; «Mis donaciones» de la panadería |
| CMP-06 | CA-06.1 a CA-06.3, CA-06.5, CA-06.6 y CA-06.8 completos; CA-06.4 parcial; CA-06.7 no verificado | Ana toma, suelta y confirma; vuelve a «Disponible»; el historial dice «Soltada por Ana»; Bruno la toma |
| CMP-07 | CA-07.1 a CA-07.6 completos; CA-07.7 parcial | Cifras por estado, cantidad por unidad (5,5 kg y 15 unidades), error con «hasta» anterior a «desde», CSV con las tildes bien al leerlo como archivo |
| CMP-08 | CA-08.1 a CA-08.7 completos, verificado solo en Chromium automatizado | Publicar sin conexión, mensaje «Sin conexión», envío al volver la señal, rechazo con «Descartar» |

#### Lo que quedó parcial o sin probar

- CA-02.5 (lista vacía): no verificado. Para verlo había que dejar sin donaciones disponibles a la zona de un voluntario y no se hizo.
- CA-06.7 (soltar y otra acción al mismo tiempo): no verificado. No se puede provocar a mano; solo lo cubre la prueba automática.
- CA-03.2: parcial. Se hizo una sola ronda y los clics de un navegador automático no son exactamente simultáneos. Pesan más las 10 rondas de la prueba automática.
- CA-06.4: parcial. Se probó repetir «soltar» después de soltar (mismo mensaje, un solo «Soltada por»), no un doble clic al mismo tiempo.
- CA-07.7: parcial. El CSV se revisó como archivo (UTF-8 con BOM, tildes bien), pero no se abrió en Excel.
- CMP-08 solo se probó en Chromium automatizado, no en Chrome real ni en un teléfono real.
- No se revisó a fondo que cada pantalla quepa en 360 px (hay capturas, pero no se analizaron) y no se probó en un teléfono real.
- CA-04.2: se vio que el formulario no tiene campo de fecha y que el historial muestra la hora real, pero no se intentó mandar una fecha por fuera del formulario.

## 6. Riesgos y lo que este plan no cubre

- **Modo sin conexión** (RNF-01): existe desde CMP-08 y tiene 12 pruebas automáticas. En la URL solo se probó en Chromium
  automatizado, no en Chrome real ni en un teléfono real.
- **Carga y rendimiento en red 3G** (RNF-07): no se midió; las páginas son livianas por diseño, pero no hay medición.
- **Seguridad del ingreso:** el PIN de 4 dígitos no tiene límite de intentos ni protección CSRF con tokens (ver ADR-003).
- **Accesibilidad:** no se hizo una auditoría; los estados van escritos y no solo en color.
- **Dispositivos reales:** solo se probó con la vista de celular del navegador.
- **Datos compartidos en las pruebas:** las pruebas crean sus propios datos con una marca única, pero comparten la base de datos de
  desarrollo; en el CI parten de una base vacía.
