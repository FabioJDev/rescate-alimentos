// CMP-11 · Cambiar el propio PIN (todos) y restablecer el de otra persona (solo la coordinadora). Ver ADR-005.
const express = require('express');
const { requerirSesion, requerirRol } = require('../middleware/autenticacion');
const { buscarUsuario, cambiarPin, restablecerPin } = require('../servicios/usuarios');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

function mostrarFormulario(req, res, estado, errores = {}) {
  res.status(estado).render('mi-pin', { errores, temporal: Boolean(req.session.usuario.debeCambiarPin) });
}

router.get('/mi-pin', requerirSesion, (req, res) => {
  mostrarFormulario(req, res, 200);
});

// CA-11.1 y CA-11.2. Tras cambiarlo sigue con su sesión (y si era temporal, ya puede usar todo, CA-11.4).
router.post('/mi-pin', requerirSesion, async (req, res, next) => {
  try {
    const resultado = await cambiarPin(req.session.usuario.id, req.body);
    if (resultado.errores) return mostrarFormulario(req, res, 400, resultado.errores);

    req.session.usuario = { ...req.session.usuario, debeCambiarPin: false };
    req.session.aviso = 'Tu PIN quedó cambiado. Úsalo la próxima vez que entres.';
    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

function noExiste(res) {
  res.status(404).render('error', {
    titulo: 'No encontramos ese usuario',
    mensaje: 'Vuelve a la lista de usuarios.',
    volverA: '/usuarios',
    volverNombre: 'Usuarios',
  });
}

// CA-11.3: primero se confirma; el PIN solo se cambia al pulsar el botón.
router.get('/usuarios/:id(\\d+)/restablecer-pin', soloCoordinadora, async (req, res, next) => {
  try {
    const usuario = await buscarUsuario(req.params.id);
    if (!usuario) return noExiste(res);
    res.render('pin-restablecer', { usuario });
  } catch (error) {
    next(error);
  }
});

router.post('/usuarios/:id(\\d+)/restablecer-pin', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await restablecerPin(Number(req.params.id), req.session.usuario);
    if (resultado.noExiste) return noExiste(res);
    if (resultado.error) {
      return res.status(409).render('error', { titulo: 'No se restableció', mensaje: resultado.error, volverA: '/usuarios', volverNombre: 'Usuarios' });
    }
    res.render('usuario-pin', { usuario: resultado.usuario, pin: resultado.pin, nuevo: false });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
