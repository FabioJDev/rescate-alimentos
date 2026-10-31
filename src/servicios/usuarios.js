// Lógica de usuarios: comprobar el nombre + PIN (ADR-003) y la administración de la coordinadora (CMP-10, ADR-005).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { consultar } = require('../db/conexion');
const { cerrarSesionesDe } = require('./sesiones');
const { limpiarNombre } = require('./intentos');

const ROLES = ['donante', 'voluntario', 'coordinadora', 'organizacion'];

// CMP-17: la misma normalización en JavaScript (lo que escribe la persona) y en SQL (lo guardado, migración 011).
function normalizarNombre(texto) {
  return (texto || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
const NOMBRE_NORMALIZADO_SQL = "lower(translate(regexp_replace(trim(nombre), '\\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ'))";
const NOMBRES_DE_ROL = {
  donante: 'Comercio (donante)',
  voluntario: 'Voluntario',
  coordinadora: 'Coordinadora',
  organizacion: 'Organización receptora',
};

// Devuelve los datos públicos del usuario si el nombre y el PIN son correctos; si no, null.
// No dice cuál de los dos falló, para no ayudar a adivinar nombres. Solo con el PIN correcto se dice que el
// usuario está desactivado (CA-10.6): así no se revela a cualquiera qué nombres existen.
async function autenticar(nombre, pin) {
  // CA-17.1: se busca sin importar mayúsculas, tildes en mayúscula ni espacios de más (migración 011).
  const resultado = await consultar(
    `SELECT id, nombre, rol, zona, pin_hash, activo, debe_cambiar_pin, privacidad_aceptada_en, organizacion_id
       FROM usuarios
      WHERE ${NOMBRE_NORMALIZADO_SQL} = $1`,
    [normalizarNombre(nombre)]
  );
  const usuario = resultado.rows[0];
  if (!usuario) return null;

  const pinCorrecto = await bcrypt.compare(pin, usuario.pin_hash);
  if (!pinCorrecto) return null;
  if (!usuario.activo) return { desactivado: true };

  // Nunca devolvemos el hash del PIN fuera de este archivo.
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    zona: usuario.zona,
    debeCambiarPin: usuario.debe_cambiar_pin,
    privacidadAceptada: Boolean(usuario.privacidad_aceptada_en),
    organizacionId: usuario.organizacion_id, // CMP-19: solo para el rol «organizacion»
  };
}

// CA-18.2: guarda la fecha y hora en que la persona aceptó el aviso de privacidad.
async function aceptarPrivacidad(usuarioId) {
  await consultar('UPDATE usuarios SET privacidad_aceptada_en = now() WHERE id = $1 AND privacidad_aceptada_en IS NULL', [usuarioId]);
}

// PIN temporal de 4 dígitos al azar (ADR-005). `crypto.randomInt` es seguro para esto; `Math.random` no.
function generarPin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

// CA-10.1: todos los usuarios, con filtro opcional por rol. Los activos primero.
async function listarUsuarios({ rol = null } = {}) {
  const r = await consultar(
    `SELECT u.id, u.nombre, u.rol, u.zona, u.telefono, u.direccion, u.activo, u.privacidad_aceptada_en,
            o.nombre AS organizacion_nombre
       FROM usuarios u
       LEFT JOIN organizaciones o ON o.id = u.organizacion_id
      WHERE $1::text IS NULL OR u.rol = $1
      ORDER BY u.activo DESC, u.nombre`,
    [ROLES.includes(rol) ? rol : null]
  );
  return r.rows;
}

async function buscarUsuario(id) {
  const r = await consultar(
    'SELECT id, nombre, rol, zona, telefono, direccion, activo, organizacion_id FROM usuarios WHERE id = $1',
    [id]
  );
  return r.rows[0] || null;
}

// Un teléfono sirve si tiene entre 7 y 15 dígitos (fijo o celular, con o sin +57). Se aceptan espacios,
// guiones y paréntesis porque así lo escribe la gente; se guarda limpio de espacios de más.
function validarTelefono(texto) {
  const telefono = (texto || '').trim().replace(/\s+/g, ' ');
  if (!telefono) return { telefono: null, valido: true };
  const digitos = telefono.replace(/\D/g, '');
  const valido = /^[\d\s+()-]+$/.test(telefono) && digitos.length >= 7 && digitos.length <= 15;
  return { telefono, valido };
}

// CA-10.3 y CA-10.4: los datos obligatorios dependen del rol. `zonasActivas` son los nombres que se pueden elegir y
// `organizacionesActivas` las organizaciones a las que puede pertenecer un usuario con rol «organizacion» (CA-19.1).
function validarUsuario(cuerpo, zonasActivas, organizacionesActivas = []) {
  const errores = {};
  const nombre = (cuerpo.nombre || '').trim().replace(/\s+/g, ' ');
  const rol = (cuerpo.rol || '').trim();
  const zonaTexto = (cuerpo.zona || '').trim();
  const direccionTexto = (cuerpo.direccion || '').trim();
  const organizacionTexto = (cuerpo.organizacion_id || '').trim();
  const { telefono, valido: telefonoValido } = validarTelefono(cuerpo.telefono);

  if (!nombre) errores.nombre = 'Falta el nombre.';
  else if (nombre.length > 80) errores.nombre = 'El nombre es muy largo.';

  if (!rol) errores.rol = 'Falta elegir el rol.';
  else if (!ROLES.includes(rol)) errores.rol = 'Elige un rol de la lista.';

  const esDonante = rol === 'donante';
  const esOrganizacion = rol === 'organizacion';
  const necesitaZona = rol === 'donante' || rol === 'voluntario';
  const necesitaTelefono = necesitaZona || esOrganizacion;

  if (!telefonoValido) errores.telefono = 'El teléfono debe tener entre 7 y 15 números.';
  else if (necesitaTelefono && !telefono) errores.telefono = 'Falta el teléfono.';

  if (necesitaZona) {
    if (!zonaTexto) errores.zona = 'Falta elegir la zona.';
    else if (!zonasActivas.includes(zonaTexto)) errores.zona = 'Elige una zona de la lista.';
  }

  if (esDonante && !direccionTexto) errores.direccion = 'Falta la dirección del comercio.';

  // CA-19.1: el usuario de una organización elige a cuál pertenece (solo las activas).
  let organizacionId = null;
  if (esOrganizacion) {
    const organizacion = organizacionesActivas.find((o) => String(o.id) === organizacionTexto);
    if (!organizacionTexto) errores.organizacion_id = 'Falta elegir la organización.';
    else if (!organizacion) errores.organizacion_id = 'Elige una organización de la lista.';
    else organizacionId = organizacion.id;
  }

  return {
    errores,
    valores: {
      nombre,
      rol,
      zona: zonaTexto,
      telefono: (cuerpo.telefono || '').trim(),
      direccion: direccionTexto,
      organizacion_id: organizacionTexto,
    },
    // La coordinadora y las organizaciones no tienen zona propia; solo los comercios tienen dirección.
    datos: {
      nombre,
      rol,
      telefono,
      zona: necesitaZona ? zonaTexto : null,
      direccion: esDonante ? direccionTexto : null,
      organizacionId,
    },
  };
}

// CA-17.2: con el nombre se ingresa, así que no puede repetirse; se sugiere cómo distinguirlo.
const MENSAJE_NOMBRE_REPETIDO =
  'Ya existe un usuario con ese nombre. Agrega el apellido o un apodo (por ejemplo, «Ana Pérez» o «Ana del Norte»).';

// CA-10.7: un voluntario con donaciones asignadas no puede dejar de ser voluntario activo.
async function contarAsignadas(usuarioId) {
  const r = await consultar("SELECT count(*)::int AS total FROM donaciones WHERE estado = 'asignada' AND voluntario_id = $1", [
    usuarioId,
  ]);
  return r.rows[0].total;
}

function mensajeAsignadas(total) {
  return `Tiene ${total} donaciones asignadas. Libéralas o asígnalas a otro voluntario primero.`;
}

// CA-10.2: crea el usuario activo con un PIN temporal. Devuelve el PIN en claro UNA sola vez para mostrarlo.
async function crearUsuario(datos) {
  const pin = generarPin();
  const pinHash = await bcrypt.hash(pin, 10);
  try {
    const r = await consultar(
      `INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion, telefono, organizacion_id, debe_cambiar_pin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, nombre, rol`,
      [datos.nombre, datos.rol, pinHash, datos.zona, datos.direccion, datos.telefono, datos.organizacionId || null]
    );
    return { usuario: r.rows[0], pin };
  } catch (e) {
    // 23505 = violación de unicidad: el nombre ya existe (con o sin mayúsculas).
    if (e.code === '23505') return { errores: { nombre: MENSAJE_NOMBRE_REPETIDO } };
    throw e;
  }
}

// CA-10.5 y CA-10.8: guarda los cambios y cierra las sesiones de esa persona para que entre con lo nuevo.
async function editarUsuario(id, datos, quienEdita) {
  const actual = await buscarUsuario(id);
  if (!actual) return { noExiste: true };

  if (actual.id === quienEdita.id && datos.rol !== 'coordinadora') {
    return { errores: { rol: 'No puedes quitarte el rol de coordinadora.' } };
  }
  if (actual.rol === 'voluntario' && datos.rol !== 'voluntario') {
    const asignadas = await contarAsignadas(id);
    if (asignadas > 0) return { errores: { rol: mensajeAsignadas(asignadas) } };
  }

  try {
    await consultar(
      'UPDATE usuarios SET nombre = $1, rol = $2, zona = $3, direccion = $4, telefono = $5, organizacion_id = $6 WHERE id = $7',
      [datos.nombre, datos.rol, datos.zona, datos.direccion, datos.telefono, datos.organizacionId || null, id]
    );
  } catch (e) {
    if (e.code === '23505') return { errores: { nombre: MENSAJE_NOMBRE_REPETIDO } };
    throw e;
  }

  // La coordinadora que se edita a sí misma no sale: la ruta actualiza su sesión.
  if (actual.id !== quienEdita.id) await cerrarSesionesDe(id);
  return { usuario: { ...actual, ...datos } };
}

// CA-10.6 a CA-10.8: desactivar cierra sus sesiones; reactivar siempre se puede.
async function cambiarActivo(id, activo, quienEdita) {
  const usuario = await buscarUsuario(id);
  if (!usuario) return { noExiste: true };

  if (!activo) {
    if (usuario.id === quienEdita.id) return { error: 'No puedes desactivar tu propio usuario.' };
    if (usuario.rol === 'voluntario') {
      const asignadas = await contarAsignadas(id);
      if (asignadas > 0) return { error: mensajeAsignadas(asignadas) };
    }
  }

  await consultar('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, id]);
  if (!activo) await cerrarSesionesDe(id);
  return { usuario: { ...usuario, activo } };
}

// CA-11.1 y CA-11.2: cambiar el propio PIN. Se pide el actual para que nadie lo cambie con una sesión olvidada.
async function cambiarPin(usuarioId, cuerpo) {
  const actual = (cuerpo.pin_actual || '').trim();
  const nuevo = (cuerpo.pin_nuevo || '').trim();
  const repetido = (cuerpo.pin_repetido || '').trim();

  const r = await consultar('SELECT pin_hash FROM usuarios WHERE id = $1', [usuarioId]);
  const errores = {};
  if (!(await bcrypt.compare(actual, r.rows[0].pin_hash))) errores.pin_actual = 'El PIN actual no es correcto.';
  if (!/^\d{4}$/.test(nuevo)) errores.pin_nuevo = 'El PIN nuevo debe tener 4 números.';
  else if (nuevo !== repetido) errores.pin_repetido = 'Los dos PIN nuevos no coinciden.';
  else if (nuevo === actual) errores.pin_nuevo = 'El PIN nuevo debe ser distinto del actual.';
  if (Object.keys(errores).length > 0) return { errores };

  const pinHash = await bcrypt.hash(nuevo, 10);
  await consultar('UPDATE usuarios SET pin_hash = $1, debe_cambiar_pin = FALSE WHERE id = $2', [pinHash, usuarioId]);
  return { cambiado: true };
}

// CA-11.3: la coordinadora restablece el PIN de otra persona. El anterior deja de servir, se cierran sus
// sesiones y la persona tendrá que cambiar el temporal al entrar (CA-11.4).
async function restablecerPin(id, quienRestablece) {
  const usuario = await buscarUsuario(id);
  if (!usuario) return { noExiste: true };
  if (usuario.id === quienRestablece.id) return { error: 'Para tu propio PIN usa «Cambiar mi PIN».' };

  const pin = generarPin();
  const pinHash = await bcrypt.hash(pin, 10);
  await consultar('UPDATE usuarios SET pin_hash = $1, debe_cambiar_pin = TRUE WHERE id = $2', [pinHash, id]);
  await cerrarSesionesDe(id);
  await limpiarNombre(usuario.nombre); // CA-16.4: restablecer el PIN desbloquea
  return { usuario, pin };
}

module.exports = {
  ROLES,
  NOMBRES_DE_ROL,
  autenticar,
  generarPin,
  listarUsuarios,
  buscarUsuario,
  validarTelefono,
  validarUsuario,
  crearUsuario,
  editarUsuario,
  cambiarActivo,
  cambiarPin,
  restablecerPin,
  aceptarPrivacidad,
};
