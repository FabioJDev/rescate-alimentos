// Lógica de negocio de las donaciones. Las rutas llaman a estas funciones; aquí vive el acceso a la base de datos.
const { pool, consultar } = require('../db/conexion');
const { guardarFoto } = require('./fotos');

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

// CMP-19: la organización que pidió la donación (destino), para que el voluntario sepa a dónde llevarla.
const COLUMNAS_DESTINO = `dest.nombre AS destino_nombre, dest.direccion AS destino_direccion, dest.telefono AS destino_telefono`;
const UNIR_DESTINO = 'LEFT JOIN organizaciones dest ON dest.id = d.destino_organizacion_id';

// Registra una donación en estado «disponible» y deja el movimiento de registro (trazabilidad, RNF-05).
// La donación y su movimiento se guardan juntos: o quedan los dos o no queda ninguno.
// CMP-08: si viene `idLocal` (el identificador que generó el teléfono al guardarla sin conexión) y esa donación
// ya se registró, no se crea otra: se devuelve la que ya existía con `repetida: true` (CA-08.3). La base de
// datos lo garantiza con un índice único, así que también funciona si dos envíos llegan al mismo tiempo.
async function registrarDonacion({
  donanteId,
  registradaPorId,
  tipoAlimento,
  cantidad,
  unidad,
  puntoRecogida,
  zona,
  horaLimite,
  kgAproximados = null,
  foto = null,
  idLocal = null,
  detalle = null,
}) {
  let registrada = null;

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const donacion = await cliente.query(
      `INSERT INTO donaciones
         (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id, id_local,
          kg_aproximados)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, codigo`,
      [tipoAlimento, cantidad, unidad, puntoRecogida, zona, horaLimite, donanteId, registradaPorId, idLocal, kgAproximados]
    );

    await cliente.query(
      "INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, 'registro', $2, $3)",
      [donacion.rows[0].id, registradaPorId, detalle]
    );
    // CMP-23: la foto va en la misma transacción que la donación.
    if (foto) await guardarFoto(cliente, donacion.rows[0].id, foto);

    await cliente.query('COMMIT');
    registrada = donacion.rows[0];
  } catch (error) {
    await cliente.query('ROLLBACK');
    // 23505 = violación de unicidad: ya existe una donación con este identificador local (envío repetido).
    if (!(idLocal && error.code === '23505')) throw error;
  } finally {
    // Se devuelve la conexión antes de consultar la donación existente (ver la explicación en tomarDonacion).
    cliente.release();
  }

  if (registrada) return registrada;
  return { ...(await buscarPorIdLocal(registradaPorId, idLocal)), repetida: true };
}

// CMP-08: busca una donación ya registrada con este identificador local (para no duplicarla).
async function buscarPorIdLocal(registradaPorId, idLocal) {
  const r = await consultar('SELECT id, codigo FROM donaciones WHERE registrada_por_id = $1 AND id_local = $2', [
    registradaPorId,
    idLocal,
  ]);
  return r.rows[0] || null;
}

async function buscarPorCodigo(codigo) {
  const r = await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo]);
  return r.rows[0] || null;
}

// CA-02.1 y CA-02.2: solo las donaciones «disponibles» cuya hora límite no se ha cumplido,
// de la más urgente a la menos urgente. Las asignadas, entregadas y vencidas no salen.
// Si se indica una zona, solo las de esa zona (CA-02.3).
// CA-19.7: con el destino, si una organización ya la pidió.
async function listarDisponibles({ zona = null } = {}) {
  const r = await consultar(
    `SELECT d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.punto_recogida, d.zona, d.hora_limite, ${COLUMNAS_DESTINO},
            EXISTS (SELECT 1 FROM fotos_donacion f WHERE f.donacion_id = d.id) AS tiene_foto
       FROM donaciones d
       ${UNIR_DESTINO}
      WHERE d.estado = 'disponible'
        AND d.hora_limite > now()
        AND ($1::text IS NULL OR d.zona = $1)
      ORDER BY d.hora_limite ASC, d.id ASC`,
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
// motivo: 'no_existe' | 'cancelada' | 'ya_es_tuya' | 'ya_tomada' | 'vencida' | 'disponible'
async function motivoNoDisponible(codigo, voluntarioId) {
  const r = await consultar(
    `SELECT d.*, v.nombre AS voluntario_nombre, (d.hora_limite <= now()) AS vencida,
            donante.nombre AS donante_nombre, donante.telefono AS donante_telefono, ${COLUMNAS_DESTINO}
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       LEFT JOIN usuarios v ON v.id = d.voluntario_id
       ${UNIR_DESTINO}
      WHERE d.codigo = $1`,
    [codigo]
  );
  const donacion = r.rows[0];

  if (!donacion) return { motivo: 'no_existe' };
  if (donacion.estado === 'cancelada') return { motivo: 'cancelada', donacion };
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
            donante.nombre AS donante_nombre, donante.telefono AS donante_telefono,
            voluntario.nombre AS voluntario_nombre, voluntario.telefono AS voluntario_telefono,
            org.nombre AS organizacion_nombre, org.telefono AS organizacion_telefono,
            (d.estado = 'disponible' AND d.hora_limite <= now()) AS vencida, ${COLUMNAS_DESTINO},
            (SELECT f.bytes FROM fotos_donacion f WHERE f.donacion_id = d.id) AS foto_bytes
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       LEFT JOIN usuarios voluntario ON voluntario.id = d.voluntario_id
       LEFT JOIN organizaciones org ON org.id = d.organizacion_id
       ${UNIR_DESTINO}
      WHERE d.codigo = $1`,
    [codigo]
  );
  const donacion = r.rows[0];
  if (!donacion) return null;

  const movimientos = await consultar(
    `SELECT m.tipo, m.ocurrido_en, m.detalle, u.nombre AS usuario_nombre
       FROM movimientos m
       JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.donacion_id = $1
      ORDER BY m.ocurrido_en ASC, m.id ASC`,
    [donacion.id]
  );

  return { donacion, historial: movimientos.rows };
}

// «Mis recogidas»: las donaciones que este voluntario tomó y todavía no entregó, con el teléfono del comercio
// para poder llamarlo (CA-15.1).
async function listarRecogidasDe(voluntarioId) {
  const r = await consultar(
    `SELECT d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.punto_recogida, d.zona, d.hora_limite, d.tomada_en,
            donante.nombre AS donante_nombre, donante.telefono AS donante_telefono, ${COLUMNAS_DESTINO}
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       ${UNIR_DESTINO}
      WHERE d.voluntario_id = $1 AND d.estado = 'asignada'
      ORDER BY d.hora_limite ASC, d.id ASC`,
    [voluntarioId]
  );
  return r.rows;
}

module.exports = {
  TIPOS_ALIMENTO,
  UNIDADES,
  registrarDonacion,
  buscarPorIdLocal,
  buscarPorCodigo,
  listarDisponibles,
  tomarDonacion,
  motivoNoDisponible,
  listarRecogidasDe,
  obtenerDetalle,
};
