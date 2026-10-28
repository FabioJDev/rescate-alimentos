// Rutas de ingreso y salida con nombre + PIN de 4 dígitos (ADR-003).
const express = require('express');
const { autenticar } = require('../servicios/usuarios');

const router = express.Router();

const MENSAJE_INGRESO_FALLIDO = 'El nombre o el PIN no son correctos.';

router.get('/ingreso', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.render('ingreso', { error: null, nombre: '' });
});

router.post('/ingreso', async (req, res, next) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    const pin = (req.body.pin || '').trim();

    // El PIN son exactamente 4 dígitos; cualquier otra cosa se rechaza sin consultar la base.
    if (!nombre || !/^\d{4}$/.test(pin)) {
      return res.status(401).render('ingreso', { error: MENSAJE_INGRESO_FALLIDO, nombre });
    }

    const usuario = await autenticar(nombre, pin);
    if (!usuario) {
      return res.status(401).render('ingreso', { error: MENSAJE_INGRESO_FALLIDO, nombre });
    }

    // Se regenera la sesión al ingresar para no reutilizar una sesión anterior.
    req.session.regenerate((errorSesion) => {
      if (errorSesion) return next(errorSesion);
      req.session.usuario = usuario;
      res.redirect('/');
    });
  } catch (error) {
    next(error);
  }
});

router.post('/salir', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('connect.sid');
    res.redirect('/ingreso');
  });
});

module.exports = router;
