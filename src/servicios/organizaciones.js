// CMP-12 · Administrar las organizaciones receptoras (solo la coordinadora).
const { consultar } = require('../db/conexion');
const { validarTelefono } = require('./usuarios');

// CA-12.1: todas, las activas primero.
async function listarTodasLasOrganizaciones() {
  const r = await consultar(
    'SELECT id, nombre, direccion, zona, refrigeracion, telefono, activa FROM organizaciones ORDER BY activa DESC, nombre'
  );
  return r.rows;
}

async function buscarOrganizacion(id) {
  const r = await consultar(
    'SELECT id, nombre, direccion, zona, refrigeracion, telefono, activa FROM organizaciones WHERE id = $1',
    [id]
  );
  return r.rows[0] || null;
}

// CA-12.2 y CA-12.3. `zonasActivas` son los nombres de zona que se pueden elegir.
function validarOrganizacion(cuerpo, zonasActivas) {
  const errores = {};
  const nombre = (cuerpo.nombre || '').trim().replace(/\s+/g, ' ');
  const direccion = (cuerpo.direccion || '').trim();
  const zona = (cuerpo.zona || '').trim();
  const refrigeracionTexto = (cuerpo.refrigeracion || '').trim();
  const { telefono, valido: telefonoValido } = validarTelefono(cuerpo.telefono);

  if (!nombre) errores.nombre = 'Falta el nombre de la organización.';
  else if (nombre.length > 100) errores.nombre = 'El nombre es muy largo.';
  if (!direccion) errores.direccion = 'Falta la dirección.';
  if (!zona) errores.zona = 'Falta elegir la zona.';
  else if (!zonasActivas.includes(zona)) errores.zona = 'Elige una zona de la lista.';
  if (!['si', 'no'].includes(refrigeracionTexto)) errores.refrigeracion = 'Indica si tiene refrigeración.';
  if (!telefonoValido) errores.telefono = 'El teléfono debe tener entre 7 y 15 números.';

  return {
    errores,
    valores: { nombre, direccion, zona, refrigeracion: refrigeracionTexto, telefono: (cuerpo.telefono || '').trim() },
    datos: { nombre, direccion, zona, refrigeracion: refrigeracionTexto === 'si', telefono },
  };
}

const MENSAJE_REPETIDA = 'Ya existe una organización con ese nombre.';

async function crearOrganizacion(datos) {
  try {
    const r = await consultar(
      `INSERT INTO organizaciones (nombre, direccion, zona, refrigeracion, telefono)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre`,
      [datos.nombre, datos.direccion, datos.zona, datos.refrigeracion, datos.telefono]
    );
    return { organizacion: r.rows[0] };
  } catch (e) {
    // 23505 = violación de unicidad: ya hay una organización con ese nombre.
    if (e.code === '23505') return { errores: { nombre: MENSAJE_REPETIDA } };
    throw e;
  }
}

// CA-12.4: las entregas pasadas apuntan a la organización por su id, así que siguen bien después de editarla.
async function editarOrganizacion(id, datos) {
  try {
    const r = await consultar(
      `UPDATE organizaciones SET nombre = $1, direccion = $2, zona = $3, refrigeracion = $4, telefono = $5
        WHERE id = $6 RETURNING id, nombre`,
      [datos.nombre, datos.direccion, datos.zona, datos.refrigeracion, datos.telefono, id]
    );
    if (r.rows.length === 0) return { noExiste: true };
    return { organizacion: r.rows[0] };
  } catch (e) {
    if (e.code === '23505') return { errores: { nombre: MENSAJE_REPETIDA } };
    throw e;
  }
}

// CA-12.5: desactivar y reactivar siempre se puede.
async function cambiarActiva(id, activa) {
  const r = await consultar('UPDATE organizaciones SET activa = $1 WHERE id = $2 RETURNING id, nombre, activa', [activa, id]);
  if (r.rows.length === 0) return { noExiste: true };
  return { organizacion: r.rows[0] };
}

module.exports = {
  listarTodasLasOrganizaciones,
  buscarOrganizacion,
  validarOrganizacion,
  crearOrganizacion,
  editarOrganizacion,
  cambiarActiva,
};
