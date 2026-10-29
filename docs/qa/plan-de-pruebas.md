# Plan de pruebas

Cómo se comprueba cada criterio de aceptación (CA) de [`comportamientos.md`](../spec/comportamientos.md): con una prueba
automática (archivo y cantidad de pruebas) y con pasos a mano en la URL desplegada.

Este documento separa con cuidado **qué se ejecutó** y **quién lo verificó**, porque no es lo mismo: las pruebas
automáticas las corre el CI; la verificación independiente a mano la tiene que hacer una persona distinta de quien
escribió el código. **Esa verificación independiente todavía no está registrada** (ver «Verificación independiente»).

## 1. Estrategia

| Tipo | Con qué | Qué cubre |
|---|---|---|
| Automática | Jest + Supertest contra un **PostgreSQL real** (no simulado) | Cada CA, incluidos los rechazos; el bloqueo de la segunda toma con sesiones simultáneas |
| En el CI | GitHub Actions, check **«pruebas»** (obligatorio en `main`) | Corre todo lo anterior en cada pull request |
| A mano | Navegador, en la URL desplegada y en vista de celular (360 px) | Que lo que ve una persona coincide con el CA: textos, orden, que quepa en pantalla |

Convenciones: un archivo por comportamiento (`tests/cmp-0X.test.js`) y el nombre de cada prueba empieza con el ID de su CA
(`CA-03.2 · …`). Para correrlas: `npm run db:migrar` y `npm test` (necesitan `DATABASE_URL` hacia un PostgreSQL).

## 2. Resultado de la ejecución automática

Ejecutada el 28 de octubre de 2026 sobre `main` (todos los PR integrados), en local, por Fabio Jordan:

| | |
|---|---|
| Archivos de prueba | 9 de 9 pasan |
| Pruebas | **107 de 107 pasan**, 0 fallan |
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

**Lo que no se ha hecho:** recorrer los cinco comportamientos en la URL desplegada con los usuarios de demostración, ni probar
en un teléfono real.

## 5. Verificación independiente

La condición de «Terminado» y el criterio de verificación piden que **alguien distinto de quien construyó** compruebe cada CA
y **diga cuáles verificó**. Mientras esa persona no lo registre aquí, la verificación a mano **sigue pendiente**.

Quien verifique completa la tabla (una fila por sesión de verificación):

| Fecha | Quién verificó | CA verificados | Dónde (URL o local) | Usuarios usados | Resultado |
|---|---|---|---|---|---|
| | | | | | |

### Verificado por

| Nombre | Rol | Fecha | Qué verificó |
|---|---|---|---|
| *Pendiente* | QA Engineer | | |

> Quien firme aquí debe haber hecho la verificación. Si algo no se pudo comprobar, se escribe como «no verificado» y por qué.

## 6. Riesgos y lo que este plan no cubre

- **Modo sin conexión** (RNF-01): no existe todavía; no hay pruebas.
- **Carga y rendimiento en red 3G** (RNF-07): no se midió; las páginas son livianas por diseño, pero no hay medición.
- **Seguridad del ingreso:** el PIN de 4 dígitos no tiene límite de intentos ni protección CSRF con tokens (ver ADR-003).
- **Accesibilidad:** no se hizo una auditoría; los estados van escritos y no solo en color.
- **Dispositivos reales:** solo se probó con la vista de celular del navegador.
- **Datos compartidos en las pruebas:** las pruebas crean sus propios datos con una marca única, pero comparten la base de datos de
  desarrollo; en el CI parten de una base vacía.
