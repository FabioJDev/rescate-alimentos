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
  let donacionTomada = null;

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
      // Nadie ganó esta vez: no se cambió nada.
      await cliente.query('ROLLBACK');
    } else {
      // El movimiento de la toma va en la misma transacción: o quedan los dos cambios o ninguno (RNF-05).
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'toma', $2)", [
        actualizada.rows[0].id,
        voluntarioId,
      ]);
      await cliente.query('COMMIT');
      donacionTomada = actualizada.rows[0];
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    // Se devuelve la conexión ANTES de consultar el motivo: si cada petición retuviera una conexión
    // mientras pide otra, con muchas tomas simultáneas el conjunto de conexiones se agotaría y se colgaría.
    cliente.release();
  }

  if (donacionTomada) return { tomada: true, donacion: donacionTomada };

  // Se averigua por qué no se pudo para dar el mensaje correcto (ya tomada, vencida, reintento...).
  return { tomada: false, ...(await motivoNoDisponible(codigo, voluntarioId)) };
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

// CMP-05 · Detalle de una donación: sus datos, su estado actual y su historial en orden cronológico.
// «Vencida» no se guarda: se calcula aquí (disponible + hora límite cumplida), con la hora de la base de datos.
async function obtenerDetalle(codigo) {
  const r = await consultar(
    `SELECT d.*,
            donante.nombre AS donante_nombre,
            voluntario.nombre AS voluntario_nombre,
            org.nombre AS organizacion_nombre,
            (d.estado = 'disponible' AND d.hora_limite <= now()) AS vencida
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       LEFT JOIN usuarios voluntario ON voluntario.id = d.voluntario_id
       LEFT JOIN organizaciones org ON org.id = d.organizacion_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  const donacion = r.rows[0];
  if (!donacion) return null;

  const movimientos = await consultar(
    `SELECT m.tipo, m.ocurrido_en, u.nombre AS usuario_nombre
       FROM movimientos m
       JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.donacion_id = $1
      ORDER BY m.ocurrido_en ASC, m.id ASC`,
    [donacion.id]
  );

  return { donacion, historial: movimientos.rows };
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
  obtenerDetalle,
};
