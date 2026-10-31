// CMP-14 · La coordinadora interviene en una donación (solo ella, CA-14.7).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const {
  obtenerParaIntervenir,
  listarVoluntariosActivos,
  leerVoluntarioVisto,
  motivoSobre,
  liberar,
  asignar,
} = require('../servicios/intervenciones');
const { listarOrganizaciones, validarEntrega, registrarEntrega, motivoEntrega } = require('../servicios/entregas');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

// Mensajes de rechazo (CA-14.3, CA-14.5 y CA-14.6).
function mensajeDeRechazo(motivo, donacion) {
  if (motivo === 'cancelada') return 'Esta donación ya fue cancelada.';
  if (motivo === 'ya_entregada') {
    return `Esta donación ya fue entregada el ${formatearFechaHora(donacion.entregada_en)} a ${donacion.organizacion_nombre}`;
  }
  if (motivo === 'no_asignada') return 'Esta donación no está asignada a nadie.';
  if (motivo === 'cambio') return 'La donación cambió mientras decidías; revisa su estado.';
  if (motivo === 'vencida') return 'La hora límite de esta donación ya pasó; no se puede asignar';
  if (motivo === 'mismo_voluntario') return 'Ya está asignada a ese voluntario';
  return 'No existe una donación con ese código';
}

function mostrarRechazo(res, motivo, donacion) {
  res.status(motivo === 'no_existe' ? 404 : 409).render('error', {
    titulo: 'No se pudo hacer el cambio',
    mensaje: mensajeDeRechazo(motivo, donacion),
    volverA: donacion ? `/donaciones/${donacion.codigo}` : '/todas',
    volverNombre: donacion ? `Donación ${donacion.codigo}` : 'Todas las donaciones',
  });
}

// CA-14.1: confirmar la liberación.
router.get('/donaciones/:codigo(D-\\d+)/liberar', soloCoordinadora, async (req, res, next) => {
  try {
    const donacion = await obtenerParaIntervenir(req.params.codigo);
    const motivo = motivoSobre(donacion, { exigeAsignada: true });
    if (motivo !== 'puede') return mostrarRechazo(res, motivo, donacion);
    res.render('liberar-confirmar', { donacion });
  } catch (error) {
    next(error);
  }
});

router.post('/donaciones/:codigo(D-\\d+)/liberar', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await liberar(req.params.codigo, req.session.usuario, req.body.voluntario_actual);
    if (resultado.motivo !== 'hecho') return mostrarRechazo(res, resultado.motivo, resultado.donacion);
    res.redirect(`/donaciones/${req.params.codigo}`);
  } catch (error) {
    next(error);
  }
});

async function mostrarAsignar(res, estado, donacion, error = null) {
  res.status(estado).render('asignar', {
    donacion,
    voluntarios: (await listarVoluntariosActivos()).filter((v) => v.id !== donacion.voluntario_id),
    error,
  });
}

// CA-14.2: elegir el voluntario.
router.get('/donaciones/:codigo(D-\\d+)/asignar', soloCoordinadora, async (req, res, next) => {
  try {
    const donacion = await obtenerParaIntervenir(req.params.codigo);
    const motivo = motivoSobre(donacion, { exigeAsignada: false });
    if (motivo !== 'puede') return mostrarRechazo(res, motivo, donacion);
    if (donacion.hora_cumplida) return mostrarRechazo(res, 'vencida', donacion);
    await mostrarAsignar(res, 200, donacion);
  } catch (error) {
    next(error);
  }
});

router.post('/donaciones/:codigo(D-\\d+)/asignar', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await asignar(req.params.codigo, req.session.usuario, req.body.voluntario_id, req.body.voluntario_actual);
    if (resultado.motivo === 'elige_voluntario') {
      return mostrarAsignar(res, 400, resultado.donacion, 'Elige un voluntario de la lista');
    }
    if (resultado.motivo !== 'hecho') return mostrarRechazo(res, resultado.motivo, resultado.donacion);
    res.redirect(`/donaciones/${req.params.codigo}`);
  } catch (error) {
    next(error);
  }
});

async function mostrarEntrega(res, estado, donacion, valores, errores) {
  res.status(estado).render('entrega-formulario', {
    donacion: { ...donacion, cantidad: Number(donacion.cantidad) },
    organizaciones: await listarOrganizaciones(),
    valores,
    errores,
    accion: `/donaciones/${donacion.codigo}/entregar-por`,
    porCoordinadora: true,
  });
}

// CA-14.4: registrar la entrega en nombre del voluntario asignado.
router.get('/donaciones/:codigo(D-\\d+)/entregar-por', soloCoordinadora, async (req, res, next) => {
  try {
    const donacion = await obtenerParaIntervenir(req.params.codigo);
    const motivo = motivoSobre(donacion, { exigeAsignada: true });
    if (motivo !== 'puede') return mostrarRechazo(res, motivo, donacion);
    await mostrarEntrega(res, 200, donacion, { organizacion_id: '', recibido_por: '' }, {});
  } catch (error) {
    next(error);
  }
});

router.post('/donaciones/:codigo(D-\\d+)/entregar-por', soloCoordinadora, async (req, res, next) => {
  try {
    const voluntarioVisto = leerVoluntarioVisto(req.body.voluntario_actual);
    const donacion = await obtenerParaIntervenir(req.params.codigo);
    const motivo = motivoSobre(donacion, { exigeAsignada: true, voluntarioVisto });
    if (motivo !== 'puede') return mostrarRechazo(res, motivo, donacion);

    // CA-04.3: los mismos datos obligatorios que cuando entrega el voluntario.
    const { errores, valores, datos } = validarEntrega(req.body, await listarOrganizaciones());
    if (Object.keys(errores).length > 0) return mostrarEntrega(res, 400, donacion, valores, errores);

    const resultado = await registrarEntrega({
      codigo: req.params.codigo,
      voluntarioId: voluntarioVisto,
      registradaPorId: req.session.usuario.id,
      ...datos,
    });
    if (!resultado.entregada) {
      const info = await motivoEntrega(req.params.codigo, voluntarioVisto);
      const mapa = { otro_voluntario: 'cambio', no_asignada: 'cambio' };
      return mostrarRechazo(res, mapa[info.motivo] || info.motivo, info.donacion);
    }
    res.redirect(`/donaciones/${req.params.codigo}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
