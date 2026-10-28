# Manual de operación · Rescate de Alimentos

Para **Marcela, Diana y el equipo de la Fundación Mesa Común**. No necesitas saber de tecnología. Está escrito con los
pasos que se hacen en el celular, en el orden en que pasan las cosas.

Dirección de la página: **https://rescate-alimentos.onrender.com**

## La regla más importante

> **Solo cuenta lo que quedó registrado en la página.**

WhatsApp puede seguir usándose para hablar con la gente, pero una donación que solo está en un mensaje **no existe** para el
sistema: nadie la ve, nadie puede tomarla y no sale en los informes. Si un comercio avisa por WhatsApp, quien lo recibe la
registra en la página (o se la pide al comercio). Es la única forma de que no vuelvan los dos voluntarios en el mismo sitio.

Conviene decirlo en el mensaje de lanzamiento a comercios y voluntarios y repetirlo las primeras semanas.

## Cómo entra cada persona

Se entra con **nombre y PIN de 4 números**. Cada comercio, voluntario y miembro del equipo tiene el suyo. Al terminar, pulsar **Salir**
(sobre todo si el celular es compartido, para no actuar a nombre de otra persona).

> **Aviso:** por ahora los usuarios y PIN los crea el equipo técnico (Overflow). Los que trae la página son **de demostración**
> y deben cambiarse por los reales antes de usarla de verdad. No hay una pantalla para crear usuarios todavía.

## Lo que hace cada uno

### El comercio (donante)
1. **Publicar donación.** Elegir el tipo de alimento, escribir cuánto hay (aproximado) y la unidad, confirmar el punto de
   recogida (ya viene escrito con la dirección del comercio) y elegir hasta qué hora sirve el alimento.
2. Pulsar **Publicar donación**. La página muestra un **código** (por ejemplo `D-0012`). Guardarlo: sirve para preguntar por ella.
3. **Mis donaciones** muestra el estado de cada una: *Disponible* (todavía nadie la toma), *Asignada* (alguien va en camino),
   *Entregada*, o *Vencida (no recogida)* si pasó la hora y nadie la tomó.

Si un dato falta o está mal, la página no registra nada y dice **qué** hay que corregir, sin borrar lo que ya se escribió.

### La coordinadora (Marcela, Diana)
- **Comercio que avisa por llamada** (por ejemplo, los que tienen teléfono básico): entrar, pulsar **Registrar donación de un
  comercio**, elegir el comercio y llenar lo mismo. Si se deja vacío el punto de recogida, se usa la dirección del comercio.
  La donación queda a nombre del comercio y se ve que la registraste tú.
- **Todas las donaciones:** la lista completa, de la más reciente a la más antigua. Se puede filtrar por **Disponibles,
  Asignadas, Entregadas o Vencidas**.
- **Buscar donación por código:** el estado y el historial de una donación (quién la registró, quién la tomó, a quién se entregó y cuándo).

### El voluntario
1. **Donaciones disponibles.** Aparecen solo las que todavía sirven, de la más urgente a la menos urgente, con el tiempo que
   queda. Por defecto se ve **tu zona**; se puede pulsar **Ver todas las zonas**.
2. Pulsar **Tomar** y luego **Sí, tomar esta donación**. A partir de ahí es tuya y nadie más puede tomarla.
3. Si otra persona la tomó antes, la página lo dice con su nombre y la hora, y pide **no ir** al punto de recogida. No pasa nada: se
   elige otra.
4. **Mis recogidas** muestra lo que tomaste, con el punto de recogida y la hora límite.
5. Al entregar: **Registrar entrega**, elegir la **organización** que recibe, escribir el **nombre de quien recibe** y confirmar.
   La fecha y la hora las pone la página sola.

## Qué hacer cuando algo no sale como se espera

| Situación | Qué hacer |
|---|---|
| La página tarda mucho la primera vez | Es normal: la página gratuita «se duerme» si nadie la usa durante unos 15 minutos. Esperar un minuto y recargar. Conviene abrirla antes de empezar el turno. |
| Una donación aparece como «Vencida (no recogida)» | Pasó la hora límite sin que nadie la tomara. Queda guardada como no recogida; no se puede tomar. |
| Un voluntario tomó una donación y **no puede ir** | **Hoy la página no permite soltarla.** Avisar a la coordinadora por el canal de siempre para que busque a otra persona, y **avisar también al equipo técnico**, porque solo quien la tomó puede registrar su entrega. Liberar una donación es una mejora pendiente (CMP-06). |
| Se equivocaron al escribir una cantidad o un nombre ya enviado | Hoy no se puede editar. Avisar al equipo técnico. |
| No hay señal o datos | Intentar de nuevo cuando haya. La página no guarda nada sin conexión todavía (mejora pendiente). Si el comercio no puede registrar, la coordinadora lo registra por llamada. |
| Se pulsó dos veces «Tomar» o «Registrar entrega» | No se duplica nada; la página avisa que ya estaba hecho. |
| Una persona olvidó su PIN | Pedirlo al equipo técnico. |

## Lo que la página todavía no hace

Para que nadie espere algo que no está:
- No avisa sola por mensaje cuando se acerca la hora límite (queda para una próxima versión).
- No genera todavía el reporte de kilos y personas atendidas por periodo para los cooperantes.
- No funciona sin conexión.
- No hay una pantalla para crear o cambiar usuarios.
- La cantidad es **la que declara el comercio**: nadie la pesa, y la página no la presenta como verificada.

## A quién escribir

Equipo Overflow (Fabio Jordan y Juan David Morales). El código y su documentación están en
https://github.com/FabioJDev/rescate-alimentos.
