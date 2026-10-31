// CMP-13 · Corregir o cancelar una donación. Igual que tomar (ADR-001), cada cambio es UNA actualización
// condicional: solo cambia si la donación sigue en el estado que se revisó. Si en el mismo instante un voluntario
// la toma, la base de datos los pone en fila y solo una de las dos acciones gana (CA-13.8).
const { pool, consultar } = require('../db/conexion');
const { validarDonacion } = require('./validar-donacion');
const { formatearFechaHora } = require('../utilidades/fechas');

async function buscarConOrganizacion(codigo) {
  const r = await consultar(
    `SELECT d.*, org.nombre AS organizacion_nombre, (d.estado = 'disponible' AND d.hora_limite <= now()) AS vencida
       FROM donaciones d
       LEFT JOIN organizaciones org ON org.id = d.organizacion_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  return r.rows[0] || null;
}

// Estados en que cada rol puede corregir o cancelar (CA-13.1, CA-13.3 y CA-13.6).
const PERMITIDOS = {
  corregir: { donante: ['disponible'], coordinadora: ['disponible', 'asignada', 'entregada'] },
  cancelar: { donante: ['disponible'], coordinadora: ['disponible', 'asignada'] },
};

// Para mostrar u ocultar los botones «Corregir» y «Cancelar» en el detalle. La decisión real se toma al enviar.
function puedeCambiar(accion, donacion, usuario) {
  if (usuario.rol === 'donante' && donacion.donante_id !== usuario.id) return false;
  return (PERMITIDOS[accion][usuario.rol] || []).includes(donacion.estado);
}

// Dice si este usuario puede corregir o cancelar la donación y, si no, por qué. No modifica nada.
// motivo: 'no_existe' | 'no_es_suya' | 'cancelada' | 'ya_entregada' | 'ya_tomada' | 'puede'
async function motivoCambio(accion, codigo, usuario) {
  const donacion = await buscarConOrganizacion(codigo);
  if (!donacion) return { motivo: 'no_existe' };
  if (usuario.rol === 'donante' && donacion.donante_id !== usuario.id) return { motivo: 'no_es_suya', donacion };
  if (puedeCambiar(accion, donacion, usuario)) return { motivo: 'puede', donacion };
  if (donacion.estado === 'cancelada') return { motivo: 'cancelada', donacion };
  if (donacion.estado === 'entregada') return { motivo: 'ya_entregada', donacion };
  return { motivo: 'ya_tomada', donacion };
}

// Texto para quien no puede hacer el cambio (CA-13.4 y CA-13.7).
function mensajeDeRechazo(motivo, donacion) {
  if (motivo === 'cancelada') return 'Esta donación ya fue cancelada.';
  if (motivo === 'ya_entregada') {
    return `Esta donación ya fue entregada el ${formatearFechaHora(donacion.entregada_en)} a ${donacion.organizacion_nombre}.`;
  }
  if (motivo === 'ya_tomada') return 'Esta donación ya fue tomada; para cambiarla habla con la coordinadora.';
  if (motivo === 'no_es_suya') return 'Esta donación no es tuya.';
  return 'No existe una donación con ese código';
}

function textoDeCantidad(cantidad, unidad) {
  return `${Number(cantidad)} ${unidad}`;
}

// CA-13.1 a CA-13.5. Devuelve { errores, valores }, { sinCambios }, { rechazo } o { corregida }.
async function corregirDonacion(codigo, usuario, cuerpo) {
  const info = await motivoCambio('corregir', codigo, usuario);
  if (info.motivo !== 'puede') return { rechazo: info };
  const actual = info.donacion;

  // La hora límite solo se cambia mientras nadie la ha tomado (CA-13.3).
  const editaHora = actual.estado === 'disponible';
  const { errores, valores, datos } = validarDonacion(cuerpo);
  if (!editaHora) delete errores.hora_limite;
  if (Object.keys(errores).length > 0) return { errores, valores, donacion: actual, editaHora };

  // El formulario trabaja en minutos y la hora guardada puede tener segundos: si es el mismo minuto, no cambió.
  const minuto = (fecha) => Math.floor(new Date(fecha).getTime() / 60000);
  const horaEscrita = editaHora ? new Date(datos.horaLimite) : null;
  const nueva = {
    tipo: datos.tipoAlimento,
    cantidad: datos.cantidad,
    unidad: datos.unidad,
    punto: datos.puntoRecogida,
    hora: horaEscrita && minuto(horaEscrita) !== minuto(actual.hora_limite) ? horaEscrita : new Date(actual.hora_limite),
    kg: datos.kgAproximados, // CA-22.4
  };
  const kgAntes = actual.kg_aproximados === null ? null : Number(actual.kg_aproximados);

  // CA-13.1: el historial dice qué cambió, de qué a qué.
  const cambios = [];
  if (nueva.tipo !== actual.tipo_alimento) cambios.push(`Tipo: ${actual.tipo_alimento} → ${nueva.tipo}`);
  if (nueva.cantidad !== Number(actual.cantidad) || nueva.unidad !== actual.unidad) {
    cambios.push(`Cantidad: ${textoDeCantidad(actual.cantidad, actual.unidad)} → ${textoDeCantidad(nueva.cantidad, nueva.unidad)}`);
  }
  if (nueva.punto !== actual.punto_recogida) cambios.push(`Punto de recogida: ${actual.punto_recogida} → ${nueva.punto}`);
  if (nueva.hora.getTime() !== new Date(actual.hora_limite).getTime()) {
    cambios.push(`Hora límite: ${formatearFechaHora(actual.hora_limite)} → ${formatearFechaHora(nueva.hora)}`);
  }
  if (nueva.kg !== kgAntes) {
    const texto = (kg) => (kg === null ? 'sin peso' : `${kg} kg`);
    cambios.push(`Peso aproximado: ${texto(kgAntes)} → ${texto(nueva.kg)}`);
  }
  if (cambios.length === 0) return { sinCambios: true, valores, donacion: actual, editaHora };

  let corregida = null;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await cliente.query(
      `UPDATE donaciones
          SET tipo_alimento = $1, cantidad = $2, unidad = $3, punto_recogida = $4, hora_limite = $5, kg_aproximados = $8
        WHERE codigo = $6 AND estado = $7
        RETURNING id, codigo`,
      [nueva.tipo, nueva.cantidad, nueva.unidad, nueva.punto, nueva.hora, codigo, actual.estado, nueva.kg]
    );
    if (r.rows.length === 0) {
      await cliente.query('ROLLBACK');
    } else {
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, 'correccion', $2, $3)", [
        r.rows[0].id,
        usuario.id,
        cambios.join('; '),
      ]);
      await cliente.query('COMMIT');
      corregida = r.rows[0];
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  if (corregida) return { corregida };
  // Alguien la cambió entre la revisión y la actualización (por ejemplo, un voluntario la tomó): CA-13.8.
  return { rechazo: await motivoCambio('corregir', codigo, usuario) };
}

// CA-13.6 a CA-13.8. Devuelve { rechazo }, { errores } o { cancelada }.
async function cancelarDonacion(codigo, usuario, motivoTexto) {
  const info = await motivoCambio('cancelar', codigo, usuario);
  if (info.motivo !== 'puede') return { rechazo: info };

  const motivo = (motivoTexto || '').trim();
  if (!motivo) return { errores: { motivo: 'Falta el motivo de la cancelación.' }, donacion: info.donacion };
  if (motivo.length > 200) return { errores: { motivo: 'El motivo es muy largo.' }, donacion: info.donacion };

  let cancelada = null;
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await cliente.query(
      `UPDATE donaciones SET estado = 'cancelada', motivo_cancelacion = $1, cancelada_en = now()
        WHERE codigo = $2 AND estado = $3
        RETURNING id, codigo`,
      [motivo, codigo, info.donacion.estado]
    );
    if (r.rows.length === 0) {
      await cliente.query('ROLLBACK');
    } else {
      await cliente.query("INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, 'cancelacion', $2, $3)", [
        r.rows[0].id,
        usuario.id,
        motivo,
      ]);
      await cliente.query('COMMIT');
      cancelada = r.rows[0];
    }
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  if (cancelada) return { cancelada };
  return { rechazo: await motivoCambio('cancelar', codigo, usuario) };
}

module.exports = { puedeCambiar, motivoCambio, mensajeDeRechazo, corregirDonacion, cancelarDonacion };
