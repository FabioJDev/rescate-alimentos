// CMP-10 · Administrar los usuarios (solo la coordinadora, CA-10.9). Ver ADR-005.
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const {
  ROLES,
  NOMBRES_DE_ROL,
  listarUsuarios,
  buscarUsuario,
  validarUsuario,
  crearUsuario,
  editarUsuario,
  cambiarActivo,
} = require('../servicios/usuarios');
const { listarZonasActivas } = require('../servicios/zonas');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

function tomarAviso(req) {
  const aviso = req.session.aviso || null;
  delete req.session.aviso;
  return aviso;
}

function noExiste(res) {
  res.status(404).render('error', {
    titulo: 'No encontramos ese usuario',
    mensaje: 'Vuelve a la lista de usuarios.',
    volverA: '/usuarios',
    volverNombre: 'Usuarios',
  });
}

// Formulario de crear (usuario = null) o de editar (usuario = el que se edita).
async function mostrarFormulario(res, estado, { usuario = null, valores, errores = {} }) {
  const zonas = (await listarZonasActivas()).map((z) => z.nombre);
  res.status(estado).render('usuario-formulario', { usuario, valores, errores, zonas, roles: ROLES, nombresDeRol: NOMBRES_DE_ROL });
}

async function mostrarLista(req, res, { estado = 200, error = null } = {}) {
  const rol = ROLES.includes(req.query.rol) ? req.query.rol : null;
  res.status(estado).render('usuarios', {
    // CA-18.5: si aceptó el aviso de privacidad y cuándo.
    usuarios: (await listarUsuarios({ rol })).map((u) => ({
      ...u,
      privacidadTexto: u.privacidad_aceptada_en ? `aceptado el ${formatearFechaHora(u.privacidad_aceptada_en)}` : 'sin aceptar',
    })),
    rol,
    roles: ROLES,
    nombresDeRol: NOMBRES_DE_ROL,
    aviso: tomarAviso(req),
    error,
  });
}

// CA-10.1: la lista, con filtro por rol.
router.get('/usuarios', soloCoordinadora, async (req, res, next) => {
  try {
    await mostrarLista(req, res);
  } catch (error) {
    next(error);
  }
});

router.get('/usuarios/nuevo', soloCoordinadora, async (req, res, next) => {
  try {
    await mostrarFormulario(res, 200, { valores: { nombre: '', rol: '', zona: '', telefono: '', direccion: '' } });
  } catch (error) {
    next(error);
  }
});

// CA-10.2 a CA-10.4: se crea y se muestra el PIN temporal en esta misma respuesta. No se guarda en ningún lado
// en claro, así que no se puede volver a ver: si se pierde, se restablece (CMP-11).
router.post('/usuarios', soloCoordinadora, async (req, res, next) => {
  try {
    const zonas = (await listarZonasActivas()).map((z) => z.nombre);
    const { errores, valores, datos } = validarUsuario(req.body, zonas);
    if (Object.keys(errores).length > 0) return mostrarFormulario(res, 400, { valores, errores });

    const resultado = await crearUsuario(datos);
    if (resultado.errores) return mostrarFormulario(res, 400, { valores, errores: resultado.errores });

    res.status(201).render('usuario-pin', { usuario: resultado.usuario, pin: resultado.pin, nuevo: true });
  } catch (error) {
    next(error);
  }
});

router.get('/usuarios/:id(\\d+)/editar', soloCoordinadora, async (req, res, next) => {
  try {
    const usuario = await buscarUsuario(req.params.id);
    if (!usuario) return noExiste(res);
    const valores = {
      nombre: usuario.nombre,
      rol: usuario.rol,
      zona: usuario.zona || '',
      telefono: usuario.telefono || '',
      direccion: usuario.direccion || '',
    };
    await mostrarFormulario(res, 200, { usuario, valores });
  } catch (error) {
    next(error);
  }
});

// CA-10.5 y CA-10.8: editar. Si la coordinadora se edita a sí misma, se actualiza su propia sesión.
router.post('/usuarios/:id(\\d+)', soloCoordinadora, async (req, res, next) => {
  try {
    const usuario = await buscarUsuario(req.params.id);
    if (!usuario) return noExiste(res);

    const zonas = (await listarZonasActivas()).map((z) => z.nombre);
    const { errores, valores, datos } = validarUsuario(req.body, zonas);
    if (Object.keys(errores).length > 0) return mostrarFormulario(res, 400, { usuario, valores, errores });

    const yo = req.session.usuario;
    const resultado = await editarUsuario(usuario.id, datos, yo);
    if (resultado.errores) return mostrarFormulario(res, 400, { usuario, valores, errores: resultado.errores });

    if (usuario.id === yo.id) req.session.usuario = { ...yo, nombre: datos.nombre, zona: datos.zona };
    req.session.aviso = `Datos de «${datos.nombre}» guardados.`;
    res.redirect('/usuarios');
  } catch (error) {
    next(error);
  }
});

// CA-10.6 a CA-10.8: desactivar y reactivar.
router.post('/usuarios/:id(\\d+)/:accion(desactivar|activar)', soloCoordinadora, async (req, res, next) => {
  try {
    const activo = req.params.accion === 'activar';
    const resultado = await cambiarActivo(Number(req.params.id), activo, req.session.usuario);
    if (resultado.noExiste) return noExiste(res);
    if (resultado.error) return mostrarLista(req, res, { estado: 409, error: resultado.error });
    req.session.aviso = `«${resultado.usuario.nombre}» ${activo ? 'activado' : 'desactivado'}.`;
    res.redirect('/usuarios');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
