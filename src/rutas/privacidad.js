// CMP-18 · Aviso de privacidad y autorización de datos (Ley 1581 de 2012).
const express = require('express');
const { requerirSesion } = require('../middleware/autenticacion');
const { aceptarPrivacidad } = require('../servicios/usuarios');

const router = express.Router();

// CA-18.1: cualquiera puede leerlo, sin sesión. Con sesión y sin aceptar, la página muestra el botón «Acepto».
router.get('/privacidad', (req, res) => {
  const usuario = req.session && req.session.usuario;
  res.render('privacidad', { debeAceptar: Boolean(usuario && !usuario.privacidadAceptada) });
});

// CA-18.2: se guarda la aceptación y sigue al inicio (o a cambiar el PIN temporal, CA-18.4).
router.post('/privacidad/aceptar', requerirSesion, async (req, res, next) => {
  try {
    await aceptarPrivacidad(req.session.usuario.id);
    req.session.usuario = { ...req.session.usuario, privacidadAceptada: true };
    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
