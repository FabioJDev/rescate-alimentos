// CMP-05 · Listas para consultar el estado de las donaciones: la de la coordinadora y la de cada donante.
const { consultar } = require('../db/conexion');

// Filtros de estado que se pueden pedir. «vencida» se calcula (disponible + hora límite cumplida), no se guarda.
const FILTROS = ['disponible', 'asignada', 'entregada', 'vencida', 'cancelada'];

const COLUMNAS = `d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.estado, d.hora_limite, d.creada_en,
                  donante.nombre AS donante_nombre,
                  (d.estado = 'disponible' AND d.hora_limite <= now()) AS vencida`;

// CA-05.5: el filtro «disponible» deja fuera las vencidas, porque en pantalla figuran como «Vencida (no recogida)».
const CONDICION_DE_ESTADO = `$1::text IS NULL
         OR ($1 = 'vencida'    AND d.estado = 'disponible' AND d.hora_limite <= now())
         OR ($1 = 'disponible' AND d.estado = 'disponible' AND d.hora_limite >  now())
         OR ($1 IN ('asignada', 'entregada', 'cancelada') AND d.estado = $1)`;

const POR_PAGINA = 50;

// CA-05.5 y CA-05.7: todas las donaciones, de la más reciente a la más antigua, de 50 en 50, con filtro opcional por
// estado. Una página fuera de rango se lleva a la última que tiene donaciones.
async function listarTodas({ estado = null, pagina = 1 } = {}) {
  const filtro = FILTROS.includes(estado) ? estado : null;
  const conteo = await consultar(`SELECT count(*)::int AS total FROM donaciones d WHERE ${CONDICION_DE_ESTADO}`, [filtro]);
  const total = conteo.rows[0].total;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const actual = Math.min(Math.max(1, pagina), paginas);

  const r = await consultar(
    `SELECT ${COLUMNAS}
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
      WHERE ${CONDICION_DE_ESTADO}
      ORDER BY d.creada_en DESC, d.id DESC
      LIMIT $2 OFFSET $3`,
    [filtro, POR_PAGINA, (actual - 1) * POR_PAGINA]
  );
  return { donaciones: r.rows, total, pagina: actual, paginas };
}

// CA-05.6: las donaciones de un donante (las que él registró y las que la coordinadora registró a su nombre).
// CA-15.2: con el nombre y el teléfono del voluntario que va a recogerla.
async function listarDeDonante(donanteId) {
  const r = await consultar(
    `SELECT ${COLUMNAS}, voluntario.nombre AS voluntario_nombre, voluntario.telefono AS voluntario_telefono
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       LEFT JOIN usuarios voluntario ON voluntario.id = d.voluntario_id
      WHERE d.donante_id = $1
      ORDER BY d.creada_en DESC, d.id DESC
      LIMIT 200`,
    [donanteId]
  );
  return r.rows;
}

module.exports = { FILTROS, POR_PAGINA, listarTodas, listarDeDonante };
