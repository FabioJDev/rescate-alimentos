// CMP-25 · Registro de las acciones de administración. Las rutas lo llaman solo cuando la acción se completó
// (CA-25.4). Los movimientos de las donaciones van aparte, en su historial (CMP-05).
const { consultar } = require('../db/conexion');

const ULTIMAS = 100;

async function registrarAccion(quien, accion, detalle) {
  await consultar('INSERT INTO registro_administracion (usuario_id, accion, detalle) VALUES ($1, $2, $3)', [
    quien.id,
    accion,
    detalle,
  ]);
}

// CA-25.5: las últimas 100, de la más reciente a la más antigua.
async function listarRegistro() {
  const r = await consultar(
    `SELECT ra.ocurrido_en, ra.accion, ra.detalle, u.nombre AS usuario_nombre
       FROM registro_administracion ra
       JOIN usuarios u ON u.id = ra.usuario_id
      ORDER BY ra.ocurrido_en DESC, ra.id DESC
      LIMIT $1`,
    [ULTIMAS]
  );
  return r.rows;
}

module.exports = { ULTIMAS, registrarAccion, listarRegistro };
