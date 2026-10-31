// CMP-04 · Registrar la entrega a la organización receptora.
const { pool, consultar } = require('../db/conexion');

// Solo las activas: una organización desactivada no se puede elegir al entregar (CA-12.5).
async function listarOrganizaciones() {
  const r = await consultar('SELECT id, nombre, zona, refrigeracion, telefono FROM organizaciones WHERE activa ORDER BY nombre');
  return r.rows;
}

// Dice si este voluntario puede registrar la entrega de la donación y, si no, por qué. No modifica nada.
// motivo: 'no_existe' | 'ya_entregada' | 'no_asignada' | 'otro_voluntario' | 'puede'
async function motivoEntrega(codigo, voluntarioId) {
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

// CA-04.3: la organización y quien recibe son obligatorias. Devuelve un mensaje por cada campo con problema.
function validarEntrega(cuerpo, organizaciones) {
  const errores = {};
  const organizacionTexto = (cuerpo.organizacion_id || '').trim();
  const recibidoPor = (cuerpo.recibido_por || '').trim();

  let organizacionId = null;
  if (!organizacionTexto) {
    errores.organizacion_id = 'Falta elegir la organización que recibe.';
  } else {
    organizacionId = Number(organizacionTexto);
    if (!organizaciones.some((o) => o.id === organizacionId)) errores.organizacion_id = 'Elige una organización de la lista.';
  }

  if (!recibidoPor) errores.recibido_por = 'Falta el nombre de quien recibe.';
  else if (recibidoPor.length > 100) errores.recibido_por = 'El nombre de quien recibe es muy largo.';

  return {
    errores,
    valores: { organizacion_id: organizacionTexto, recibido_por: recibidoPor },
    datos: { organizacionId, recibidoPor },
  };
}

// CA-04.1 y CA-04.2: pasa la donación a «entregada». Una sola actualización condicional, igual que la toma
// (ADR-001): solo cambia si sigue «asignada» y es de este voluntario. La fecha y hora las pone el servidor
// (now()); el usuario no las puede escribir. El movimiento va en la misma transacción (RNF-05).
// CA-04.6: no se mira la hora límite; aplica a la recogida, no a la entrega.
async function registrarEntrega({ codigo, voluntarioId, organizacionId, recibidoPor }) {
  let entregada = null;

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const actualizada = await cliente.query(
      `UPDATE donaciones
          SET estado = 'entregada', organizacion_id = $1, recibido_por = $2, entregada_en = now()
        WHERE codigo = $3 AND estado = 'asignada' AND voluntario_id = $4
        RETURNING *`,
      [organizacionId, recibidoPor, codigo, voluntarioId]
    );

    if (actualizada.rows.length === 0) {
      await cliente.query('ROLLBACK');
    } else {
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'entrega', $2)", [
        actualizada.rows[0].id,
        voluntarioId,
      ]);
      await cliente.query('COMMIT');
      entregada = actualizada.rows[0];
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    // Se devuelve la conexión antes de consultar el motivo (ver la explicación en tomarDonacion).
    cliente.release();
  }

  if (entregada) return { entregada: true, donacion: entregada };
  return { entregada: false, ...(await motivoEntrega(codigo, voluntarioId)) };
}

module.exports = { listarOrganizaciones, motivoEntrega, validarEntrega, registrarEntrega };
