// Rutas de las donaciones. Aquí: CMP-01 (registrar una donación).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { consultar } = require('../db/conexion');
const { TIPOS_ALIMENTO, UNIDADES, registrarDonacion, buscarPorCodigo } = require('../servicios/donaciones');
const { validarDonacion } = require('../servicios/validar-donacion');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

// El donante registra lo suyo; la coordinadora registra a nombre de un comercio que avisa por llamada (CA-01.5).
const donanteOCoordinadora = requerirRol('donante', 'coordinadora');

// Los comercios entre los que puede elegir la coordinadora.
async function listarComercios() {
  const r = await consultar("SELECT id, nombre, zona, direccion FROM usuarios WHERE rol = 'donante' ORDER BY nombre");
  return r.rows;
}

// `comercios` es null cuando quien registra es un donante: no tiene que elegir comercio.
function mostrarFormulario(res, estado, valores, errores, comercios) {
  res.status(estado).render('donacion-nueva', {
    tipos: TIPOS_ALIMENTO,
    unidades: UNIDADES,
    valores,
    errores,
    comercios,
  });
}

// CA-01.6: el registro es una sola pantalla con 4 campos obligatorios (abrir, llenar, enviar).
router.get('/donaciones/nueva', donanteOCoordinadora, async (req, res, next) => {
  try {
    const usuario = req.session.usuario;
    const esCoordinadora = usuario.rol === 'coordinadora';

    // El punto de recogida viene por defecto con la dirección del comercio, y se puede editar.
    let puntoRecogida = '';
    if (!esCoordinadora) {
      const r = await consultar('SELECT direccion FROM usuarios WHERE id = $1', [usuario.id]);
      puntoRecogida = r.rows[0] ? r.rows[0].direccion || '' : '';
    }

    const valores = {
      tipo_alimento: '',
      cantidad: '',
      unidad: UNIDADES[0],
      punto_recogida: puntoRecogida,
      hora_limite: '',
      donante_id: '',
    };
    mostrarFormulario(res, 200, valores, {}, esCoordinadora ? await listarComercios() : null);
  } catch (error) {
    next(error);
  }
});

// CA-01.1: se guarda la donación «disponible» con su autor y fecha de registro, y se muestra su código.
// CA-01.2 a CA-01.4: si algo está mal no se guarda nada, se dice qué falla y se conserva lo escrito.
// CA-01.5: si registra la coordinadora, la donación queda a nombre del comercio y con ella como «registrada por».
router.post('/donaciones', donanteOCoordinadora, async (req, res, next) => {
  try {
    const usuario = req.session.usuario;
    const esCoordinadora = usuario.rol === 'coordinadora';
    const comercios = esCoordinadora ? await listarComercios() : null;

    // Si quien registra es un donante, se ignora cualquier `donante_id` que venga en el formulario:
    // un donante solo puede registrar donaciones a su propio nombre.
    const { errores, valores, datos } = validarDonacion(req.body, new Date(), { comercios });

    if (Object.keys(errores).length > 0) {
      return mostrarFormulario(res, 400, valores, errores, comercios);
    }

    const donanteId = esCoordinadora ? datos.comercio.id : usuario.id;
    const zona = esCoordinadora
      ? datos.comercio.zona
      : (await consultar('SELECT zona FROM usuarios WHERE id = $1', [usuario.id])).rows[0].zona;

    const donacion = await registrarDonacion({
      donanteId,
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

router.get('/donaciones/:codigo/registrada', donanteOCoordinadora, async (req, res, next) => {
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

    const donante = (await consultar('SELECT nombre FROM usuarios WHERE id = $1', [donacion.donante_id])).rows[0];
    res.render('donacion-registrada', {
      donacion,
      donanteNombre: donante.nombre,
      aNombreDeOtro: donacion.donante_id !== usuario.id,
      horaLimite: formatearFechaHora(donacion.hora_limite),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
