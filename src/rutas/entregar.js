// CMP-04 · Registrar la entrega a la organización receptora (solo el voluntario que tomó la donación).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { listarOrganizaciones, motivoEntrega, validarEntrega, registrarEntrega } = require('../servicios/entregas');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

const soloVoluntarios = requerirRol('voluntario');

// Mensaje para quien no puede registrar la entrega (CA-04.4 y CA-04.5).
function mensajeDeRechazo(motivo, donacion) {
  if (motivo === 'ya_entregada') {
    return `Esta donación ya fue entregada el ${formatearFechaHora(donacion.entregada_en)} a ${donacion.organizacion_nombre}`;
  }
  if (motivo === 'no_asignada') {
    return 'Esta donación todavía no ha sido tomada, así que no se puede registrar su entrega.';
  }
  if (motivo === 'otro_voluntario') {
    return 'Esta donación la tomó otro voluntario. Solo quien la tomó puede registrar su entrega.';
  }
  return 'No existe una donación con ese código';
}

function mostrarRechazo(res, motivo, donacion) {
  const estado = motivo === 'no_existe' ? 404 : 409;
  res.status(estado).render('entrega-rechazada', { mensaje: mensajeDeRechazo(motivo, donacion) });
}

async function mostrarFormulario(res, estado, donacion, valores, errores) {
  res.status(estado).render('entrega-formulario', {
    donacion: { ...donacion, cantidad: Number(donacion.cantidad) },
    organizaciones: await listarOrganizaciones(),
    valores,
    errores,
  });
}

// CA-04.1: desde «Mis recogidas» se abre el formulario de entrega de una donación propia.
router.get('/donaciones/:codigo(D-\\d+)/entregar', soloVoluntarios, async (req, res, next) => {
  try {
    const info = await motivoEntrega(req.params.codigo, req.session.usuario.id);
    if (info.motivo !== 'puede') return mostrarRechazo(res, info.motivo, info.donacion);
    await mostrarFormulario(res, 200, info.donacion, { organizacion_id: '', recibido_por: '' }, {});
  } catch (error) {
    next(error);
  }
});

router.post('/donaciones/:codigo(D-\\d+)/entregar', soloVoluntarios, async (req, res, next) => {
  try {
    const voluntarioId = req.session.usuario.id;

    // Primero se comprueba que sea su donación y esté asignada (CA-04.4 y CA-04.5)...
    const info = await motivoEntrega(req.params.codigo, voluntarioId);
    if (info.motivo !== 'puede') return mostrarRechazo(res, info.motivo, info.donacion);

    // ...después, que falten datos (CA-04.3). Lo que el usuario escriba como fecha se ignora (CA-04.2).
    const organizaciones = await listarOrganizaciones();
    const { errores, valores, datos } = validarEntrega(req.body, organizaciones);
    if (Object.keys(errores).length > 0) {
      return await mostrarFormulario(res, 400, info.donacion, valores, errores);
    }

    const resultado = await registrarEntrega({ codigo: req.params.codigo, voluntarioId, ...datos });
    if (!resultado.entregada) return mostrarRechazo(res, resultado.motivo, resultado.donacion);

    // El detalle de la donación (CMP-05) muestra la entrega registrada y su historial.
    res.redirect(`/donaciones/${req.params.codigo}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
