# Especificación del MVP

Equipo Overflow · Caso: Red de Rescate de Alimentos · Fundación Mesa Común.

Esta especificación es la fuente de verdad. Si algo cambia, se cambia primero aquí (con su razón) y después
el código. Los IDs (CMP-0X y CA-0X.Y) son estables: nunca se renumeran. Se escribe en presente.

## Estados de una donación

```
disponible ──(un voluntario la toma)──► asignada ──(se registra la entrega)──► entregada
     │
     └──(llega la hora límite sin que nadie la tome)──► vencida

asignada ──(el voluntario que la tomó la suelta, CMP-06, o la coordinadora la libera, CMP-14)──► disponible

disponible / asignada ──(el donante o la coordinadora la cancela, CMP-13)──► cancelada
```

«Cancelada» se agregó con la administración (CMP-13): el comercio ya no tiene el alimento o se registró por
error. Es definitiva y no se suma en el reporte.

Relación con RF-08: «publicada» = disponible; «no recogida» = vencida. En el MVP la «recogida» no es un paso
aparte: va de asignada a entregada en una sola acción, para cumplir el máximo de tres pasos (RNF-03).
«Vencida» se calcula al consultar (disponible + hora límite cumplida); no requiere que nadie la marque.

## Datos que se piden (4 campos, por la reflexión del Módulo 1)

- **Tipo de alimento:** lista cerrada (Frutas y verduras, Panadería, Lácteos, Cárnicos, Comida preparada,
  Granos y secos, Otro).
- **Cantidad aproximada:** número + unidad (kg, unidades, cajas, bultos). Es declarada, no verificada: nadie
  pesa el alimento y solo un comercio tiene báscula (restricción del Módulo 2).
- **Punto de recogida:** por defecto la dirección del comercio, editable. La zona sale del comercio.
- **Hora límite:** fecha y hora (zona horaria America/Bogota).

## Actores

Donante (comercio), Voluntario y Coordinadora (Marcela y su equipo). Las organizaciones receptoras son datos
(destino de la entrega); no inician sesión en el MVP.

---

## CMP-01 · Registrar una donación

**Origen:** RF-01, RNF-03 · Épica 1 (Gestión de donaciones)

- **CA-01.1** Dado un donante con sesión iniciada, cuando completa tipo de alimento, cantidad con unidad,
  punto de recogida y hora límite y envía, entonces la donación queda registrada en estado «disponible» con
  su fecha y hora de registro y su autor, y el donante ve el código de la donación (ej. D-0012).
- **CA-01.2** Dado el formulario con un campo obligatorio vacío, cuando el donante envía, entonces no se
  registra nada, se indica qué campo falta y se conservan los datos ya escritos.
- **CA-01.3** Dada una hora límite igual o anterior a la hora actual, cuando el donante envía, entonces se
  rechaza con el mensaje «La hora límite debe ser posterior a la hora actual».
- **CA-01.4** Dada una cantidad vacía, cero, negativa o no numérica, cuando el donante envía, entonces se
  rechaza con un mensaje claro.
- **CA-01.5** Dado un comercio con teléfono básico que avisa por llamada, cuando la coordinadora registra la
  donación eligiendo ese comercio, entonces la donación queda a nombre del comercio y con la coordinadora
  como «registrada por». (Resuelve los 4 de 14 comercios sin smartphone.)
- **CA-01.6** Dado un donante que abre el formulario, cuando lo completa, entonces lo hace en una sola
  pantalla con 4 campos obligatorios: abrir, llenar, enviar (RNF-03).

## CMP-02 · Hacer visible la donación para quien debe tomarla

**Origen:** RF-02, RF-08 · Épica 2 (Coordinación de recogida)

- **CA-02.1** Dado un voluntario con sesión iniciada, cuando abre «Donaciones disponibles», entonces ve solo
  las donaciones disponibles con hora límite no cumplida, ordenadas de la más urgente a la menos urgente,
  cada una con tipo, cantidad, punto de recogida, zona, hora límite y tiempo restante.
- **CA-02.2** Dada una donación asignada, entregada o vencida, cuando un voluntario abre la lista,
  entonces esa donación no aparece.
- **CA-02.3** Dado un voluntario con zona asignada, cuando abre la lista, entonces ve por defecto las
  donaciones de su zona y puede cambiar a «Todas las zonas». (Los voluntarios revisan el celular por
  bloques: es una lista para consultar, no avisos.)
- **CA-02.4** Dada una donación disponible cuya hora límite se cumple, cuando cualquiera consulta la lista,
  entonces ya no aparece, y en su detalle figura como «Vencida (no recogida)».
- **CA-02.5** Dado que no hay donaciones disponibles, cuando el voluntario abre la lista, entonces se
  muestra «No hay donaciones disponibles en este momento».

## CMP-03 · Tomar una donación, con bloqueo de una segunda toma

**Origen:** RF-03, RF-08, RNF-05 · Épica 2 · Es el corazón del caso: dos voluntarios llegan al mismo sitio.

- **CA-03.1** Dada una donación disponible, cuando un voluntario pulsa «Tomar» y confirma, entonces pasa a
  «asignada» con el nombre del voluntario y la hora de la toma, queda registrado el movimiento, el voluntario
  ve el punto de recogida y la hora límite, y la donación aparece en «Mis recogidas».
- **CA-03.2** Dados dos voluntarios que pulsan «Tomar» sobre la misma donación al mismo tiempo, entonces
  exactamente uno queda asignado y el otro ve: «Esta donación ya fue tomada por [nombre] a las [HH:MM]. No
  vayas al punto de recogida.» El intento rechazado no modifica la donación.
- **CA-03.3** Dado un voluntario que tiene abierta una lista desactualizada (otro la tomó después de que él
  la cargó), cuando pulsa «Tomar», entonces ve el mismo mensaje de CA-03.2. La verificación se hace en el
  servidor en el momento de tomar, no con lo que muestra la lista.
- **CA-03.4** Dada una donación cuya hora límite ya se cumplió, cuando un voluntario intenta tomarla,
  entonces se rechaza con «La hora límite de esta donación ya pasó; no se puede tomar».
- **CA-03.5** Dado un voluntario que ya tomó la donación, cuando vuelve a pulsar «Tomar» (doble clic o
  reintento por mala señal), entonces no se duplica nada y ve «Ya tomaste esta donación» con sus datos.
- **CA-03.6** Dado un usuario que no es voluntario, cuando intenta tomar una donación, entonces se rechaza
  (RNF-04: solo roles autorizados).

**Decisión de alcance:** en el MVP un voluntario no puede «soltar» una donación tomada. Si no puede ir, avisa
a la coordinadora por el canal actual. Liberar una donación se agregó después como CMP-06 (3C).

**Cómo se garantiza:** ver [ADR-001](../decisiones/).

## CMP-04 · Registrar la entrega a la organización receptora

**Origen:** RF-06, RF-08, RF-09, RNF-05 · Épicas 4 y 5 (Trazabilidad / Responsabilidad sanitaria)

- **CA-04.1** Dado el voluntario asignado a una donación, cuando en «Mis recogidas» pulsa «Registrar
  entrega», elige la organización receptora, escribe el nombre de quien recibe y confirma, entonces la
  donación pasa a «entregada» con fecha y hora, organización, persona que recibe y voluntario que entrega.
- **CA-04.2** Dado un registro de entrega, cuando se guarda, entonces la fecha y hora las pone el servidor;
  el usuario no las puede escribir.
- **CA-04.3** Dado que falta la organización o el nombre de quien recibe, cuando el voluntario confirma,
  entonces se rechaza indicando qué falta.
- **CA-04.4** Dado un voluntario distinto del asignado, cuando intenta registrar la entrega, entonces se
  rechaza.
- **CA-04.5** Dada una donación que no está asignada, cuando se intenta registrar su entrega, entonces se
  rechaza; y si ya fue entregada, se muestra «Esta donación ya fue entregada el [fecha] a [organización]».
- **CA-04.6** Dada una donación asignada cuya hora límite ya pasó, cuando el voluntario registra la entrega,
  entonces se acepta: la hora límite aplica a la recogida, no a la entrega.

## CMP-05 · Consultar el estado de una donación en cualquier momento

**Origen:** RF-08, RF-06, RNF-05 · Épica 5

- **CA-05.1** Dado cualquier usuario con sesión iniciada, cuando busca por código (ej. D-0012) o abre una
  donación desde una lista, entonces ve su estado actual y sus datos.
- **CA-05.2** Dado el detalle de una donación, cuando se abre, entonces muestra el historial en orden
  cronológico: registrada (por quién, cuándo), tomada (por quién, cuándo), entregada (a qué organización,
  quién recibió, quién entregó, cuándo).
- **CA-05.3** Dada una donación disponible con hora límite cumplida, cuando se consulta, entonces se muestra
  como «Vencida (no recogida)».
- **CA-05.4** Dado un código que no existe, cuando se busca, entonces se muestra «No existe una donación con
  ese código».
- **CA-05.5** Dada la coordinadora con sesión iniciada, cuando abre la lista de todas las donaciones,
  entonces puede filtrarla por estado.
- **CA-05.6** Dado un donante con sesión iniciada, cuando abre «Mis donaciones», entonces ve el estado de
  cada una (le da confianza de que alguien va).

## CMP-06 · Soltar una donación tomada

**Origen:** RF-03, RF-08, RNF-05 · Épica 2 · Agregado en la 3C (en el MVP quedó fuera por alcance, ver CMP-03).
Resuelve el caso del voluntario que tomó una donación y no puede recogerla: sin esto la donación queda
«asignada» a alguien que no va, nadie más la ve y se desperdicia el alimento.

- **CA-06.1** Dado el voluntario que tomó una donación asignada, cuando en «Mis recogidas» pulsa «Soltar» y
  confirma, entonces la donación vuelve a «disponible» sin voluntario ni hora de toma, deja de aparecer en
  «Mis recogidas», queda registrado el movimiento «liberación» (quién y cuándo) y, si su hora límite no se ha
  cumplido, vuelve a aparecer en «Donaciones disponibles».
- **CA-06.2** Dado un voluntario distinto del que la tomó, cuando intenta soltarla, entonces se rechaza y la
  donación no cambia.
- **CA-06.3** Dada una donación que no está asignada, cuando se intenta soltar, entonces se rechaza: si está
  disponible, con «Esta donación no está asignada a nadie»; si ya fue entregada, con «Esta donación ya fue
  entregada el [fecha] a [organización]; no se puede soltar».
- **CA-06.4** Dado un reintento (doble clic o mala señal) tras soltarla, entonces no se duplica ningún
  movimiento y se ve el mensaje de CA-06.3 (ya no está asignada a nadie).
- **CA-06.5** Dada una donación asignada cuya hora límite ya pasó, cuando el voluntario la suelta, entonces se
  acepta y queda «Vencida (no recogida)»: no vuelve a la lista de disponibles (CA-02.4).
- **CA-06.6** Dada una donación soltada, cuando se consulta su detalle, entonces el historial muestra la
  liberación («Soltada por [nombre]») en su orden cronológico, y una nueva toma por otro voluntario sigue
  cumpliendo CA-03.1 a CA-03.5.
- **CA-06.7** Dados un voluntario que suelta y otro movimiento sobre la misma donación al mismo tiempo (la
  entrega, o la toma de otro tras otra liberación), entonces exactamente una acción gana y la otra recibe el
  rechazo que corresponde; la donación nunca queda en un estado inconsistente (misma garantía que ADR-001).
- **CA-06.8** Dado un usuario que no es voluntario, cuando intenta soltar una donación, entonces se rechaza
  (RNF-04).

## CMP-07 · Reporte del periodo

**Origen:** RF-07, RNF-05 · Épica 5 · Agregado en la 3C (fuera del MVP). Es lo que Marcela necesita para rendir
cuentas a la fundación: cuánto se rescató, a quién llegó y qué no se recogió.

El periodo se elige por **fecha de registro** de la donación (hora de Colombia): de «desde» a «hasta», ambos
días incluidos. Si no se elige, son los últimos 30 días. Las cantidades son **declaradas** (nadie pesa el
alimento) y por eso se dice así en el reporte y no se suman unidades distintas entre sí.

- **CA-07.1** Dada la coordinadora con sesión iniciada, cuando abre «Reporte del periodo», entonces ve, para el
  periodo, cuántas donaciones se registraron y cuántas están disponibles, asignadas, entregadas, vencidas y
  canceladas. *(Cambio con CMP-13: se agregan las canceladas, que no cuentan como rescate; las donaciones por tipo
  de alimento de CA-07.3 no incluyen las canceladas.)*
- **CA-07.2** Dado un periodo con donaciones entregadas, cuando se abre el reporte, entonces ve la cantidad
  rescatada (solo las entregadas) separada por unidad: nunca se suman kg con cajas.
- **CA-07.3** Dado un periodo con donaciones entregadas, cuando se abre el reporte, entonces ve cuántas
  entregas recibió cada organización y cuántas donaciones hubo por tipo de alimento.
- **CA-07.4** Dadas fechas inválidas, o un «hasta» anterior al «desde», cuando la coordinadora pide el
  reporte, entonces se rechaza con un mensaje claro y no se muestran datos del periodo.
- **CA-07.5** Dado un periodo sin donaciones, cuando se abre el reporte, entonces se muestra «No hay
  donaciones en este periodo».
- **CA-07.6** Dado un usuario que no es coordinadora, cuando intenta abrir el reporte o descargarlo, entonces
  se rechaza (RNF-04).
- **CA-07.7** Dada la coordinadora, cuando pulsa «Descargar CSV», entonces recibe un archivo con una fila por
  donación del periodo (código, estado, tipo, cantidad, unidad, zona, donante, voluntario, organización,
  quién recibió y las fechas de registro, toma y entrega) que se abre bien en Excel, con tildes y ñ.

## CMP-08 · Registrar una donación sin conexión

**Origen:** RNF-01 · Épica 1 · Agregado en la 3C (fuera del MVP). Es el riesgo técnico del Módulo 2: sin señal no
se podía registrar nada. Ver [ADR-004](../decisiones/ADR-004-modo-sin-conexion.md).

**Alcance:** solo **registrar** una donación (CMP-01), por el donante o por la coordinadora. **Tomar** y
**entregar** siguen necesitando conexión a propósito: tomar solo es seguro si el servidor decide quién gana
(CMP-03); un teléfono sin señal no puede saberlo.

- **CA-08.1** Dado un usuario que ya abrió «Publicar donación» con conexión y se queda sin señal, cuando
  completa el formulario y envía, entonces la donación se guarda en su teléfono como pendiente y ve «Guardada
  en tu teléfono. Se enviará cuando haya señal», con cuántas pendientes tiene.
- **CA-08.2** Dada una donación pendiente, cuando vuelve la conexión (o el usuario abre la aplicación con
  conexión), entonces se envía sola, queda registrada «disponible» a nombre de su autor, con su código y su
  fecha de registro, y el aviso de pendiente desaparece.
- **CA-08.3** Dado un envío repetido de la misma donación pendiente (reintento por mala señal o dos pestañas),
  entonces se registra una sola vez y no se duplica.
- **CA-08.4** Dada una donación pendiente que al sincronizar es inválida (por ejemplo, su hora límite ya
  pasó), entonces no se registra, se le dice al usuario cuál es y por qué, y queda visible hasta que la
  descarte. Aplican las mismas reglas de CA-01.2 a CA-01.4.
- **CA-08.5** Dado que la sesión venció o ingresó otra persona en ese teléfono, cuando se intenta sincronizar,
  entonces la donación sigue pendiente (no se pierde) y no se registra a nombre de otro usuario.
- **CA-08.6** Dado un usuario sin conexión que abre cualquier pantalla distinta de «Publicar donación», cuando
  la abre, entonces ve «Sin conexión» explicando que solo puede publicar donaciones (se enviarán al volver la
  señal) y que tomar y entregar necesitan conexión.
- **CA-08.7** Dado un usuario que no es donante ni coordinadora, cuando intenta sincronizar donaciones,
  entonces se rechaza (RNF-04).

---

# Administración (para operar con datos reales)

Hasta la 3C los usuarios y las organizaciones solo se creaban con la semilla de demostración o con SQL, la zona era
texto libre y nada se podía corregir. Para que la fundación opere sola (RNF-08) sin depender del equipo técnico, la
coordinadora administra usuarios, PIN, zonas y organizaciones, y puede corregir, cancelar o destrabar donaciones.
Todas las pantallas de administración son solo de la coordinadora (RNF-04) y todo cambio sobre una donación queda
en su historial (RNF-05). Ver [ADR-005](../decisiones/ADR-005-administracion-pin-temporal.md).

## CMP-09 · Administrar las zonas

**Origen:** RF-02, RNF-08 · Épica 2 · Hoy la zona se escribe a mano en cada usuario: «Norte» y «norte» serían dos
zonas y el voluntario dejaría de ver las donaciones de su zona (CA-02.3).

- **CA-09.1** Dada la coordinadora con sesión iniciada, cuando abre «Zonas», entonces ve cada zona con cuántos
  usuarios activos y organizaciones activas la usan, y si está activa.
- **CA-09.2** Dada la coordinadora, cuando crea una zona con su nombre, entonces queda activa y aparece en las listas
  para elegir zona de usuarios y organizaciones.
- **CA-09.3** Dado un nombre vacío, o igual al de otra zona (sin importar mayúsculas ni espacios), cuando la
  coordinadora guarda, entonces se rechaza con «Falta el nombre de la zona» o «Ya existe una zona con ese nombre».
- **CA-09.4** Dada una zona, cuando la coordinadora la renombra, entonces el nombre nuevo queda en los usuarios, las
  organizaciones y las donaciones de esa zona, y los voluntarios siguen viendo las donaciones de su zona.
- **CA-09.5** Dada una zona que no usa ningún usuario activo ni organización activa, cuando la coordinadora la
  desactiva, entonces deja de aparecer para elegir y las donaciones existentes la conservan. Si alguien activo la
  usa, se rechaza diciendo cuántos. Una zona desactivada se puede volver a activar.
- **CA-09.6** Dado un usuario que no es coordinadora, cuando intenta ver o cambiar las zonas, entonces se rechaza
  (RNF-04).
- **CA-09.7** Dadas las zonas que ya estaban escritas en usuarios, organizaciones y donaciones, cuando se aplica la
  migración, entonces todas quedan en la lista de zonas, sin perder ni cambiar ningún dato.

## CMP-10 · Administrar los usuarios

**Origen:** RNF-04, RNF-05, RNF-08 · ADR-003 y ADR-005 · Sin esto la fundación no puede incorporar a un comercio o
voluntario nuevo, ni sacar a uno que se fue.

- **CA-10.1** Dada la coordinadora con sesión iniciada, cuando abre «Usuarios», entonces ve todos los usuarios con
  nombre, rol, zona, teléfono y si está activo, y puede filtrar por rol.
- **CA-10.2** Dada la coordinadora, cuando crea un usuario con sus datos y guarda, entonces queda activo y la
  pantalla muestra **una sola vez** un PIN temporal de 4 dígitos generado por el sistema, para dárselo a la persona.
- **CA-10.3** Dados los campos obligatorios según el rol (nombre siempre; teléfono y zona para donante y voluntario;
  dirección para donante), cuando falta alguno, entonces no se guarda nada, se dice qué falta y se conserva lo escrito.
- **CA-10.4** Dado un nombre que ya usa otro usuario (sin importar mayúsculas), un teléfono que no tiene entre 7 y 15
  dígitos, o una zona que no está activa en la lista, cuando la coordinadora guarda, entonces se rechaza con un
  mensaje claro («Ya existe un usuario con ese nombre», porque con el nombre se ingresa).
- **CA-10.5** Dado un usuario, cuando la coordinadora edita su nombre, rol, teléfono, zona o dirección, entonces los
  cambios se guardan y las sesiones abiertas de esa persona se cierran para que entre con los datos nuevos. El PIN no
  se ve ni se edita aquí.
- **CA-10.6** Dado un usuario, cuando la coordinadora lo desactiva, entonces sus sesiones abiertas se cierran, deja de
  aparecer en las listas para elegir (comercios y voluntarios) y su historial se conserva. Si intenta ingresar con su
  PIN correcto, ve «Tu usuario está desactivado. Habla con la coordinadora.». Se puede reactivar.
- **CA-10.7** Dado un voluntario con donaciones asignadas, cuando la coordinadora intenta desactivarlo, entonces se
  rechaza con «Tiene N donaciones asignadas. Libéralas o asígnalas a otro voluntario primero.» (CMP-14).
- **CA-10.8** Dada la coordinadora, cuando intenta desactivarse a sí misma o quitarse el rol de coordinadora,
  entonces se rechaza: siempre queda al menos una coordinadora activa.
- **CA-10.9** Dado un usuario que no es coordinadora, cuando intenta ver o cambiar usuarios, entonces se rechaza
  (RNF-04).

## CMP-11 · Cambiar y restablecer el PIN

**Origen:** RNF-04, RNF-05 · ADR-003 y ADR-005 · Hoy un PIN olvidado no tiene solución: se guarda cifrado y nadie
lo puede consultar.

- **CA-11.1** Dado cualquier usuario con sesión iniciada, cuando abre «Cambiar mi PIN», escribe su PIN actual y el
  nuevo dos veces y confirma, entonces el PIN cambia y sigue con su sesión.
- **CA-11.2** Dado un PIN actual incorrecto, un PIN nuevo que no son 4 dígitos, un PIN nuevo que no coincide las dos
  veces o que es igual al actual, cuando confirma, entonces no cambia nada y se dice qué está mal («El PIN actual no
  es correcto», «El PIN nuevo debe tener 4 números», «Los dos PIN nuevos no coinciden», «El PIN nuevo debe ser
  distinto del actual»).
- **CA-11.3** Dada la coordinadora, cuando restablece el PIN de otro usuario y confirma, entonces se genera un PIN
  temporal nuevo que se muestra una sola vez, el anterior deja de servir y se cierran las sesiones abiertas de esa
  persona.
- **CA-11.4** Dado un usuario con PIN temporal (recién creado o restablecido), cuando ingresa, entonces se le lleva a
  «Cambiar mi PIN» y no puede usar ninguna otra pantalla hasta cambiarlo (sí puede salir). Así la coordinadora no
  conoce el PIN de nadie y el historial sigue diciendo quién hizo cada cosa (RNF-05).
- **CA-11.5** Dado un usuario con PIN temporal pendiente, cuando el teléfono intenta sincronizar donaciones guardadas
  sin conexión, entonces no se registra nada y siguen pendientes en el teléfono, como cuando falta ingresar (CA-08.5).
- **CA-11.6** Dado un usuario que no es coordinadora, cuando intenta restablecer el PIN de otro, entonces se rechaza
  (RNF-04).

## CMP-12 · Administrar las organizaciones receptoras

**Origen:** RF-04, RF-05, RNF-08 · Épica 3 · Hoy solo existen las organizaciones de la semilla de demostración.

- **CA-12.1** Dada la coordinadora con sesión iniciada, cuando abre «Organizaciones», entonces ve cada una con nombre,
  dirección, zona, si tiene refrigeración, teléfono y si está activa.
- **CA-12.2** Dada la coordinadora, cuando crea una organización con nombre, dirección, zona, refrigeración (sí o no)
  y teléfono (opcional), entonces queda activa y aparece al registrar una entrega.
- **CA-12.3** Dado un nombre, dirección o zona vacíos, un nombre que ya existe (sin importar mayúsculas), un teléfono
  que no tiene entre 7 y 15 dígitos o una zona que no está activa, cuando guarda, entonces se rechaza con un mensaje
  claro y se conserva lo escrito.
- **CA-12.4** Dada una organización, cuando la coordinadora edita sus datos, entonces se guardan; las entregas
  pasadas siguen apuntando a ella.
- **CA-12.5** Dada una organización, cuando la coordinadora la desactiva, entonces deja de aparecer en «Registrar
  entrega» (y si se envía igual, se rechaza con «Elige una organización de la lista»), y las entregas pasadas y el
  reporte la conservan. Se puede reactivar.
- **CA-12.6** Dado un usuario que no es coordinadora, cuando intenta ver o cambiar organizaciones, entonces se
  rechaza (RNF-04).

## CMP-13 · Corregir o cancelar una donación

**Origen:** RF-01, RF-08, RNF-05 · Épica 1 · Hoy una cantidad mal escrita no se puede arreglar, y si el comercio ya
no tiene el alimento la donación queda «disponible» y un voluntario puede ir para nada.

- **CA-13.1** Dado el donante de una donación «disponible» (también si ya está vencida), cuando pulsa «Corregir»,
  cambia tipo, cantidad, unidad, punto de recogida u hora límite y guarda, entonces la donación conserva su código,
  queda con los datos nuevos y el historial registra la «corrección» con qué cambió (antes → después) y quién.
- **CA-13.2** Dada una corrección, cuando se guarda, entonces aplican las reglas de CA-01.2 a CA-01.4 (la hora límite
  debe ser posterior a la actual). Una donación vencida que recibe una hora límite nueva vuelve a «Donaciones
  disponibles».
- **CA-13.3** Dada la coordinadora, cuando corrige una donación disponible, asignada o entregada, entonces se guarda
  igual que en CA-13.1; en una asignada o entregada la hora límite ya no se cambia (la recogida ya ocurrió o está en
  curso).
- **CA-13.4** Dado un donante, cuando intenta corregir o cancelar una donación que no es suya, se rechaza; y si la
  suya ya fue tomada o entregada, se rechaza con «Esta donación ya fue tomada; para cambiarla habla con la
  coordinadora».
- **CA-13.5** Dada una corrección sin ningún dato distinto, cuando se guarda, entonces no se registra nada y se dice
  «No cambiaste ningún dato».
- **CA-13.6** Dada una donación disponible (por su donante o la coordinadora) o asignada (solo la coordinadora),
  cuando se pulsa «Cancelar donación», se escribe el motivo y se confirma, entonces queda «cancelada», sale de
  «Donaciones disponibles» y de «Mis recogidas», y el historial registra la «cancelación» con el motivo y quién. No se
  puede deshacer.
- **CA-13.7** Dado un motivo vacío, cuando se confirma la cancelación, entonces se rechaza con «Falta el motivo de la
  cancelación». Dada una donación entregada o ya cancelada, cuando se intenta corregir (el donante) o cancelar,
  entonces se rechaza con «Esta donación ya fue entregada el [fecha] a [organización]» o «Esta donación ya fue
  cancelada».
- **CA-13.8** Dados un donante que corrige o cancela y un voluntario que toma la misma donación al mismo tiempo,
  entonces la donación nunca queda en un estado inconsistente: si la toma llegó primero, la corrección o la
  cancelación se rechaza con CA-13.4; entre cancelar y tomar exactamente una gana, y si ganó la cancelación el
  voluntario ve «Esta donación fue cancelada. No vayas al punto de recogida.» (misma garantía que ADR-001).
  *(Precisado al construir: una corrección que llega antes de la toma no impide tomarla, porque la donación sigue
  disponible; solo cancelar y tomar se excluyen.)*
- **CA-13.9** Dada una donación cancelada, cuando se consulta, entonces el detalle la muestra «Cancelada» con su
  motivo, «Todas las donaciones» se puede filtrar por «Canceladas» y el reporte la cuenta aparte (CA-07.1).
- **CA-13.10** Dado un voluntario, cuando intenta corregir o cancelar una donación, entonces se rechaza (RNF-04).

## CMP-14 · La coordinadora interviene en una donación tomada

**Origen:** RF-03, RF-08, RF-09, RNF-05 · Épica 2 · Hoy solo el voluntario que tomó una donación puede soltarla o
registrar su entrega: si se queda sin batería o deja de responder, la donación queda atrapada.

- **CA-14.1** Dada una donación asignada, cuando la coordinadora pulsa «Liberar» y confirma, entonces vuelve a
  «disponible» sin voluntario ni hora de toma, sale de «Mis recogidas» de ese voluntario, el historial dice
  «Liberada por [coordinadora] (la tenía [voluntario])» y, si su hora límite no se cumplió, vuelve a «Donaciones
  disponibles».
- **CA-14.2** Dada una donación disponible o asignada, cuando la coordinadora elige un voluntario activo de la lista
  y confirma «Asignar», entonces queda asignada a ese voluntario con la hora de ahora, aparece en su «Mis recogidas»
  y el historial dice «Asignada a [voluntario] por [coordinadora]» (y a quién se la quitó, si la tenía otro).
- **CA-14.3** Dada una donación cuya hora límite ya pasó, un voluntario que no está activo o el mismo voluntario que
  ya la tiene, cuando la coordinadora intenta asignarla, entonces se rechaza («La hora límite de esta donación ya
  pasó; no se puede asignar», «Elige un voluntario de la lista», «Ya está asignada a ese voluntario»).
- **CA-14.4** Dada una donación asignada, cuando la coordinadora registra la entrega en nombre del voluntario,
  entonces aplican CA-04.1 a CA-04.6, quien entrega sigue siendo el voluntario asignado y el historial dice que la
  registró la coordinadora.
- **CA-14.5** Dada una donación entregada o cancelada, cuando la coordinadora intenta liberarla, asignarla o
  registrar su entrega, entonces se rechaza con el mensaje de CA-04.5 o CA-13.7.
- **CA-14.6** Dadas una acción de la coordinadora y otra del voluntario sobre la misma donación al mismo tiempo (por
  ejemplo, ella la libera y él registra la entrega), entonces exactamente una gana y la otra recibe su rechazo; si la
  donación cambió mientras la coordinadora decidía, ve «La donación cambió mientras decidías; revisa su estado».
- **CA-14.7** Dado un usuario que no es coordinadora, cuando intenta liberar, asignar o registrar la entrega por
  otro, entonces se rechaza (RNF-04).

## CMP-15 · Ver el teléfono de contacto de quien hace falta

**Origen:** RF-03, RNF-04 · Épica 2 · El voluntario ve la dirección de recogida pero no tiene a quién llamar si no
encuentra el lugar o el comercio cerró; el comercio no sabe quién viene.

- **CA-15.1** Dado un voluntario con una donación asignada, cuando la toma o la ve en «Mis recogidas», entonces ve el
  teléfono del comercio como enlace para llamar; si no tiene, ve «El comercio no tiene teléfono registrado».
- **CA-15.2** Dado un donante, cuando abre «Mis donaciones», entonces en cada donación asignada ve el nombre y el
  teléfono del voluntario que va a recogerla.
- **CA-15.3** Dada la coordinadora, cuando abre el detalle de cualquier donación, entonces ve los teléfonos del
  donante, del voluntario y de la organización que recibió.
- **CA-15.4** Dado cualquier otro usuario, cuando abre «Donaciones disponibles» o el detalle de una donación que no
  es suya, entonces no ve ningún teléfono: el del comercio solo lo ve el voluntario asignado y el del voluntario
  solo lo ve el donante de esa donación (RNF-04).

---

## Fuera del alcance del MVP

Panel de indicadores, notificaciones automáticas (RF-10) y asignación automática de destino. Soltar una donación, el
reporte del periodo (RF-07) y el modo sin conexión para registrar (RNF-01) quedaron fuera del MVP y se agregaron en
la 3C como CMP-06, CMP-07 y CMP-08. La administración (usuarios, PIN, zonas, organizaciones, corregir, cancelar e
intervenir donaciones y teléfonos de contacto) se agregó después como CMP-09 a CMP-15: ver
[plan técnico](plan-tecnico.md).

## Tabla de trazabilidad

| CMP | CA | Requerimiento de origen | Épica del Módulo 1 | Archivo de prueba |
|---|---|---|---|---|
| CMP-01 | CA-01.1 a CA-01.6 | RF-01, RNF-03 | 1 · Gestión de donaciones | `tests/cmp-01.test.js` |
| CMP-02 | CA-02.1 a CA-02.5 | RF-02, RF-08 | 2 · Coordinación de recogida | `tests/cmp-02.test.js` |
| CMP-03 | CA-03.1 a CA-03.6 | RF-03, RF-08, RNF-05 | 2 · Coordinación de recogida | `tests/cmp-03.test.js` |
| CMP-04 | CA-04.1 a CA-04.6 | RF-06, RF-08, RF-09, RNF-05 | 4 y 5 · Trazabilidad / Responsabilidad sanitaria | `tests/cmp-04.test.js` |
| CMP-05 | CA-05.1 a CA-05.6 | RF-08, RF-06, RNF-05 | 5 · Responsabilidad sanitaria | `tests/cmp-05.test.js` |
| CMP-06 | CA-06.1 a CA-06.8 | RF-03, RF-08, RNF-05 | 2 · Coordinación de recogida | `tests/cmp-06.test.js` |
| CMP-07 | CA-07.1 a CA-07.7 | RF-07, RNF-05 | 5 · Responsabilidad sanitaria | `tests/cmp-07.test.js` |
| CMP-08 | CA-08.1 a CA-08.7 | RNF-01 | 1 · Gestión de donaciones | `tests/cmp-08.test.js` |
| CMP-09 | CA-09.1 a CA-09.7 | RF-02, RNF-08 | 2 · Coordinación de recogida | `tests/cmp-09.test.js` |
| CMP-10 | CA-10.1 a CA-10.9 | RNF-04, RNF-05, RNF-08 | 5 · Responsabilidad sanitaria | `tests/cmp-10.test.js` |
| CMP-11 | CA-11.1 a CA-11.6 | RNF-04, RNF-05 | 5 · Responsabilidad sanitaria | `tests/cmp-11.test.js` |
| CMP-12 | CA-12.1 a CA-12.6 | RF-04, RF-05, RNF-08 | 3 · Planeación en la recepción | `tests/cmp-12.test.js` |
| CMP-13 | CA-13.1 a CA-13.10 | RF-01, RF-08, RNF-05 | 1 · Gestión de donaciones | `tests/cmp-13.test.js` |
| CMP-14 | CA-14.1 a CA-14.7 | RF-03, RF-08, RF-09, RNF-05 | 2 · Coordinación de recogida | `tests/cmp-14.test.js` |
| CMP-15 | CA-15.1 a CA-15.4 | RF-03, RNF-04 | 2 · Coordinación de recogida | `tests/cmp-15.test.js` |
