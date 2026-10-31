// CMP-13 · Corregir o cancelar una donación (su donante o la coordinadora; nunca un voluntario, CA-13.10).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { TIPOS_ALIMENTO, UNIDADES } = require('../servicios/donaciones');
const { motivoCambio, mensajeDeRechazo, corregirDonacion, cancelarDonacion } = require('../servicios/correcciones');
const { formatearFechaHora, fechaParaCampo } = require('../utilidades/fechas');

const router = express.Router();
const donanteOCoordinadora = requerirRol('donante', 'coordinadora');

function mostrarRechazo(res, { motivo, donacion }) {
  const estado = motivo === 'no_existe' || motivo === 'no_es_suya' ? 404 : 409;
  res.status(estado).render('error', {
    titulo: 'No se puede cambiar esta donación',
    mensaje: mensajeDeRechazo(motivo, donacion),
    volverA: donacion && motivo !== 'no_es_suya' ? `/donaciones/${donacion.codigo}` : '/',
    volverNombre: donacion && motivo !== 'no_es_suya' ? `Donación ${donacion.codigo}` : 'Inicio',
  });
}

function mostrarFormulario(res, estado, { donacion, valores, errores = {}, aviso = null, editaHora }) {
  res.status(estado).render('donacion-corregir', {
    donacion,
    valores,
    errores,
    aviso,
    editaHora,
    tipos: TIPOS_ALIMENTO,
    unidades: UNIDADES,
    horaLimiteTexto: formatearFechaHora(donacion.hora_limite),
  });
}

// CA-13.1 y CA-13.3: el formulario llega lleno con los datos actuales.
router.get('/donaciones/:codigo(D-\\d+)/corregir', donanteOCoordinadora, async (req, res, next) => {
  try {
    const info = await motivoCambio('corregir', req.params.codigo, req.session.usuario);
    if (info.motivo !== 'puede') return mostrarRechazo(res, info);
    const d = info.donacion;
    const valores = {
      tipo_alimento: d.tipo_alimento,
      cantidad: String(Number(d.cantidad)),
      unidad: d.unidad,
      punto_recogida: d.punto_recogida,
      hora_limite: fechaParaCampo(d.hora_limite),
    };
    mostrarFormulario(res, 200, { donacion: d, valores, editaHora: d.estado === 'disponible' });
  } catch (error) {
    next(error);
  }
});

// CA-13.1 a CA-13.5 y CA-13.8.
router.post('/donaciones/:codigo(D-\\d+)/corregir', donanteOCoordinadora, async (req, res, next) => {
  try {
    const resultado = await corregirDonacion(req.params.codigo, req.session.usuario, req.body);
    if (resultado.rechazo) return mostrarRechazo(res, resultado.rechazo);
    if (resultado.errores) return mostrarFormulario(res, 400, resultado);
    if (resultado.sinCambios) return mostrarFormulario(res, 400, { ...resultado, aviso: 'No cambiaste ningún dato.' });
    res.redirect(`/donaciones/${resultado.corregida.codigo}`);
  } catch (error) {
    next(error);
  }
});

// CA-13.6: primero se confirma y se escribe el motivo.
router.get('/donaciones/:codigo(D-\\d+)/cancelar', donanteOCoordinadora, async (req, res, next) => {
  try {
    const info = await motivoCambio('cancelar', req.params.codigo, req.session.usuario);
    if (info.motivo !== 'puede') return mostrarRechazo(res, info);
    res.render('donacion-cancelar', { donacion: info.donacion, errores: {}, motivo: '' });
  } catch (error) {
    next(error);
  }
});

// CA-13.6 a CA-13.8.
router.post('/donaciones/:codigo(D-\\d+)/cancelar', donanteOCoordinadora, async (req, res, next) => {
  try {
    const resultado = await cancelarDonacion(req.params.codigo, req.session.usuario, req.body.motivo);
    if (resultado.rechazo) return mostrarRechazo(res, resultado.rechazo);
    if (resultado.errores) {
      return res.status(400).render('donacion-cancelar', { donacion: resultado.donacion, errores: resultado.errores, motivo: req.body.motivo || '' });
    }
    res.redirect(`/donaciones/${resultado.cancelada.codigo}`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
