# Pantallas del MVP

Artefacto del UX Designer (Fabio Jordan). Lista las pantallas reales del MVP, con el comportamiento (CMP) y los
criterios de aceptación (CA) que cubre cada una. Derivadas de los wireframes del Módulo 1.

Las capturas son de la aplicación funcionando, en vista de celular (360 × 760 px), con los datos de la semilla de
demostración, tomadas el 28 de octubre de 2026. Las pantallas agregadas después (CMP-06 a CMP-25) están al final, en
«Pantallas agregadas después del MVP», con su ruta y sus criterios, todavía sin captura.

## Principios de diseño

Se eligieron por quienes usan el sistema: comerciantes ocupados, voluntarios que revisan el celular por bloques y
personas con poca familiaridad tecnológica (Módulo 1).

- **Pocos pasos (RNF-03).** Desde la pantalla de partida: publicar una donación son 3 pasos (abrir, llenar, enviar);
  tomarla son 2 (pulsar «Tomar», confirmar); registrar su entrega son 3 (pulsar «Registrar entrega», llenar, confirmar).
- **Livianas (RNF-02 y RNF-07).** Las páginas se generan en el servidor con HTML y CSS, para que carguen rápido con datos
  limitados o red 3G. El poco JavaScript que hay (`interaccion.js`, el modo sin conexión de CMP-08 y achicar la foto de
  CMP-23) va en archivos aparte y solo mejora la comodidad: si no carga, todo sigue funcionando. Ninguna vista lleva
  JavaScript en línea (lo bloquea la política de seguridad y lo vigila una prueba, CA-SEG.3).
- **Móvil primero.** Una sola columna, campos y botones grandes (alto mínimo de 48 px) y texto de 17,6 px.
- **Errores claros y junto al campo.** El mensaje dice qué falta y la pantalla conserva lo ya escrito (CA-01.2, CA-04.3).
- **El estado no depende solo del color.** Siempre va escrito («Disponible», «Asignada», «Entregada», «Vencida (no
  recogida)»); el color solo refuerza.
- **Confirmar antes de tomar.** En el MVP un voluntario no podía soltar una donación (decisión de alcance de CMP-03),
  por eso «Tomar» pide una confirmación. Desde la 3C puede soltarla (CMP-06), también con confirmación.
- **La urgencia se ve en rojo.** Lo que vence en una hora o menos se marca en rojo con «Vence pronto» (CA-21.5), igual
  en las listas del voluntario y de la organización.
- **Todo en español**, con las palabras del caso (donación, recogida, comercio).

## Mapa de navegación por rol

| Rol | Pantallas a las que llega desde el inicio |
|---|---|
| Sin cuenta | Ingresar · Solicitar acceso (CMP-24) · Aviso de privacidad |
| Donante (comercio) | Publicar donación · Mis donaciones · Buscar donación |
| Voluntario | Donaciones disponibles (con «Ver zona») → Tomar → Mis recogidas → Registrar entrega o soltar · Buscar donación |
| Organización receptora | Donaciones para recibir → Pedir · Vienen para nosotros · Recibidas · Personas atendidas |
| Coordinadora | Por vencer y tomadas sin entrega · Registrar donación de un comercio · Todas las donaciones · Reporte del periodo · Personas atendidas · Buscar donación |
| Coordinadora (Administración) | Usuarios · Organizaciones · Zonas · Solicitudes de acceso · Registro de cambios |

Todas las pantallas del detalle de una donación están a un enlace de distancia («Ver estado e historial»).

## Pantallas

### Ingreso (todos los roles)
Entrada con nombre y PIN de 4 números ([ADR-003](../decisiones/ADR-003-identificacion-nombre-pin.md)). El mensaje de
error es el mismo si falla el nombre o el PIN.

| | |
|---|---|
| Ruta | `/ingreso` |
| CMP / CA | Habilitador (RNF-03, RNF-04); sin CA propio |

<img src="capturas/01-ingreso.jpg" width="260" alt="Pantalla de ingreso con nombre y PIN">
<img src="capturas/02-ingreso-error.jpg" width="260" alt="Ingreso con el mensaje «El nombre o el PIN no son correctos»">

### Inicio (según el rol)
Muestra solo lo que el rol puede hacer. Ejemplos: el donante y el voluntario.

| | |
|---|---|
| Ruta | `/` |
| CMP / CA | Acceso por rol (RNF-04) |

<img src="capturas/03-inicio-donante.jpg" width="260" alt="Inicio del donante">
<img src="capturas/08-inicio-voluntario.jpg" width="260" alt="Inicio del voluntario">
<img src="capturas/17-inicio-coordinadora.jpg" width="260" alt="Inicio de la coordinadora">

### Publicar donación (donante)
Una sola pantalla con los 4 datos obligatorios (la unidad va con la cantidad). El punto de recogida viene con la
dirección del comercio y se puede cambiar.

| | |
|---|---|
| Ruta | `/donaciones/nueva` |
| CMP / CA | CMP-01 · CA-01.1, CA-01.6 |

<img src="capturas/04-publicar-donacion.jpg" width="260" alt="Formulario de publicar donación">

### Publicar donación con errores (donante)
Si falta un dato, la hora límite ya pasó o la cantidad no sirve, no se registra nada: cada mensaje queda bajo su campo
y se conserva lo escrito.

| | |
|---|---|
| Ruta | `/donaciones` (al enviar con errores) |
| CMP / CA | CMP-01 · CA-01.2, CA-01.3, CA-01.4 |

<img src="capturas/05-publicar-donacion-errores.jpg" width="260" alt="Formulario con tres mensajes de error">

### Donación registrada (donante)
Confirma y muestra el código (por ejemplo D-0005) con el estado «disponible».

| | |
|---|---|
| Ruta | `/donaciones/:codigo/registrada` |
| CMP / CA | CMP-01 · CA-01.1 |

<img src="capturas/06-donacion-registrada.jpg" width="260" alt="Confirmación con el código de la donación">

### Registrar donación de un comercio (coordinadora)
El mismo formulario, con un selector «Comercio que avisó la donación». Sirve para los comercios con teléfono básico
que avisan por llamada. La donación queda a nombre del comercio y con la coordinadora como «registrada por».

| | |
|---|---|
| Ruta | `/donaciones/nueva` (con el rol coordinadora) |
| CMP / CA | CMP-01 · CA-01.5 |

<img src="capturas/19-registrar-por-comercio.jpg" width="260" alt="Formulario de la coordinadora con selector de comercio">

### Mis donaciones (donante)
Cada donación con su estado, para que el comercio sepa que alguien va por ella.

| | |
|---|---|
| Ruta | `/mis-donaciones` |
| CMP / CA | CMP-05 · CA-05.6 |

<img src="capturas/07-mis-donaciones.jpg" width="260" alt="Lista de mis donaciones con sus estados">

### Donaciones disponibles (voluntario)
Solo las vigentes, de la más urgente a la menos urgente, con el tiempo que queda. Por defecto muestra la zona del
voluntario y permite pasar a «Todas las zonas».

| | |
|---|---|
| Ruta | `/disponibles` |
| CMP / CA | CMP-02 · CA-02.1, CA-02.2, CA-02.3, CA-02.5 |

<img src="capturas/09-donaciones-disponibles.jpg" width="260" alt="Lista de donaciones disponibles">

### Confirmar toma (voluntario)
Resume la donación y pide confirmar antes de tomarla.

| | |
|---|---|
| Ruta | `/donaciones/:codigo/tomar` |
| CMP / CA | CMP-03 · CA-03.1 |

<img src="capturas/10-confirmar-toma.jpg" width="260" alt="Pantalla para confirmar la toma de una donación">

### Donación tomada (voluntario)
Muestra el punto de recogida y la hora límite. Si quien vuelve a pulsar «Tomar» ya la había tomado, esta misma pantalla
dice «Ya tomaste esta donación» (CA-03.5).

| | |
|---|---|
| Ruta | `/donaciones/:codigo/tomada` |
| CMP / CA | CMP-03 · CA-03.1, CA-03.5 |

<img src="capturas/11-toma-exitosa.jpg" width="260" alt="Donación tomada con el punto de recogida">

### No se pudo tomar (voluntario)
Para quien llega tarde: dice quién la tomó y a qué hora, y que no vaya al punto de recogida. También cubre la hora
límite vencida (CA-03.4).

| | |
|---|---|
| Ruta | `/donaciones/:codigo/tomar` (cuando ya no está disponible) |
| CMP / CA | CMP-03 · CA-03.2, CA-03.3, CA-03.4 |

<img src="capturas/12-toma-rechazada.jpg" width="260" alt="Aviso de que la donación ya fue tomada por otro voluntario">

### Mis recogidas (voluntario)
Las donaciones que el voluntario tomó y todavía no entregó, con el botón «Registrar entrega».

| | |
|---|---|
| Ruta | `/mis-recogidas` |
| CMP / CA | CMP-03 · CA-03.1 |

<img src="capturas/13-mis-recogidas.jpg" width="260" alt="Lista de mis recogidas con el botón Registrar entrega">

### Registrar entrega (voluntario)
Se elige la organización que recibe y se escribe el nombre de quien recibe. La fecha y la hora las pone el servidor.

| | |
|---|---|
| Ruta | `/donaciones/:codigo/entregar` |
| CMP / CA | CMP-04 · CA-04.1, CA-04.2, CA-04.3, CA-04.4, CA-04.5, CA-04.6 |

<img src="capturas/14-registrar-entrega.jpg" width="260" alt="Formulario para registrar la entrega">

### Detalle de una donación (todos los roles)
Estado actual, datos de la donación e historial en orden: quién la registró, quién la tomó y a quién se entregó.
Una donación disponible con la hora límite cumplida aparece como «Vencida (no recogida)».

| | |
|---|---|
| Ruta | `/donaciones/:codigo` |
| CMP / CA | CMP-05 · CA-05.1, CA-05.2, CA-05.3 · CMP-02 · CA-02.4 |

<img src="capturas/15-detalle-donacion.jpg" width="260" alt="Detalle de una donación entregada con su historial">

### Buscar donación (todos los roles)
Búsqueda por código. Entiende `D-0012`, `d-12` y `12`. Si el código no existe, lo dice.

| | |
|---|---|
| Ruta | `/buscar` |
| CMP / CA | CMP-05 · CA-05.1, CA-05.4 |

<img src="capturas/16-buscar-donacion.jpg" width="260" alt="Pantalla de búsqueda por código">

### Todas las donaciones (coordinadora)
Todas las donaciones, de la más reciente a la más antigua, con filtro por estado (disponibles, asignadas, entregadas
y vencidas).

| | |
|---|---|
| Ruta | `/todas` |
| CMP / CA | CMP-05 · CA-05.5 |

<img src="capturas/18-todas-las-donaciones.jpg" width="260" alt="Lista de todas las donaciones con filtro por estado">

## Pantallas agregadas después del MVP

Todavía sin captura. Todas siguen los mismos principios de arriba.

| Pantalla | Rol | Ruta | CMP / CA |
|---|---|---|---|
| Soltar una donación (confirmar) | Voluntario | `/donaciones/:codigo/soltar` | CMP-06 |
| Reporte del periodo y CSV | Coordinadora | `/reporte`, `/reporte.csv` | CMP-07 · CSV con punto y coma para Excel en español (CA-07.7) |
| Sin conexión | Todos | `/sin-conexion` | CMP-08 · CA-08.6 |
| Zonas, Usuarios, Organizaciones | Coordinadora | `/zonas`, `/usuarios`, `/organizaciones` | CMP-09, CMP-10, CMP-12 |
| Cambiar mi PIN · Restablecer PIN | Todos · Coordinadora | `/mi-pin`, `/usuarios/:id/restablecer-pin` | CMP-11 |
| Corregir o cancelar una donación | Donante · Coordinadora | `/donaciones/:codigo/corregir`, `…/cancelar` | CMP-13 |
| Liberar, asignar o entregar en nombre de otro | Coordinadora | desde el detalle de la donación | CMP-14 |
| Aviso de privacidad | Todos | `/privacidad` | CMP-18 |
| Donaciones para recibir · Vienen para nosotros · Recibidas | Organización | `/para-recibir`, `/vienen`, `/recibidas` | CMP-19 |
| Personas atendidas | Organización · Coordinadora | `/personas-atendidas` | CMP-20 |
| Por vencer y tomadas sin entrega · Avisar por WhatsApp | Coordinadora | `/por-vencer`, `/donaciones/:codigo/avisar` | CMP-21 · CA-21.8 y CA-21.9 |
| Foto de la donación | Todos con sesión | desde el detalle | CMP-23 |
| Solicitar acceso · Solicitud enviada | Sin cuenta | `/solicitar-acceso` | CMP-24 · CA-24.1 a CA-24.6 y CA-24.12 |
| Solicitudes de acceso (pendientes y resueltas) · Rechazar | Coordinadora | `/solicitudes` | CMP-24 · CA-24.7 a CA-24.13 |
| Registro de cambios | Coordinadora | `/registro-cambios` | CMP-25 |

Cambios en pantallas que ya estaban: «Donaciones disponibles» tiene el selector «Ver zona» (CA-02.6) y la pastilla del
tiempo restante en rojo cuando vence pronto (CA-21.5); «Todas las donaciones» va por páginas de 50 (CA-05.7).

## Relación con los wireframes del Módulo 1

| Wireframe del Módulo 1 | En el MVP | Después |
|---|---|---|
| 1. Publicar donación (Donante) | Construida: «Publicar donación» | Con peso aproximado y foto opcionales (CMP-22 y CMP-23) |
| 2. Donaciones cercanas (Organización receptora) | No se construyó: las organizaciones eran datos y no iniciaban sesión | Construida en CMP-19: «Donaciones para recibir», filtrada por refrigeración |
| 3. Mis recogidas de hoy (Voluntario) | Construida: «Mis recogidas». Muestra todas las pendientes, no solo las de hoy. | Con «soltar» (CMP-06) y el tiempo restante en rojo |
| 4. Reporte del periodo (Fundación) | Fuera del alcance del MVP (RF-07) | Construido en CMP-07, con kilos aproximados (CMP-22) y personas atendidas (CMP-20) |

## Limitaciones conocidas

- **Tema oscuro.** Corregido en el PR #52: los estilos fijan fondo claro y texto oscuro aunque el teléfono esté en tema
  oscuro.
- **Páginas que no existen.** Una dirección mal escrita muestra la página por defecto del servidor, en inglés («Cannot
  GET …»). Falta una página propia en español.
- **Hora límite.** Usa el selector de fecha y hora del propio navegador. No se probó en teléfonos reales, solo en la vista
  de celular del navegador.
- **Capturas.** Salen del entorno local con datos de demostración, no de la URL desplegada.
