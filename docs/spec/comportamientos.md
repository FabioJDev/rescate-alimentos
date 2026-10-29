# Especificación del MVP

Equipo Overflow · Caso: Red de Rescate de Alimentos · Fundación Mesa Común.

Esta especificación es la fuente de verdad. Si algo cambia, se cambia primero aquí (con su razón) y después
el código. Los IDs (CMP-0X y CA-0X.Y) son estables: nunca se renumeran. Se escribe en presente.

## Estados de una donación

```
disponible ──(un voluntario la toma)──► asignada ──(se registra la entrega)──► entregada
     │
     └──(llega la hora límite sin que nadie la tome)──► vencida

asignada ──(el voluntario que la tomó la suelta, CMP-06)──► disponible
```

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
  periodo, cuántas donaciones se registraron y cuántas están disponibles, asignadas, entregadas y vencidas.
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

## Fuera del alcance del MVP

Panel de indicadores, notificaciones automáticas (RF-10), asignación automática de destino y gestión avanzada de
usuarios. Soltar una donación, el reporte del periodo (RF-07) y el modo sin conexión para registrar (RNF-01)
quedaron fuera del MVP y se agregaron en la 3C como CMP-06, CMP-07 y CMP-08: ver [plan técnico](plan-tecnico.md).

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
