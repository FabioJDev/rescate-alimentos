// CMP-24 · Solicitar acceso desde la página de ingreso. Un visitante sin cuenta deja sus datos; la coordinadora
// aprueba (y ahí sí se crea el usuario, igual que en CMP-10) o rechaza. Nadie entra sin que ella decida.
const { consultar } = require('../db/conexion');
const { ROLES, validarTelefono, normalizarNombre, existeUsuarioConNombre, crearUsuario } = require('./usuarios');

// La coordinadora no se solicita: se designa a mano (ADR-005).
const ROLES_SOLICITABLES = ROLES.filter((r) => r !== 'coordinadora');

const NOMBRES_DE_ROL_SOLICITABLE = {
  donante: 'Comercio (donante)',
  voluntario: 'Voluntario',
  organizacion: 'Organización receptora',
};

const MENSAJE_NOMBRE_EXISTE =
  'Ya existe una cuenta con ese nombre. Si es tuya, pide a la coordinadora que te restablezca el PIN.';
const MENSAJE_SOLICITUD_PENDIENTE = 'Ya hay una solicitud con ese nombre esperando revisión. Espera la respuesta de la coordinadora.';

// CA-24.12: el formulario es público; cada origen puede enviar pocas solicitudes por hora. Se reutiliza la tabla de
// intentos de CMP-16 (vive en la base, así un reinicio de Render no borra el conteo) con otra clave; aquí «fallos»
// cuenta solicitudes enviadas y «desde» es el inicio de la ventana.
const LIMITE_SOLICITUDES_POR_ORIGEN = 5;
const VENTANA_SOLICITUDES_MINUTOS = 60;
const MENSAJE_DEMASIADAS_SOLICITUDES =
  'Se enviaron demasiadas solicitudes desde esta conexión. Intenta en una hora o llama a la coordinadora.';

function claveDeOrigen(origen) {
  return `solicitud:${origen || 'desconocido'}`;
}

async function origenAlcanzoLimite(origen) {
  const r = await consultar(
    'SELECT 1 FROM intentos_ingreso WHERE clave = $1 AND desde > now() - make_interval(mins => $2) AND fallos >= $3',
    [claveDeOrigen(origen), VENTANA_SOLICITUDES_MINUTOS, LIMITE_SOLICITUDES_POR_ORIGEN]
  );
  return r.rows.length > 0;
}

async function contarSolicitudDeOrigen(origen) {
  await consultar(
    `INSERT INTO intentos_ingreso (clave, fallos, desde) VALUES ($1, 1, now())
     ON CONFLICT (clave) DO UPDATE SET
       fallos = CASE WHEN intentos_ingreso.desde < now() - make_interval(mins => $2) THEN 1
                     ELSE intentos_ingreso.fallos + 1 END,
       desde  = CASE WHEN intentos_ingreso.desde < now() - make_interval(mins => $2) THEN now()
                     ELSE intentos_ingreso.desde END`,
    [claveDeOrigen(origen), VENTANA_SOLICITUDES_MINUTOS]
  );
}

// CA-24.2 y CA-24.3: mismos datos y mismas reglas que crear un usuario (CMP-10), sin el rol coordinadora.
function validarSolicitud(cuerpo, zonasActivas, organizacionesActivas = []) {
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
  else if (!ROLES_SOLICITABLES.includes(rol)) errores.rol = 'Elige un rol de la lista.';

  const esDonante = rol === 'donante';
  const esOrganizacion = rol === 'organizacion';
  const necesitaZona = rol === 'donante' || rol === 'voluntario';

  // El teléfono siempre es obligatorio aquí: es cómo la coordinadora contacta a quien pide acceso.
  if (!telefonoValido) errores.telefono = 'El teléfono debe tener entre 7 y 15 números.';
  else if (!telefono) errores.telefono = 'Falta el teléfono.';

  if (necesitaZona) {
    if (!zonaTexto) errores.zona = 'Falta elegir la zona.';
    else if (!zonasActivas.includes(zonaTexto)) errores.zona = 'Elige una zona de la lista.';
  }

  if (esDonante && !direccionTexto) errores.direccion = 'Falta la dirección del comercio.';

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

// CA-24.4 y CA-24.5: ni un usuario ni una solicitud pendiente pueden repetir nombre.
async function existeSolicitudPendienteConNombre(nombre) {
  const r = await consultar(
    "SELECT 1 FROM solicitudes_acceso WHERE estado = 'pendiente' AND lower(translate(regexp_replace(trim(nombre), '\\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ')) = $1",
    [normalizarNombre(nombre)]
  );
  return r.rows.length > 0;
}

// CA-24.6: crea la solicitud pendiente. Devuelve { errores } si el nombre ya está en uso, o { solicitud }.
async function crearSolicitud(datos, origen) {
  if (await existeUsuarioConNombre(datos.nombre)) return { errores: { nombre: MENSAJE_NOMBRE_EXISTE } };
  if (await existeSolicitudPendienteConNombre(datos.nombre)) return { errores: { nombre: MENSAJE_SOLICITUD_PENDIENTE } };

  try {
    const r = await consultar(
      `INSERT INTO solicitudes_acceso (nombre, telefono, rol, zona, direccion, organizacion_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre`,
      [datos.nombre, datos.telefono, datos.rol, datos.zona, datos.direccion, datos.organizacionId || null]
    );
    await contarSolicitudDeOrigen(origen); // CA-24.12: solo cuentan las que sí se guardaron.
    return { solicitud: r.rows[0] };
  } catch (e) {
    // Carrera entre dos solicitudes con el mismo nombre al mismo instante (el índice único de pendientes).
    if (e.code === '23505') return { errores: { nombre: MENSAJE_SOLICITUD_PENDIENTE } };
    throw e;
  }
}

// CA-24.7: las pendientes, de la más antigua a la más nueva (la que espera hace más tiempo se revisa primero).
async function listarPendientes() {
  const r = await consultar(
    `SELECT s.*, o.nombre AS organizacion_nombre
       FROM solicitudes_acceso s
       LEFT JOIN organizaciones o ON o.id = s.organizacion_id
      WHERE s.estado = 'pendiente'
      ORDER BY s.creada_en ASC`
  );
  return r.rows;
}

// CA-24.13: las resueltas de los últimos 60 días, la más reciente primero, con quién la resolvió.
async function listarResueltas() {
  const r = await consultar(
    `SELECT s.*, o.nombre AS organizacion_nombre, u.nombre AS resuelta_por_nombre
       FROM solicitudes_acceso s
       JOIN usuarios u ON u.id = s.resuelta_por_id
       LEFT JOIN organizaciones o ON o.id = s.organizacion_id
      WHERE s.estado <> 'pendiente' AND s.resuelta_en >= now() - interval '60 days'
      ORDER BY s.resuelta_en DESC, s.id DESC`
  );
  return r.rows;
}

async function contarPendientes() {
  const r = await consultar("SELECT count(*)::int AS total FROM solicitudes_acceso WHERE estado = 'pendiente'");
  return r.rows[0].total;
}

async function buscarSolicitud(id) {
  const r = await consultar(
    `SELECT s.*, o.nombre AS organizacion_nombre
       FROM solicitudes_acceso s
       LEFT JOIN organizaciones o ON o.id = s.organizacion_id
      WHERE s.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

// CA-24.8 y CA-24.10: solo se aprueba una solicitud que sigue pendiente. Crea el usuario igual que CMP-10.
async function aprobarSolicitud(id, coordinadora) {
  const solicitud = await buscarSolicitud(id);
  if (!solicitud) return { noExiste: true };
  if (solicitud.estado !== 'pendiente') return { yaResuelta: true, solicitud };

  const resultado = await crearUsuario({
    nombre: solicitud.nombre,
    rol: solicitud.rol,
    telefono: solicitud.telefono,
    zona: solicitud.zona,
    direccion: solicitud.direccion,
    organizacionId: solicitud.organizacion_id,
  });
  // CA-24.4: alguien pudo crear a mano un usuario con ese nombre mientras la solicitud esperaba.
  if (resultado.errores) return { errores: resultado.errores, solicitud };

  await consultar(
    `UPDATE solicitudes_acceso
        SET estado = 'aprobada', resuelta_en = now(), resuelta_por_id = $1, usuario_creado_id = $2
      WHERE id = $3`,
    [coordinadora.id, resultado.usuario.id, id]
  );
  return { usuario: resultado.usuario, pin: resultado.pin };
}

// CA-24.9 y CA-24.10: solo se rechaza una solicitud que sigue pendiente, y siempre con motivo.
async function rechazarSolicitud(id, coordinadora, motivoTexto) {
  const solicitud = await buscarSolicitud(id);
  if (!solicitud) return { noExiste: true };
  if (solicitud.estado !== 'pendiente') return { yaResuelta: true, solicitud };

  const motivo = (motivoTexto || '').trim();
  if (!motivo) return { error: 'Falta el motivo del rechazo.', solicitud };
  if (motivo.length > 200) return { error: 'El motivo es muy largo.', solicitud };

  await consultar(
    `UPDATE solicitudes_acceso
        SET estado = 'rechazada', motivo_rechazo = $1, resuelta_en = now(), resuelta_por_id = $2
      WHERE id = $3`,
    [motivo, coordinadora.id, id]
  );
  return { rechazada: true, solicitud, motivo };
}

module.exports = {
  ROLES_SOLICITABLES,
  NOMBRES_DE_ROL_SOLICITABLE,
  LIMITE_SOLICITUDES_POR_ORIGEN,
  MENSAJE_DEMASIADAS_SOLICITUDES,
  origenAlcanzoLimite,
  validarSolicitud,
  crearSolicitud,
  listarPendientes,
  listarResueltas,
  contarPendientes,
  buscarSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
};
