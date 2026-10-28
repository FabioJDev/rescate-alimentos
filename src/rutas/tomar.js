// CMP-03 · Tomar una donación, con bloqueo de una segunda toma. También «Mis recogidas».
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { tomarDonacion, motivoNoDisponible, listarRecogidasDe } = require('../servicios/donaciones');
const { formatearFechaHora, formatearHora } = require('../utilidades/fechas');

const router = express.Router();

// Solo los voluntarios pueden tomar una donación (CA-03.6, RNF-04).
const soloVoluntarios = requerirRol('voluntario');

// Arma el mensaje para quien no pudo tomar la donación (CA-03.2, CA-03.3 y CA-03.4).
function mensajeDeRechazo(motivo, donacion) {
  if (motivo === 'ya_tomada') {
    return `Esta donación ya fue tomada por ${donacion.voluntario_nombre} a las ${formatearHora(donacion.tomada_en)}. No vayas al punto de recogida.`;
  }
  if (motivo === 'vencida') {
    return 'La hora límite de esta donación ya pasó; no se puede tomar';
  }
  return 'No existe una donación con ese código';
}

function mostrarRechazo(res, motivo, donacion) {
  const estado = motivo === 'no_existe' ? 404 : 409;
  res.status(estado).render('toma-rechazada', { mensaje: mensajeDeRechazo(motivo, donacion) });
}

function mostrarTomada(res, donacion, titulo) {
  res.render('donacion-tomada', {
    titulo,
    donacion: { ...donacion, cantidad: Number(donacion.cantidad) },
    horaLimite: formatearFechaHora(donacion.hora_limite),
  });
}

// Pantalla de confirmación: «Tomar» en la lista lleva aquí, y solo aquí se confirma la toma.
router.get('/donaciones/:codigo/tomar', soloVoluntarios, async (req, res, next) => {
  try {
    const info = await motivoNoDisponible(req.params.codigo, req.session.usuario.id);

    if (info.motivo === 'disponible') {
      return res.render('toma-confirmar', {
        donacion: { ...info.donacion, cantidad: Number(info.donacion.cantidad) },
        horaLimite: formatearFechaHora(info.donacion.hora_limite),
      });
    }
    if (info.motivo === 'ya_es_tuya') return mostrarTomada(res, info.donacion, 'Ya tomaste esta donación');
    mostrarRechazo(res, info.motivo, info.donacion);
  } catch (error) {
    next(error);
  }
});

// CA-03.1: al confirmar se toma la donación. La verificación se hace aquí, en el servidor, en el
// momento de tomar, y no con lo que mostraba la lista (CA-03.3).
router.post('/donaciones/:codigo/tomar', soloVoluntarios, async (req, res, next) => {
  try {
    const resultado = await tomarDonacion(req.params.codigo, req.session.usuario.id);

    if (resultado.tomada) {
      // Se redirige para que recargar la página no vuelva a intentar la toma.
      return res.redirect(`/donaciones/${resultado.donacion.codigo}/tomada`);
    }
    // CA-03.5: un reintento de quien ya la tomó muestra sus datos, sin duplicar nada.
    if (resultado.motivo === 'ya_es_tuya') {
      return mostrarTomada(res, resultado.donacion, 'Ya tomaste esta donación');
    }
    mostrarRechazo(res, resultado.motivo, resultado.donacion);
  } catch (error) {
    next(error);
  }
});

// Después de tomarla, el voluntario ve el punto de recogida y la hora límite (CA-03.1).
router.get('/donaciones/:codigo/tomada', soloVoluntarios, async (req, res, next) => {
  try {
    const info = await motivoNoDisponible(req.params.codigo, req.session.usuario.id);
    if (info.motivo === 'ya_es_tuya') return mostrarTomada(res, info.donacion, 'Tomaste esta donación');
    mostrarRechazo(res, info.motivo === 'disponible' ? 'no_existe' : info.motivo, info.donacion);
  } catch (error) {
    next(error);
  }
});

// CA-03.1: la donación tomada aparece en «Mis recogidas».
router.get('/mis-recogidas', soloVoluntarios, async (req, res, next) => {
  try {
    const recogidas = (await listarRecogidasDe(req.session.usuario.id)).map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
      horaLimiteTexto: formatearFechaHora(d.hora_limite),
    }));
    res.render('mis-recogidas', { recogidas });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
