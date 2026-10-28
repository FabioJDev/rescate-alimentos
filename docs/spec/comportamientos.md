# Especificación del MVP

Equipo Overflow · Caso: Red de Rescate de Alimentos · Fundación Mesa Común.

Esta especificación es la fuente de verdad. Si algo cambia, se cambia primero aquí (con su razón) y después
el código. Los IDs (CMP-0X y CA-0X.Y) son estables: nunca se renumeran. Se escribe en presente.

## Estados de una donación

```
disponible ──(un voluntario la toma)──► asignada ──(se registra la entrega)──► entregada
     │
     └──(llega la hora límite sin que nadie la tome)──► vencida
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
a la coordinadora por el canal actual. Liberar una donación queda como CMP-06 en el backlog de la 3C.

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

---

## Fuera del alcance del MVP

Reportes de impacto y exportación, panel de indicadores, notificaciones automáticas (RF-10), asignación
automática de destino y gestión avanzada de usuarios. También el modo sin conexión (RNF-01): ver
[plan técnico](plan-tecnico.md).

## Tabla de trazabilidad

| CMP | CA | Requerimiento de origen | Épica del Módulo 1 | Archivo de prueba |
|---|---|---|---|---|
| CMP-01 | CA-01.1 a CA-01.6 | RF-01, RNF-03 | 1 · Gestión de donaciones | `tests/cmp-01.test.js` |
| CMP-02 | CA-02.1 a CA-02.5 | RF-02, RF-08 | 2 · Coordinación de recogida | `tests/cmp-02.test.js` |
| CMP-03 | CA-03.1 a CA-03.6 | RF-03, RF-08, RNF-05 | 2 · Coordinación de recogida | `tests/cmp-03.test.js` |
| CMP-04 | CA-04.1 a CA-04.6 | RF-06, RF-08, RF-09, RNF-05 | 4 y 5 · Trazabilidad / Responsabilidad sanitaria | `tests/cmp-04.test.js` |
| CMP-05 | CA-05.1 a CA-05.6 | RF-08, RF-06, RNF-05 | 5 · Responsabilidad sanitaria | `tests/cmp-05.test.js` |
