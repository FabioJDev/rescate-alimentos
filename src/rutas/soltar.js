// CMP-06 · Soltar una donación tomada (solo el voluntario que la tomó).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { motivoLiberacion, soltarDonacion } = require('../servicios/liberaciones');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

// Solo los voluntarios pueden soltar una donación (CA-06.8, RNF-04).
const soloVoluntarios = requerirRol('voluntario');

// Mensaje para quien no puede soltar la donación (CA-06.2, CA-06.3 y CA-06.4).
function mensajeDeRechazo(motivo, donacion) {
  if (motivo === 'ya_entregada') {
    return `Esta donación ya fue entregada el ${formatearFechaHora(donacion.entregada_en)} a ${donacion.organizacion_nombre}; no se puede soltar.`;
  }
  if (motivo === 'no_asignada') return 'Esta donación no está asignada a nadie.';
  if (motivo === 'cancelada') return 'Esta donación ya fue cancelada.';
  if (motivo === 'otro_voluntario') {
    return 'Esta donación la tomó otro voluntario. Solo quien la tomó puede soltarla.';
  }
  return 'No existe una donación con ese código';
}

function mostrarRechazo(res, motivo, donacion) {
  const estado = motivo === 'no_existe' ? 404 : 409;
  res.status(estado).render('soltar-rechazada', { mensaje: mensajeDeRechazo(motivo, donacion) });
}

// Pantalla de confirmación: «Soltar» en «Mis recogidas» lleva aquí, y solo aquí se confirma.
router.get('/donaciones/:codigo(D-\\d+)/soltar', soloVoluntarios, async (req, res, next) => {
  try {
    const info = await motivoLiberacion(req.params.codigo, req.session.usuario.id);
    if (info.motivo !== 'puede') return mostrarRechazo(res, info.motivo, info.donacion);
    res.render('soltar-confirmar', {
      donacion: { ...info.donacion, cantidad: Number(info.donacion.cantidad) },
      horaLimite: formatearFechaHora(info.donacion.hora_limite),
    });
  } catch (error) {
    next(error);
  }
});

// CA-06.1: al confirmar, la donación vuelve a «disponible». La verificación se hace aquí, en el servidor.
router.post('/donaciones/:codigo(D-\\d+)/soltar', soloVoluntarios, async (req, res, next) => {
  try {
    const resultado = await soltarDonacion(req.params.codigo, req.session.usuario.id);
    if (!resultado.soltada) return mostrarRechazo(res, resultado.motivo, resultado.donacion);

    // Se redirige para que recargar la página no repita la acción. El detalle muestra «Soltada por…» (CA-06.6).
    res.redirect(`/donaciones/${resultado.donacion.codigo}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
