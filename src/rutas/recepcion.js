// CMP-19 · Pantallas de las organizaciones receptoras (solo el rol «organizacion», CA-19.9).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const {
  organizacionDe,
  listarParaRecibir,
  listarQueVienen,
  listarRecibidas,
  buscarParaPedir,
  motivoPedido,
  pedirDonacion,
  retirarSolicitud,
} = require('../servicios/recepcion');
const { formatearFechaHora, formatearHora, tiempoRestante } = require('../utilidades/fechas');

const router = express.Router();
const soloOrganizaciones = requerirRol('organizacion');

function mensajeDeRechazo(motivo, donacion) {
  if (motivo === 'ya_pedida') return `Esta donación ya la pidió ${donacion.destino_nombre}.`;
  if (motivo === 'ya_es_nuestra') return 'Ustedes ya pidieron esta donación: está en «Vienen para nosotros».';
  if (motivo === 'no_compatible') return 'Esta donación necesita refrigeración y su organización no tiene.';
  if (motivo === 'no_disponible') return 'Esta donación ya no se puede pedir (se entregó, se canceló o pasó su hora límite).';
  return 'No existe una donación con ese código';
}

function mostrarRechazo(res, motivo, donacion) {
  res.status(motivo === 'no_existe' ? 404 : 409).render('error', {
    titulo: 'No se pudo pedir',
    mensaje: mensajeDeRechazo(motivo, donacion),
    volverA: '/para-recibir',
    volverNombre: 'Para recibir',
  });
}

const paraMostrar = (d) => ({
  ...d,
  cantidad: Number(d.cantidad),
  horaLimiteTexto: formatearFechaHora(d.hora_limite),
  restante: tiempoRestante(d.hora_limite),
});

// CA-19.2.
router.get('/para-recibir', soloOrganizaciones, async (req, res, next) => {
  try {
    const organizacion = await organizacionDe(req.session.usuario);
    const donaciones = (await listarParaRecibir(organizacion)).map(paraMostrar);
    res.render('para-recibir', { organizacion, donaciones });
  } catch (error) {
    next(error);
  }
});

// CA-19.3: confirmar antes de pedir.
router.get('/donaciones/:codigo(D-\\d+)/pedir', soloOrganizaciones, async (req, res, next) => {
  try {
    const organizacion = await organizacionDe(req.session.usuario);
    const donacion = await buscarParaPedir(req.params.codigo);
    const motivo = motivoPedido(donacion, organizacion);
    if (motivo !== 'puede') return mostrarRechazo(res, motivo, donacion);
    res.render('pedir-confirmar', { donacion: paraMostrar(donacion), organizacion });
  } catch (error) {
    next(error);
  }
});

// CA-19.3 y CA-19.4.
router.post('/donaciones/:codigo(D-\\d+)/pedir', soloOrganizaciones, async (req, res, next) => {
  try {
    const resultado = await pedirDonacion(req.params.codigo, req.session.usuario);
    if (resultado.motivo !== 'hecho') return mostrarRechazo(res, resultado.motivo, resultado.donacion);
    res.redirect('/vienen');
  } catch (error) {
    next(error);
  }
});

// CA-19.5: «En camino» si alguien la tomó, «Esperando voluntario» si no.
router.get('/vienen', soloOrganizaciones, async (req, res, next) => {
  try {
    const organizacion = await organizacionDe(req.session.usuario);
    const donaciones = (await listarQueVienen(organizacion)).map((d) => ({
      ...paraMostrar(d),
      tomadaTexto: d.tomada_en ? formatearHora(d.tomada_en) : null,
    }));
    res.render('vienen', { organizacion, donaciones });
  } catch (error) {
    next(error);
  }
});

// CA-19.6: confirmar antes de dejar de pedirla.
router.get('/donaciones/:codigo(D-\\d+)/retirar-solicitud', soloOrganizaciones, async (req, res, next) => {
  try {
    const organizacion = await organizacionDe(req.session.usuario);
    const donacion = await buscarParaPedir(req.params.codigo);
    if (!donacion || donacion.destino_organizacion_id !== organizacion.id || !['disponible', 'asignada'].includes(donacion.estado)) {
      return res.status(409).render('error', {
        titulo: 'No se pudo cambiar',
        mensaje: 'Esta donación no está pedida por ustedes o ya se entregó.',
        volverA: '/vienen',
        volverNombre: 'Vienen para nosotros',
      });
    }
    res.render('retirar-confirmar', { donacion: paraMostrar(donacion) });
  } catch (error) {
    next(error);
  }
});

router.post('/donaciones/:codigo(D-\\d+)/retirar-solicitud', soloOrganizaciones, async (req, res, next) => {
  try {
    const resultado = await retirarSolicitud(req.params.codigo, req.session.usuario);
    if (!resultado.hecho) {
      return res.status(409).render('error', {
        titulo: 'No se pudo cambiar',
        mensaje: 'Esta donación no está pedida por ustedes o ya se entregó.',
        volverA: '/vienen',
        volverNombre: 'Vienen para nosotros',
      });
    }
    res.redirect('/vienen');
  } catch (error) {
    next(error);
  }
});

// CA-19.8.
router.get('/recibidas', soloOrganizaciones, async (req, res, next) => {
  try {
    const organizacion = await organizacionDe(req.session.usuario);
    const donaciones = (await listarRecibidas(organizacion)).map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
      entregadaTexto: formatearFechaHora(d.entregada_en),
    }));
    res.render('recibidas', { organizacion, donaciones });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
