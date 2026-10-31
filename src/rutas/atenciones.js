// CMP-20 · Personas atendidas: cada organización (o la coordinadora por ella) registra una cifra por día.
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { listarOrganizaciones } = require('../servicios/entregas');
const { hoyEnColombia } = require('../servicios/reporte');
const { fechaLegible, validarAtencion, registrarAtencion, corregirAtencion, listarRecientes } = require('../servicios/atenciones');

const router = express.Router();
// CA-20.6: solo organizaciones y la coordinadora.
const organizacionOCoordinadora = requerirRol('organizacion', 'coordinadora');

async function mostrar(req, res, estado, { valores, errores = {}, aviso = null, existente = null }) {
  const usuario = req.session.usuario;
  const esCoordinadora = usuario.rol === 'coordinadora';
  const recientes = (await listarRecientes(esCoordinadora ? null : usuario.organizacionId)).map((a) => ({
    ...a,
    fechaTexto: fechaLegible(a.fecha),
  }));
  res.status(estado).render('personas-atendidas', {
    esCoordinadora,
    organizaciones: esCoordinadora ? await listarOrganizaciones() : null,
    valores,
    errores,
    aviso,
    existente,
    recientes,
  });
}

function opcionesDeValidacion(usuario, organizaciones) {
  return usuario.rol === 'coordinadora' ? { organizaciones } : { organizacionPropiaId: usuario.organizacionId };
}

router.get('/personas-atendidas', organizacionOCoordinadora, async (req, res, next) => {
  try {
    const aviso = req.session.aviso || null;
    delete req.session.aviso;
    await mostrar(req, res, 200, { valores: { fecha: hoyEnColombia(), personas: '', organizacion_id: '' }, aviso });
  } catch (error) {
    next(error);
  }
});

// CA-20.1 a CA-20.4. Con `accion=corregir` se reemplaza la cifra que ya existía (CA-20.2).
router.post('/personas-atendidas', organizacionOCoordinadora, async (req, res, next) => {
  try {
    const usuario = req.session.usuario;
    const organizaciones = usuario.rol === 'coordinadora' ? await listarOrganizaciones() : null;
    const { errores, valores, datos } = validarAtencion(req.body, opcionesDeValidacion(usuario, organizaciones));
    if (Object.keys(errores).length > 0) return mostrar(req, res, 400, { valores, errores });

    if (req.body.accion === 'corregir') {
      const corregida = await corregirAtencion(datos, usuario.id);
      if (!corregida) return mostrar(req, res, 404, { valores, errores: { fecha: 'No hay nada registrado ese día para corregir.' } });
      req.session.aviso = `Se corrigió el ${fechaLegible(datos.fecha)}: ${datos.personas} personas.`;
      return res.redirect('/personas-atendidas');
    }

    const resultado = await registrarAtencion(datos, usuario.id);
    if (!resultado.registrada) {
      return mostrar(req, res, 409, { valores, existente: { personas: resultado.existentes, fecha: fechaLegible(datos.fecha) } });
    }
    req.session.aviso = `Registrado: ${datos.personas} personas el ${fechaLegible(datos.fecha)}.`;
    res.redirect('/personas-atendidas');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
