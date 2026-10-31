// CMP-20 · Personas atendidas, sin doble conteo: una cifra por organización y por día.
const { consultar } = require('../db/conexion');
const { hoyEnColombia } = require('./reporte');

const MAXIMO_PERSONAS = 5000;
const DIAS_HACIA_ATRAS = 60;

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// «2026-10-31» → «31/10/2026», como se lee en Colombia.
function fechaLegible(fecha) {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

// CA-20.3 y CA-20.4. Para la coordinadora, `organizaciones` es la lista activa entre la que elige; para una
// organización es null y se usa la suya (CA-20.6: una organización solo registra para sí misma).
function validarAtencion(cuerpo, { organizaciones = null, organizacionPropiaId = null, ahora = new Date() } = {}) {
  const errores = {};
  const hoy = hoyEnColombia(ahora);
  const fecha = (cuerpo.fecha || '').trim() || hoy;
  const personasTexto = (cuerpo.personas || '').trim();
  const organizacionTexto = (cuerpo.organizacion_id || '').trim();

  let organizacionId = organizacionPropiaId;
  if (organizaciones) {
    const elegida = organizaciones.find((o) => String(o.id) === organizacionTexto);
    if (!organizacionTexto) errores.organizacion_id = 'Falta elegir la organización.';
    else if (!elegida) errores.organizacion_id = 'Elige una organización de la lista.';
    else organizacionId = elegida.id;
  }

  const d = new Date(`${fecha}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
    errores.fecha = 'La fecha no es válida.';
  } else if (fecha > hoy) {
    errores.fecha = 'La fecha no puede ser futura.';
  } else if (fecha < sumarDias(hoy, -DIAS_HACIA_ATRAS)) {
    errores.fecha = `Solo se pueden registrar los últimos ${DIAS_HACIA_ATRAS} días.`;
  }

  let personas = null;
  if (!personasTexto) errores.personas = 'Falta el número de personas atendidas.';
  else if (!/^\d+$/.test(personasTexto)) errores.personas = 'Escribe un número entero, sin decimales.';
  else {
    personas = Number(personasTexto);
    if (personas <= 0) errores.personas = 'El número de personas debe ser mayor que cero.';
    else if (personas > MAXIMO_PERSONAS) errores.personas = `El número parece muy alto (máximo ${MAXIMO_PERSONAS}). Revísalo.`;
  }

  return {
    errores,
    valores: { fecha, personas: personasTexto, organizacion_id: organizacionTexto },
    datos: { organizacionId, fecha, personas },
  };
}

// CA-20.1 y CA-20.2: si ya hay una cifra para esa organización y ese día, NO se suma: se devuelve la que existe.
// La restricción única de la base lo garantiza aunque dos personas registren al mismo tiempo.
async function registrarAtencion({ organizacionId, fecha, personas }, usuarioId) {
  const r = await consultar(
    `INSERT INTO atenciones (organizacion_id, fecha, personas, registrada_por_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ON CONSTRAINT una_por_organizacion_y_dia DO NOTHING
     RETURNING id`,
    [organizacionId, fecha, personas, usuarioId]
  );
  if (r.rows.length > 0) return { registrada: true };
  const existente = await consultar('SELECT personas FROM atenciones WHERE organizacion_id = $1 AND fecha = $2', [organizacionId, fecha]);
  return { registrada: false, existentes: existente.rows[0].personas };
}

// CA-20.2: corregir reemplaza la cifra (no la suma) y guarda quién y cuándo.
async function corregirAtencion({ organizacionId, fecha, personas }, usuarioId) {
  const r = await consultar(
    `UPDATE atenciones SET personas = $3, corregida_por_id = $4, corregida_en = now()
      WHERE organizacion_id = $1 AND fecha = $2 RETURNING id`,
    [organizacionId, fecha, personas, usuarioId]
  );
  return r.rows.length > 0;
}

// Las cifras de los últimos 30 días (de una organización, o de todas para la coordinadora).
async function listarRecientes(organizacionId = null) {
  const r = await consultar(
    `SELECT a.fecha::text AS fecha, a.personas, o.nombre AS organizacion, u.nombre AS registrada_por,
            c.nombre AS corregida_por
       FROM atenciones a
       JOIN organizaciones o ON o.id = a.organizacion_id
       JOIN usuarios u ON u.id = a.registrada_por_id
       LEFT JOIN usuarios c ON c.id = a.corregida_por_id
      WHERE ($1::int IS NULL OR a.organizacion_id = $1) AND a.fecha >= current_date - 30
      ORDER BY a.fecha DESC, o.nombre`,
    [organizacionId]
  );
  return r.rows;
}

// CA-20.5: el total de atenciones del periodo (por fecha de atención) y el detalle por organización.
async function resumenDelPeriodo(desde, hasta) {
  const r = await consultar(
    `SELECT o.nombre, sum(a.personas)::int AS personas, count(*)::int AS dias
       FROM atenciones a
       JOIN organizaciones o ON o.id = a.organizacion_id
      WHERE a.fecha BETWEEN $1::date AND $2::date
      GROUP BY o.nombre
      ORDER BY personas DESC, o.nombre`,
    [desde, hasta]
  );
  const porOrganizacion = r.rows;
  return { total: porOrganizacion.reduce((s, o) => s + o.personas, 0), porOrganizacion };
}

async function listarParaCsv(desde, hasta) {
  const r = await consultar(
    `SELECT a.fecha::text AS fecha, o.nombre AS organizacion, a.personas, u.nombre AS registrada_por,
            c.nombre AS corregida_por
       FROM atenciones a
       JOIN organizaciones o ON o.id = a.organizacion_id
       JOIN usuarios u ON u.id = a.registrada_por_id
       LEFT JOIN usuarios c ON c.id = a.corregida_por_id
      WHERE a.fecha BETWEEN $1::date AND $2::date
      ORDER BY a.fecha, o.nombre`,
    [desde, hasta]
  );
  return r.rows;
}

module.exports = {
  fechaLegible,
  validarAtencion,
  registrarAtencion,
  corregirAtencion,
  listarRecientes,
  resumenDelPeriodo,
  listarParaCsv,
};
