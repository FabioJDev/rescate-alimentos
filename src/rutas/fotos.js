// CMP-23 · Ver la foto de una donación. Solo con sesión (CA-23.4) y solo si alguien la pide (CA-23.3, RNF-02).
const express = require('express');
const { requerirSesion } = require('../middleware/autenticacion');
const { obtenerFoto } = require('../servicios/fotos');

const router = express.Router();

router.get('/donaciones/:codigo(D-\\d+)/foto', requerirSesion, async (req, res, next) => {
  try {
    const foto = await obtenerFoto(req.params.codigo);
    if (!foto) {
      return res.status(404).render('error', { titulo: 'Sin foto', mensaje: 'Esta donación no tiene foto.' });
    }
    res.set('Content-Type', foto.tipo);
    // Privada: el navegador puede guardarla un rato, pero ningún intermediario.
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(foto.datos);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
