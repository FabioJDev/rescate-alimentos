// CMP-19 · Las organizaciones receptoras usan la aplicación: ven lo compatible, lo piden y saben qué les llega.
// Pedir es UNA actualización condicional (ADR-001): solo cambia si nadie la ha pedido todavía, así que si dos
// organizaciones piden la misma donación al mismo tiempo, exactamente una queda como destino (CA-19.4).
const { pool, consultar } = require('../db/conexion');

// RF-05: sin refrigeración, una organización no recibe estos tipos (decisión del equipo; Marcela puede cambiarla).
const NECESITAN_REFRIGERACION = ['Lácteos', 'Cárnicos'];

async function organizacionDe(usuario) {
  const r = await consultar('SELECT id, nombre, direccion, refrigeracion FROM organizaciones WHERE id = $1', [usuario.organizacionId]);
  return r.rows[0];
}

// Una donación se puede pedir si sigue disponible (sin vencer) o ya va en camino, y nadie la ha pedido.
const SE_PUEDE_PEDIR = `d.destino_organizacion_id IS NULL
   AND (d.estado = 'asignada' OR (d.estado = 'disponible' AND d.hora_limite > now()))`;

// CA-19.2: lo que esta organización puede pedir, de lo más urgente a lo menos urgente.
async function listarParaRecibir(organizacion) {
  const r = await consultar(
    `SELECT d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.zona, d.hora_limite, d.estado, d.punto_recogida
       FROM donaciones d
      WHERE ${SE_PUEDE_PEDIR}
        AND ($1 OR d.tipo_alimento <> ALL($2))
      ORDER BY d.hora_limite ASC, d.id ASC`,
    [organizacion.refrigeracion, NECESITAN_REFRIGERACION]
  );
  return r.rows;
}

// CA-19.5: lo que viene para esta organización y todavía no se entrega.
async function listarQueVienen(organizacion) {
  const r = await consultar(
    `SELECT d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.hora_limite, d.estado, d.tomada_en, d.punto_recogida,
            v.nombre AS voluntario_nombre, v.telefono AS voluntario_telefono
       FROM donaciones d
       LEFT JOIN usuarios v ON v.id = d.voluntario_id
      WHERE d.destino_organizacion_id = $1 AND d.estado IN ('disponible', 'asignada')
      ORDER BY d.hora_limite ASC, d.id ASC`,
    [organizacion.id]
  );
  return r.rows;
}

// CA-19.8: lo que recibió esta organización en los últimos 30 días.
async function listarRecibidas(organizacion) {
  const r = await consultar(
    `SELECT d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.entregada_en, d.recibido_por, v.nombre AS voluntario_nombre
       FROM donaciones d
       JOIN usuarios v ON v.id = d.voluntario_id
      WHERE d.organizacion_id = $1 AND d.estado = 'entregada' AND d.entregada_en > now() - interval '30 days'
      ORDER BY d.entregada_en DESC`,
    [organizacion.id]
  );
  return r.rows;
}

async function buscarParaPedir(codigo) {
  const r = await consultar(
    `SELECT d.*, dest.nombre AS destino_nombre, (d.hora_limite <= now()) AS hora_cumplida
       FROM donaciones d
       LEFT JOIN organizaciones dest ON dest.id = d.destino_organizacion_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  return r.rows[0] || null;
}

// Por qué esta organización no puede pedir la donación. No modifica nada.
// motivo: 'no_existe' | 'ya_es_nuestra' | 'ya_pedida' | 'no_compatible' | 'no_disponible' | 'puede'
function motivoPedido(donacion, organizacion) {
  if (!donacion) return 'no_existe';
  if (donacion.destino_organizacion_id === organizacion.id) return 'ya_es_nuestra';
  if (donacion.destino_organizacion_id) return 'ya_pedida';
  const sigue = donacion.estado === 'asignada' || (donacion.estado === 'disponible' && !donacion.hora_cumplida);
  if (!sigue) return 'no_disponible';
  if (!organizacion.refrigeracion && NECESITAN_REFRIGERACION.includes(donacion.tipo_alimento)) return 'no_compatible';
  return 'puede';
}

// Una actualización condicional y su movimiento, en la misma transacción.
async function actualizarConMovimiento(sqlActualizar, parametros, tipoMovimiento, usuarioId, detalle) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await cliente.query(sqlActualizar, parametros);
    if (r.rows.length === 0) {
      await cliente.query('ROLLBACK');
      return false;
    }
    await cliente.query('INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, $2, $3, $4)', [
      r.rows[0].id,
      tipoMovimiento,
      usuarioId,
      detalle,
    ]);
    await cliente.query('COMMIT');
    return true;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

// CA-19.3 y CA-19.4: pedir la donación para esta organización.
async function pedirDonacion(codigo, usuario) {
  const organizacion = await organizacionDe(usuario);
  const antes = await buscarParaPedir(codigo);
  const motivo = motivoPedido(antes, organizacion);
  if (motivo !== 'puede') return { motivo, donacion: antes };

  const hecho = await actualizarConMovimiento(
    `UPDATE donaciones d SET destino_organizacion_id = $1
      WHERE d.codigo = $2 AND ${SE_PUEDE_PEDIR}
      RETURNING d.id`,
    [organizacion.id, codigo],
    'solicitud',
    usuario.id,
    organizacion.nombre
  );
  if (hecho) return { motivo: 'hecho', donacion: antes };
  const ahora = await buscarParaPedir(codigo);
  return { motivo: motivoPedido(ahora, organizacion), donacion: ahora };
}

// CA-19.6: la organización ya no la necesita; vuelve a quedar sin destino.
async function retirarSolicitud(codigo, usuario) {
  const organizacion = await organizacionDe(usuario);
  const hecho = await actualizarConMovimiento(
    `UPDATE donaciones SET destino_organizacion_id = NULL
      WHERE codigo = $1 AND destino_organizacion_id = $2 AND estado IN ('disponible', 'asignada')
      RETURNING id`,
    [codigo, organizacion.id],
    'retiro_solicitud',
    usuario.id,
    organizacion.nombre
  );
  return { hecho, donacion: await buscarParaPedir(codigo) };
}

module.exports = {
  NECESITAN_REFRIGERACION,
  organizacionDe,
  listarParaRecibir,
  listarQueVienen,
  listarRecibidas,
  buscarParaPedir,
  motivoPedido,
  pedirDonacion,
  retirarSolicitud,
};
