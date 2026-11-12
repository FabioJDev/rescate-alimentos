// CMP-25 · «Registro de cambios»: las acciones de administración (solo la coordinadora, CA-25.6).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { ULTIMAS, listarRegistro } = require('../servicios/registro-administracion');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

// CA-25.5.
router.get('/registro-cambios', requerirRol('coordinadora'), async (req, res, next) => {
  try {
    const acciones = (await listarRegistro()).map((a) => ({ ...a, fechaTexto: formatearFechaHora(a.ocurrido_en) }));
    res.render('registro-cambios', { acciones, ultimas: ULTIMAS });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
