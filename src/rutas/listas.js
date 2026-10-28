// CMP-05 · «Todas las donaciones» (coordinadora, CA-05.5) y «Mis donaciones» (donante, CA-05.6).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { FILTROS, listarTodas, listarDeDonante } = require('../servicios/listados');
const { formatearFechaHora } = require('../utilidades/fechas');
const { etiquetaDeEstado, claseDeEstado } = require('../utilidades/estados');

const router = express.Router();

// Prepara una fila para mostrarla: cantidad como número, estado en texto y hora límite en hora de Colombia.
function paraMostrar(donacion) {
  return {
    ...donacion,
    cantidad: Number(donacion.cantidad),
    estadoTexto: etiquetaDeEstado(donacion),
    estadoClase: claseDeEstado(donacion),
    horaLimiteTexto: formatearFechaHora(donacion.hora_limite),
  };
}

router.get('/todas', requerirRol('coordinadora'), async (req, res, next) => {
  try {
    const estado = FILTROS.includes(req.query.estado) ? req.query.estado : null;
    const donaciones = (await listarTodas({ estado })).map(paraMostrar);
    res.render('todas', { donaciones, estado, filtros: FILTROS });
  } catch (error) {
    next(error);
  }
});

router.get('/mis-donaciones', requerirRol('donante'), async (req, res, next) => {
  try {
    const donaciones = (await listarDeDonante(req.session.usuario.id)).map(paraMostrar);
    res.render('mis-donaciones', { donaciones });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
