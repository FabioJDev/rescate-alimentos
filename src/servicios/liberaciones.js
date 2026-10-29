// CMP-06 · Soltar una donación que el voluntario tomó y no puede recoger.
const { pool, consultar } = require('../db/conexion');

// Dice si este voluntario puede soltar la donación y, si no, por qué. No modifica nada.
// motivo: 'no_existe' | 'ya_entregada' | 'no_asignada' | 'otro_voluntario' | 'puede'
async function motivoLiberacion(codigo, voluntarioId) {
  const r = await consultar(
    `SELECT d.*, org.nombre AS organizacion_nombre
       FROM donaciones d
       LEFT JOIN organizaciones org ON org.id = d.organizacion_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  const donacion = r.rows[0];

  if (!donacion) return { motivo: 'no_existe' };
  if (donacion.estado === 'entregada') return { motivo: 'ya_entregada', donacion };
  if (donacion.estado !== 'asignada') return { motivo: 'no_asignada', donacion };
  if (donacion.voluntario_id !== voluntarioId) return { motivo: 'otro_voluntario', donacion };
  return { motivo: 'puede', donacion };
}

// CA-06.1: la donación vuelve a «disponible». Es UNA actualización condicional, igual que tomar y entregar
// (ADR-001): solo cambia si sigue «asignada» y es de este voluntario. Así, si en el mismo instante alguien
// registra la entrega, la base de datos los pone en fila y solo una de las dos acciones gana (CA-06.7).
// CA-06.5: no se mira la hora límite; si ya pasó, queda «Vencida (no recogida)» al consultarla.
async function soltarDonacion(codigo, voluntarioId) {
  let soltada = null;

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const actualizada = await cliente.query(
      `UPDATE donaciones
          SET estado = 'disponible', voluntario_id = NULL, tomada_en = NULL
        WHERE codigo = $1 AND estado = 'asignada' AND voluntario_id = $2
        RETURNING *`,
      [codigo, voluntarioId]
    );

    if (actualizada.rows.length === 0) {
      await cliente.query('ROLLBACK');
    } else {
      // El movimiento va en la misma transacción: o quedan los dos cambios o ninguno (RNF-05).
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'liberacion', $2)", [
        actualizada.rows[0].id,
        voluntarioId,
      ]);
      await cliente.query('COMMIT');
      soltada = actualizada.rows[0];
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    // Se devuelve la conexión antes de consultar el motivo (ver la explicación en tomarDonacion).
    cliente.release();
  }

  if (soltada) return { soltada: true, donacion: soltada };
  return { soltada: false, ...(await motivoLiberacion(codigo, voluntarioId)) };
}

module.exports = { motivoLiberacion, soltarDonacion };
