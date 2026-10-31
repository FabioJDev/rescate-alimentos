// Cierra las sesiones abiertas de un usuario (ADR-005). La sesión guarda su nombre, rol y zona: al editarlo,
// desactivarlo o restablecer su PIN, se borran sus sesiones para que vuelva a entrar con los datos nuevos.
const { consultar } = require('../db/conexion');

async function cerrarSesionesDe(usuarioId) {
  await consultar(`DELETE FROM "session" WHERE (sess::jsonb -> 'usuario' ->> 'id')::int = $1`, [usuarioId]);
}

module.exports = { cerrarSesionesDe };
