// Rutas de ingreso y salida con nombre + PIN de 4 dígitos (ADR-003).
const express = require('express');
const { autenticar } = require('../servicios/usuarios');
const { estaBloqueado, registrarFallo, limpiarNombre } = require('../servicios/intentos');

const router = express.Router();

const MENSAJE_INGRESO_FALLIDO = 'El nombre o el PIN no son correctos.';
const MENSAJE_BLOQUEO = 'Demasiados intentos. Espera 15 minutos o pide a la coordinadora que restablezca tu PIN.';

router.get('/ingreso', (req, res) => {
  if (req.session.usuario) return res.redirect('/');
  res.render('ingreso', { error: null, nombre: '' });
});

router.post('/ingreso', async (req, res, next) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    const pin = (req.body.pin || '').trim();

    // CA-16.1 y CA-16.5: bloqueado por demasiados intentos, aunque esta vez el PIN sea correcto.
    if (await estaBloqueado(nombre, req.ip)) {
      return res.status(429).render('ingreso', { error: MENSAJE_BLOQUEO, nombre });
    }

    // El PIN son exactamente 4 dígitos; cualquier otra cosa se rechaza sin consultar la base. No cuenta como
    // intento: un PIN con letras nunca puede adivinar uno real.
    if (!nombre || !/^\d{4}$/.test(pin)) {
      return res.status(401).render('ingreso', { error: MENSAJE_INGRESO_FALLIDO, nombre });
    }

    const usuario = await autenticar(nombre, pin);
    if (!usuario) {
      // CA-16.6: se cuenta igual exista o no el nombre, y el mensaje es el mismo.
      await registrarFallo(nombre, req.ip);
      return res.status(401).render('ingreso', { error: MENSAJE_INGRESO_FALLIDO, nombre });
    }
    await limpiarNombre(nombre); // CA-16.3
    // CA-10.6: un usuario desactivado no entra, aunque su PIN sea correcto.
    if (usuario.desactivado) {
      return res.status(403).render('ingreso', { error: 'Tu usuario está desactivado. Habla con la coordinadora.', nombre });
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
