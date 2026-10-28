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

*Se completa cuando exista la aplicación (Fase 5).*

## Documentación

- [Constitución del proyecto](docs/spec/constitucion.md): equipo, convenciones, uso de IA y definiciones de Listo y Terminado.
- [Especificación del MVP](docs/spec/comportamientos.md): comportamientos y criterios de aceptación.
- [Plan técnico](docs/spec/plan-tecnico.md): arquitectura, modelo de datos y despliegue.
- [Decisiones de arquitectura](docs/decisiones/): ADR.
- [Cómo revisar un PR](docs/qa/como-revisar.md) y [plan de pruebas](docs/qa/plan-de-pruebas.md).

## Uso de asistentes de IA

- **Claude (chat):** para planear y redactar la especificación, el plan técnico y los documentos.
- **Claude Code:** para generar código, pruebas, configuración de CI y despliegue.

Todo lo generado lo revisa el equipo. Ningún pull request se integra sin que otra persona lo verifique
contra sus criterios de aceptación, y cualquier integrante debe poder explicar cualquier parte del
proyecto. La reflexión final del módulo se escribe sin IA.
