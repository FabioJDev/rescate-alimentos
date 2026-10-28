// CMP-05 · Listas para consultar el estado de las donaciones: la de la coordinadora y la de cada donante.
const { consultar } = require('../db/conexion');

// Filtros de estado que se pueden pedir. «vencida» se calcula (disponible + hora límite cumplida), no se guarda.
const FILTROS = ['disponible', 'asignada', 'entregada', 'vencida'];

const COLUMNAS = `d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.estado, d.hora_limite, d.creada_en,
                  donante.nombre AS donante_nombre,
                  (d.estado = 'disponible' AND d.hora_limite <= now()) AS vencida`;

// CA-05.5: todas las donaciones, de la más reciente a la más antigua, con filtro opcional por estado.
// El filtro «disponible» deja fuera las vencidas, porque en pantalla figuran como «Vencida (no recogida)».
async function listarTodas({ estado = null } = {}) {
  const filtro = FILTROS.includes(estado) ? estado : null;
  const r = await consultar(
    `SELECT ${COLUMNAS}
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
      WHERE $1::text IS NULL
         OR ($1 = 'vencida'    AND d.estado = 'disponible' AND d.hora_limite <= now())
         OR ($1 = 'disponible' AND d.estado = 'disponible' AND d.hora_limite >  now())
         OR ($1 IN ('asignada', 'entregada') AND d.estado = $1)
      ORDER BY d.creada_en DESC, d.id DESC
      LIMIT 200`,
    [filtro]
  );
  return r.rows;
}

// CA-05.6: las donaciones de un donante (las que él registró y las que la coordinadora registró a su nombre).
async function listarDeDonante(donanteId) {
  const r = await consultar(
    `SELECT ${COLUMNAS}
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
      WHERE d.donante_id = $1
      ORDER BY d.creada_en DESC, d.id DESC
      LIMIT 200`,
    [donanteId]
  );
  return r.rows;
}

module.exports = { FILTROS, listarTodas, listarDeDonante };
