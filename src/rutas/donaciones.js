// Rutas de las donaciones. Aquí: CMP-01 (registrar una donación).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { consultar } = require('../db/conexion');
const { TIPOS_ALIMENTO, UNIDADES, registrarDonacion, buscarPorCodigo } = require('../servicios/donaciones');
const { validarDonacion } = require('../servicios/validar-donacion');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

function mostrarFormulario(res, estado, valores, errores) {
  res.status(estado).render('donacion-nueva', {
    tipos: TIPOS_ALIMENTO,
    unidades: UNIDADES,
    valores,
    errores,
  });
}

// CA-01.6: el registro es una sola pantalla con 4 campos obligatorios (abrir, llenar, enviar).
router.get('/donaciones/nueva', requerirRol('donante'), async (req, res, next) => {
  try {
    // El punto de recogida viene por defecto con la dirección del comercio, y se puede editar.
    const r = await consultar('SELECT direccion FROM usuarios WHERE id = $1', [req.session.usuario.id]);
    const valores = {
      tipo_alimento: '',
      cantidad: '',
      unidad: UNIDADES[0],
      punto_recogida: r.rows[0] ? r.rows[0].direccion || '' : '',
      hora_limite: '',
    };
    mostrarFormulario(res, 200, valores, {});
  } catch (error) {
    next(error);
  }
});

// CA-01.1: se guarda la donación «disponible» con su autor y fecha de registro, y se muestra su código.
// CA-01.2 a CA-01.4: si algo está mal no se guarda nada, se dice qué falla y se conserva lo escrito.
router.post('/donaciones', requerirRol('donante'), async (req, res, next) => {
  try {
    const usuario = req.session.usuario;
    const { errores, valores, datos } = validarDonacion(req.body);

    if (Object.keys(errores).length > 0) {
      return mostrarFormulario(res, 400, valores, errores);
    }

    const zona = (await consultar('SELECT zona FROM usuarios WHERE id = $1', [usuario.id])).rows[0].zona;
    const donacion = await registrarDonacion({
      donanteId: usuario.id,
      registradaPorId: usuario.id,
      tipoAlimento: datos.tipoAlimento,
      cantidad: datos.cantidad,
      unidad: datos.unidad,
      puntoRecogida: datos.puntoRecogida,
      zona,
      horaLimite: datos.horaLimite,
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
