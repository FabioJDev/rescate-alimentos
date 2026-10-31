// CMP-21 · «Por vencer» y «Avisar» (solo la coordinadora, CA-21.7).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { listarPorVencer, buscarParaAvisar, avisosPara, vencePronto } = require('../servicios/por-vencer');
const { formatearFechaHora, tiempoRestante } = require('../utilidades/fechas');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

// CA-21.2.
router.get('/por-vencer', soloCoordinadora, async (req, res, next) => {
  try {
    const donaciones = (await listarPorVencer()).map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
      restante: tiempoRestante(d.hora_limite),
    }));
    res.render('por-vencer', { donaciones });
  } catch (error) {
    next(error);
  }
});

// CA-21.3, CA-21.4 y CA-21.6.
router.get('/donaciones/:codigo(D-\\d+)/avisar', soloCoordinadora, async (req, res, next) => {
  try {
    const donacion = await buscarParaAvisar(req.params.codigo);
    if (!donacion || !['disponible', 'asignada'].includes(donacion.estado) || !vencePronto(donacion.hora_limite)) {
      return res.status(409).render('error', {
        titulo: 'No hace falta avisar',
        mensaje: 'Esta donación no está por vencer (ya se entregó, se canceló, pasó su hora límite o todavía falta más de una hora).',
        volverA: '/por-vencer',
        volverNombre: 'Por vencer',
      });
    }
    // La dirección de la aplicación para el enlace «Tómala aquí» (detrás del proxy de Render es https).
    const urlBase = `${req.protocol}://${req.get('host')}`;
    res.render('avisar', {
      donacion: { ...donacion, cantidad: Number(donacion.cantidad), horaLimiteTexto: formatearFechaHora(donacion.hora_limite) },
      avisos: await avisosPara(donacion, urlBase),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
