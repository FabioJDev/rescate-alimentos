// CMP-14 · La coordinadora interviene en una donación: la libera, la asigna (o reasigna) a un voluntario o
// registra la entrega en su nombre. Igual que tomar (ADR-001), cada acción es UNA actualización condicional que
// además exige que la donación siga con el voluntario que la coordinadora vio al abrir la pantalla
// (`voluntarioVisto`). Si alguien la cambió mientras decidía, no se toca nada (CA-14.6).
const { pool, consultar } = require('../db/conexion');

async function obtenerParaIntervenir(codigo) {
  const r = await consultar(
    `SELECT d.*, v.nombre AS voluntario_nombre, org.nombre AS organizacion_nombre,
            (d.hora_limite <= now()) AS hora_cumplida
       FROM donaciones d
       LEFT JOIN usuarios v ON v.id = d.voluntario_id
       LEFT JOIN organizaciones org ON org.id = d.organizacion_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  return r.rows[0] || null;
}

// Los voluntarios que se pueden elegir: solo los activos (CA-14.3).
async function listarVoluntariosActivos() {
  const r = await consultar("SELECT id, nombre, zona FROM usuarios WHERE rol = 'voluntario' AND activo ORDER BY nombre");
  return r.rows;
}

// El id del voluntario que traía el formulario: un número, o null si la donación no tenía voluntario.
function leerVoluntarioVisto(texto) {
  const n = Number(texto);
  return texto && Number.isInteger(n) ? n : null;
}

// Por qué no se puede hacer una acción sobre la donación. No modifica nada.
// motivo: 'no_existe' | 'cancelada' | 'ya_entregada' | 'no_asignada' | 'cambio' | 'puede'
function motivoSobre(donacion, { exigeAsignada, voluntarioVisto }) {
  if (!donacion) return 'no_existe';
  if (donacion.estado === 'cancelada') return 'cancelada';
  if (donacion.estado === 'entregada') return 'ya_entregada';
  if (exigeAsignada && donacion.estado !== 'asignada') return voluntarioVisto === undefined ? 'no_asignada' : 'cambio';
  if (voluntarioVisto !== undefined && (donacion.voluntario_id || null) !== voluntarioVisto) return 'cambio';
  return 'puede';
}

// CA-14.1: vuelve a «disponible»; el historial dice quién la liberó y a quién se la quitó.
async function liberar(codigo, coordinadora, voluntarioVistoTexto) {
  const voluntarioVisto = leerVoluntarioVisto(voluntarioVistoTexto);
  const antes = await obtenerParaIntervenir(codigo);
  const motivo = motivoSobre(antes, { exigeAsignada: true, voluntarioVisto });
  if (motivo !== 'puede') return { motivo, donacion: antes };

  let hecha = false;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await cliente.query(
      `UPDATE donaciones SET estado = 'disponible', voluntario_id = NULL, tomada_en = NULL
        WHERE codigo = $1 AND estado = 'asignada' AND voluntario_id = $2
        RETURNING id`,
      [codigo, voluntarioVisto]
    );
    if (r.rows.length === 0) {
      await cliente.query('ROLLBACK');
    } else {
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, 'liberacion', $2, $3)", [
        r.rows[0].id,
        coordinadora.id,
        `la tenía ${antes.voluntario_nombre}`,
      ]);
      await cliente.query('COMMIT');
      hecha = true;
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  if (hecha) return { motivo: 'hecho', donacion: antes };
  const ahora = await obtenerParaIntervenir(codigo);
  return { motivo: motivoSobre(ahora, { exigeAsignada: true, voluntarioVisto }), donacion: ahora };
}

// CA-14.2 y CA-14.3: asigna a un voluntario activo una donación disponible o asignada a otro.
async function asignar(codigo, coordinadora, voluntarioIdTexto, voluntarioVistoTexto) {
  const voluntarioVisto = leerVoluntarioVisto(voluntarioVistoTexto);
  const antes = await obtenerParaIntervenir(codigo);
  const motivo = motivoSobre(antes, { exigeAsignada: false, voluntarioVisto });
  if (motivo !== 'puede') return { motivo, donacion: antes };
  if (antes.hora_cumplida) return { motivo: 'vencida', donacion: antes };

  const voluntario = (await listarVoluntariosActivos()).find((v) => String(v.id) === String(voluntarioIdTexto || '').trim());
  if (!voluntario) return { motivo: 'elige_voluntario', donacion: antes };
  if (voluntario.id === antes.voluntario_id) return { motivo: 'mismo_voluntario', donacion: antes };

  let hecha = false;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await cliente.query(
      `UPDATE donaciones SET estado = 'asignada', voluntario_id = $1, tomada_en = now()
        WHERE codigo = $2 AND estado IN ('disponible', 'asignada') AND hora_limite > now()
          AND voluntario_id IS NOT DISTINCT FROM $3
        RETURNING id`,
      [voluntario.id, codigo, voluntarioVisto]
    );
    if (r.rows.length === 0) {
      await cliente.query('ROLLBACK');
    } else {
      // La frase completa del historial (CA-14.2).
      const detalle = `Asignada a ${voluntario.nombre} por ${coordinadora.nombre}${
        antes.voluntario_nombre ? `; antes la tenía ${antes.voluntario_nombre}` : ''
      }`;
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, 'asignacion', $2, $3)", [
        r.rows[0].id,
        coordinadora.id,
        detalle,
      ]);
      await cliente.query('COMMIT');
      hecha = true;
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  if (hecha) return { motivo: 'hecho', donacion: antes, voluntario };
  const ahora = await obtenerParaIntervenir(codigo);
  const nuevoMotivo = motivoSobre(ahora, { exigeAsignada: false, voluntarioVisto });
  return { motivo: nuevoMotivo === 'puede' ? 'vencida' : nuevoMotivo, donacion: ahora };
}

module.exports = { obtenerParaIntervenir, listarVoluntariosActivos, leerVoluntarioVisto, motivoSobre, liberar, asignar };
