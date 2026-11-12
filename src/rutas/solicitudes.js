// CMP-24 · Solicitar acceso desde la página de ingreso y revisarlas (solo la coordinadora, CA-24.11).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const {
  ROLES_SOLICITABLES,
  NOMBRES_DE_ROL_SOLICITABLE,
  validarSolicitud,
  crearSolicitud,
  listarPendientes,
  buscarSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
} = require('../servicios/solicitudes');
const { listarZonasActivas } = require('../servicios/zonas');
const { listarOrganizaciones } = require('../servicios/entregas');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

async function opcionesParaValidar() {
  return [(await listarZonasActivas()).map((z) => z.nombre), await listarOrganizaciones()];
}

async function mostrarFormulario(res, estado, { valores, errores = {} }) {
  res.status(estado).render('solicitud-acceso', {
    valores,
    errores,
    zonas: (await listarZonasActivas()).map((z) => z.nombre),
    organizaciones: await listarOrganizaciones(),
    roles: ROLES_SOLICITABLES,
    nombresDeRol: NOMBRES_DE_ROL_SOLICITABLE,
  });
}

// CA-24.1 y CA-24.2: el formulario es público, antes de tener cuenta.
router.get('/solicitar-acceso', async (req, res, next) => {
  try {
    await mostrarFormulario(res, 200, { valores: { nombre: '', telefono: '', rol: '', zona: '', direccion: '', organizacion_id: '' } });
  } catch (error) {
    next(error);
  }
});

// CA-24.3 a CA-24.6.
router.post('/solicitar-acceso', async (req, res, next) => {
  try {
    const { errores, valores, datos } = validarSolicitud(req.body, ...(await opcionesParaValidar()));
    if (Object.keys(errores).length > 0) return mostrarFormulario(res, 400, { valores, errores });

    const resultado = await crearSolicitud(datos);
    if (resultado.errores) return mostrarFormulario(res, 400, { valores, errores: resultado.errores });

    res.status(201).render('solicitud-enviada', { nombre: datos.nombre });
  } catch (error) {
    next(error);
  }
});

function noExiste(res) {
  res.status(404).render('error', {
    titulo: 'No encontramos esa solicitud',
    mensaje: 'Vuelve a la lista de solicitudes.',
    volverA: '/solicitudes',
    volverNombre: 'Solicitudes de acceso',
  });
}

function tomarAviso(req) {
  const aviso = req.session.aviso || null;
  delete req.session.aviso;
  return aviso;
}

// CA-24.7.
router.get('/solicitudes', soloCoordinadora, async (req, res, next) => {
  try {
    const pendientes = (await listarPendientes()).map((s) => ({ ...s, creadaTexto: formatearFechaHora(s.creada_en) }));
    res.render('solicitudes', { pendientes, aviso: tomarAviso(req), nombresDeRol: NOMBRES_DE_ROL_SOLICITABLE });
  } catch (error) {
    next(error);
  }
});

// CA-24.8 y CA-24.10.
router.post('/solicitudes/:id(\\d+)/aprobar', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await aprobarSolicitud(Number(req.params.id), req.session.usuario);
    if (resultado.noExiste) return noExiste(res);
    if (resultado.yaResuelta) {
      req.session.aviso = 'Esa solicitud ya estaba resuelta.';
      return res.redirect('/solicitudes');
    }
    if (resultado.errores) {
      req.session.aviso = resultado.errores.nombre;
      return res.redirect('/solicitudes');
    }
    res.status(201).render('usuario-pin', { usuario: resultado.usuario, pin: resultado.pin, nuevo: true });
  } catch (error) {
    next(error);
  }
});

router.get('/solicitudes/:id(\\d+)/rechazar', soloCoordinadora, async (req, res, next) => {
  try {
    const solicitud = await buscarSolicitud(req.params.id);
    if (!solicitud || solicitud.estado !== 'pendiente') return noExiste(res);
    res.render('solicitud-rechazar', { solicitud, error: null, motivo: '' });
  } catch (error) {
    next(error);
  }
});

// CA-24.9 y CA-24.10.
router.post('/solicitudes/:id(\\d+)/rechazar', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await rechazarSolicitud(Number(req.params.id), req.session.usuario, req.body.motivo);
    if (resultado.noExiste) return noExiste(res);
    if (resultado.yaResuelta) {
      req.session.aviso = 'Esa solicitud ya estaba resuelta.';
      return res.redirect('/solicitudes');
    }
    if (resultado.error) {
      return res.status(400).render('solicitud-rechazar', { solicitud: resultado.solicitud, error: resultado.error, motivo: req.body.motivo || '' });
    }
    req.session.aviso = 'Solicitud rechazada.';
    res.redirect('/solicitudes');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
