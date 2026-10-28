// Rutas de las donaciones. Aquí: CMP-01 (registrar una donación).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { consultar } = require('../db/conexion');
const { TIPOS_ALIMENTO, UNIDADES, registrarDonacion, buscarPorCodigo } = require('../servicios/donaciones');
const { horaBogotaAIso, formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

// CA-01.6: el registro es una sola pantalla con 4 campos obligatorios (abrir, llenar, enviar).
router.get('/donaciones/nueva', requerirRol('donante'), async (req, res, next) => {
  try {
    // El punto de recogida viene por defecto con la dirección del comercio, y se puede editar.
    const r = await consultar('SELECT direccion FROM usuarios WHERE id = $1', [req.session.usuario.id]);
    res.render('donacion-nueva', {
      tipos: TIPOS_ALIMENTO,
      unidades: UNIDADES,
      puntoRecogida: r.rows[0] ? r.rows[0].direccion || '' : '',
    });
  } catch (error) {
    next(error);
  }
});

// CA-01.1: se guarda la donación «disponible» con su autor y fecha de registro, y se muestra su código.
router.post('/donaciones', requerirRol('donante'), async (req, res, next) => {
  try {
    const usuario = req.session.usuario;
    const datos = await consultar('SELECT zona FROM usuarios WHERE id = $1', [usuario.id]);

    const donacion = await registrarDonacion({
      donanteId: usuario.id,
      registradaPorId: usuario.id,
      tipoAlimento: req.body.tipo_alimento,
      cantidad: req.body.cantidad,
      unidad: req.body.unidad,
      puntoRecogida: (req.body.punto_recogida || '').trim(),
      zona: datos.rows[0].zona,
      horaLimite: horaBogotaAIso(req.body.hora_limite),
    });

    // Se redirige para que recargar la página de confirmación no registre la donación otra vez.
    res.redirect(`/donaciones/${donacion.codigo}/registrada`);
  } catch (error) {
    next(error);
  }
});

router.get('/donaciones/:codigo/registrada', requerirRol('donante', 'coordinadora'), async (req, res, next) => {
  try {
    const donacion = await buscarPorCodigo(req.params.codigo);
    const usuario = req.session.usuario;
    const esSuya = donacion && (donacion.donante_id === usuario.id || donacion.registrada_por_id === usuario.id);

    if (!esSuya) {
      return res.status(404).render('error', {
        titulo: 'No encontramos esa donación',
        mensaje: 'Revisa el código e intenta de nuevo.',
      });
    }

    res.render('donacion-registrada', {
      donacion,
      horaLimite: formatearFechaHora(donacion.hora_limite),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
