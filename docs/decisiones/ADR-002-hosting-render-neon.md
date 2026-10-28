# ADR-002 · Hosting y base de datos: Render + Neon (planes gratis)

**Estado:** Aceptada

**Satisface:** RNF-06 (costo bajo o nulo), RNF-08 (operable sin personal técnico especializado).

## Contexto

La fundación puede sostener hasta **$150.000 mensuales** de operación; pasar de ahí toma unos tres meses de
gestión con un cooperante. No tiene personal técnico. El volumen es pequeño y estable (8 a 15 rescates por
semana, unos 8 voluntarios activos).

## Decisión

Desplegar la aplicación en **Render** (plan gratis) y la base de datos PostgreSQL en **Neon** (plan gratis).
Costo de operación: **$0/mes**.

## Alternativas consideradas y por qué se descartaron

- **Servidor propio o VPS de pago.** Cabría en el presupuesto pero exige administrar el servidor; la fundación
  no tiene quién lo haga.
- **App nativa con proveedor externo (alternativa A).** Supera el techo de costo y no la pueden usar los
  comercios con teléfono básico.
- **CRM gratuito (alternativa C).** No permite la trazabilidad completa y el plan gratis puede cambiar.

## Consecuencias

- **Bueno:** costo cero, despliegue desde GitHub y sin servidores que administrar.
- **Malo:** el plan gratis de Render **se «duerme»** tras unos 15 minutos sin uso y la primera visita tarda.
  *Mitigación:* abrir la URL antes de una demostración o de que los voluntarios empiecen su turno.
- **Malo:** los planes gratis tienen límites y pueden cambiar. *Mitigación:* el código es estándar (Node +
  PostgreSQL), así que migrar a otro proveedor es posible; en la 3C se revisan los límites.
