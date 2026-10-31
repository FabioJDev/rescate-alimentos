// CMP-12 · Administrar las organizaciones receptoras (solo la coordinadora, CA-12.6).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const {
  listarTodasLasOrganizaciones,
  buscarOrganizacion,
  validarOrganizacion,
  crearOrganizacion,
  editarOrganizacion,
  cambiarActiva,
} = require('../servicios/organizaciones');
const { listarZonasActivas } = require('../servicios/zonas');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

function noExiste(res) {
  res.status(404).render('error', {
    titulo: 'No encontramos esa organización',
    mensaje: 'Vuelve a la lista de organizaciones.',
    volverA: '/organizaciones',
    volverNombre: 'Organizaciones',
  });
}

async function nombresDeZonas() {
  return (await listarZonasActivas()).map((z) => z.nombre);
}

async function mostrarFormulario(res, estado, { organizacion = null, valores, errores = {} }) {
  res.status(estado).render('organizacion-formulario', { organizacion, valores, errores, zonas: await nombresDeZonas() });
}

// CA-12.1.
router.get('/organizaciones', soloCoordinadora, async (req, res, next) => {
  try {
    const aviso = req.session.aviso || null;
    delete req.session.aviso;
    res.render('organizaciones', { organizaciones: await listarTodasLasOrganizaciones(), aviso });
  } catch (error) {
    next(error);
  }
});

router.get('/organizaciones/nueva', soloCoordinadora, async (req, res, next) => {
  try {
    await mostrarFormulario(res, 200, { valores: { nombre: '', direccion: '', zona: '', refrigeracion: '', telefono: '' } });
  } catch (error) {
    next(error);
  }
});

// CA-12.2 y CA-12.3.
router.post('/organizaciones', soloCoordinadora, async (req, res, next) => {
  try {
    const { errores, valores, datos } = validarOrganizacion(req.body, await nombresDeZonas());
    if (Object.keys(errores).length > 0) return mostrarFormulario(res, 400, { valores, errores });

    const resultado = await crearOrganizacion(datos);
    if (resultado.errores) return mostrarFormulario(res, 400, { valores, errores: resultado.errores });
    req.session.aviso = `Organización «${resultado.organizacion.nombre}» creada.`;
    res.redirect('/organizaciones');
  } catch (error) {
    next(error);
  }
});

router.get('/organizaciones/:id(\\d+)/editar', soloCoordinadora, async (req, res, next) => {
  try {
    const organizacion = await buscarOrganizacion(req.params.id);
    if (!organizacion) return noExiste(res);
    const valores = {
      nombre: organizacion.nombre,
      direccion: organizacion.direccion,
      zona: organizacion.zona,
      refrigeracion: organizacion.refrigeracion ? 'si' : 'no',
      telefono: organizacion.telefono || '',
    };
    await mostrarFormulario(res, 200, { organizacion, valores });
  } catch (error) {
    next(error);
  }
});

// CA-12.4.
router.post('/organizaciones/:id(\\d+)', soloCoordinadora, async (req, res, next) => {
  try {
    const organizacion = await buscarOrganizacion(req.params.id);
    if (!organizacion) return noExiste(res);
    const { errores, valores, datos } = validarOrganizacion(req.body, await nombresDeZonas());
    if (Object.keys(errores).length > 0) return mostrarFormulario(res, 400, { organizacion, valores, errores });

    const resultado = await editarOrganizacion(organizacion.id, datos);
    if (resultado.errores) return mostrarFormulario(res, 400, { organizacion, valores, errores: resultado.errores });
    req.session.aviso = `Datos de «${datos.nombre}» guardados.`;
    res.redirect('/organizaciones');
  } catch (error) {
    next(error);
  }
});

// CA-12.5.
router.post('/organizaciones/:id(\\d+)/:accion(desactivar|activar)', soloCoordinadora, async (req, res, next) => {
  try {
    const activa = req.params.accion === 'activar';
    const resultado = await cambiarActiva(req.params.id, activa);
    if (resultado.noExiste) return noExiste(res);
    req.session.aviso = `«${resultado.organizacion.nombre}» ${activa ? 'activada' : 'desactivada'}.`;
    res.redirect('/organizaciones');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
