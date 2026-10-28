// Lógica de negocio de las donaciones. Las rutas llaman a estas funciones; aquí vive el acceso a la base de datos.
const { pool, consultar } = require('../db/conexion');

// Listas cerradas del plan de especificación (docs/spec/comportamientos.md, «Datos que se piden»).
const TIPOS_ALIMENTO = [
  'Frutas y verduras',
  'Panadería',
  'Lácteos',
  'Cárnicos',
  'Comida preparada',
  'Granos y secos',
  'Otro',
];
const UNIDADES = ['kg', 'unidades', 'cajas', 'bultos'];

// Registra una donación en estado «disponible» y deja el movimiento de registro (trazabilidad, RNF-05).
// La donación y su movimiento se guardan juntos: o quedan los dos o no queda ninguno.
async function registrarDonacion({ donanteId, registradaPorId, tipoAlimento, cantidad, unidad, puntoRecogida, zona, horaLimite }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const donacion = await cliente.query(
      `INSERT INTO donaciones
         (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, codigo`,
      [tipoAlimento, cantidad, unidad, puntoRecogida, zona, horaLimite, donanteId, registradaPorId]
    );

    await cliente.query(
      "INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'registro', $2)",
      [donacion.rows[0].id, registradaPorId]
    );

    await cliente.query('COMMIT');
    return donacion.rows[0];
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

async function buscarPorCodigo(codigo) {
  const r = await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo]);
  return r.rows[0] || null;
}

module.exports = { TIPOS_ALIMENTO, UNIDADES, registrarDonacion, buscarPorCodigo };
