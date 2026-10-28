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

// CA-02.1 y CA-02.2: solo las donaciones «disponibles» cuya hora límite no se ha cumplido,
// de la más urgente a la menos urgente. Las asignadas, entregadas y vencidas no salen.
// Si se indica una zona, solo las de esa zona (CA-02.3).
async function listarDisponibles({ zona = null } = {}) {
  const r = await consultar(
    `SELECT codigo, tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite
       FROM donaciones
      WHERE estado = 'disponible'
        AND hora_limite > now()
        AND ($1::text IS NULL OR zona = $1)
      ORDER BY hora_limite ASC, id ASC`,
    [zona]
  );
  return r.rows;
}

// CMP-03 · Tomar una donación (ADR-001).
// La toma es UNA sola actualización atómica en la base de datos: solo cambia la fila si la donación
// sigue «disponible» y su hora límite no se ha cumplido. Si dos voluntarios pulsan a la vez, la base
// de datos los pone en fila: el primero cambia el estado y el segundo ya no cumple la condición,
// así que su actualización no toca nada. No se lee primero y se escribe después: así no hay carrera.
async function tomarDonacion(codigo, voluntarioId) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const actualizada = await cliente.query(
      `UPDATE donaciones
          SET estado = 'asignada', voluntario_id = $1, tomada_en = now()
        WHERE codigo = $2 AND estado = 'disponible' AND hora_limite > now()
        RETURNING *`,
      [voluntarioId, codigo]
    );

    if (actualizada.rows.length === 0) {
      // Nadie ganó esta vez: no se cambió nada. Se averigua por qué para dar el mensaje correcto.
      await cliente.query('ROLLBACK');
      return { tomada: false, ...(await motivoNoDisponible(codigo, voluntarioId)) };
    }

    // El movimiento de la toma va en la misma transacción: o quedan los dos cambios o ninguno (RNF-05).
    await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'toma', $2)", [
      actualizada.rows[0].id,
      voluntarioId,
    ]);

    await cliente.query('COMMIT');
    return { tomada: true, donacion: actualizada.rows[0] };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// Explica por qué una donación no se puede tomar (o si todavía se puede). No modifica nada.
// motivo: 'no_existe' | 'ya_es_tuya' | 'ya_tomada' | 'vencida' | 'disponible'
async function motivoNoDisponible(codigo, voluntarioId) {
  const r = await consultar(
    `SELECT d.*, v.nombre AS voluntario_nombre, (d.hora_limite <= now()) AS vencida
       FROM donaciones d
       LEFT JOIN usuarios v ON v.id = d.voluntario_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  const donacion = r.rows[0];

  if (!donacion) return { motivo: 'no_existe' };
  if (donacion.estado !== 'disponible') {
    // CA-03.5: si ya la tomó esta misma persona (doble clic o reintento), no es un error.
    if (donacion.voluntario_id === voluntarioId) return { motivo: 'ya_es_tuya', donacion };
    return { motivo: 'ya_tomada', donacion };
  }
  if (donacion.vencida) return { motivo: 'vencida', donacion };
  return { motivo: 'disponible', donacion };
}

// «Mis recogidas»: las donaciones que este voluntario tomó y todavía no entregó.
async function listarRecogidasDe(voluntarioId) {
  const r = await consultar(
    `SELECT codigo, tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, tomada_en
       FROM donaciones
      WHERE voluntario_id = $1 AND estado = 'asignada'
      ORDER BY hora_limite ASC, id ASC`,
    [voluntarioId]
  );
  return r.rows;
}

module.exports = {
  TIPOS_ALIMENTO,
  UNIDADES,
  registrarDonacion,
  buscarPorCodigo,
  listarDisponibles,
  tomarDonacion,
  motivoNoDisponible,
  listarRecogidasDe,
};
