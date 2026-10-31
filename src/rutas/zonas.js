// CMP-09 · Administrar las zonas (solo la coordinadora, CA-09.6).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { listarZonasConUso, buscarZona, crearZona, renombrarZona, cambiarActiva } = require('../servicios/zonas');

const router = express.Router();
const soloCoordinadora = requerirRol('coordinadora');

// El aviso de la última acción se guarda en la sesión para mostrarlo una vez después de redirigir.
function tomarAviso(req) {
  const aviso = req.session.aviso || null;
  delete req.session.aviso;
  return aviso;
}

async function mostrarLista(req, res, { estado = 200, error = null, nombre = '' } = {}) {
  res.status(estado).render('zonas', {
    zonas: await listarZonasConUso(),
    aviso: tomarAviso(req),
    error,
    nombre,
  });
}

function noExiste(res) {
  res.status(404).render('error', { titulo: 'No encontramos esa zona', mensaje: 'Vuelve a la lista de zonas.', volverA: '/zonas', volverNombre: 'Zonas' });
}

// CA-09.1: la lista, con el formulario para crear una zona nueva arriba.
router.get('/zonas', soloCoordinadora, async (req, res, next) => {
  try {
    await mostrarLista(req, res);
  } catch (error) {
    next(error);
  }
});

// CA-09.2 y CA-09.3.
router.post('/zonas', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await crearZona(req.body.nombre);
    if (resultado.error) return mostrarLista(req, res, { estado: 400, error: resultado.error, nombre: resultado.nombre });
    req.session.aviso = `Zona «${resultado.zona.nombre}» creada.`;
    res.redirect('/zonas');
  } catch (error) {
    next(error);
  }
});

router.get('/zonas/:id(\\d+)/editar', soloCoordinadora, async (req, res, next) => {
  try {
    const zona = await buscarZona(req.params.id);
    if (!zona) return noExiste(res);
    res.render('zona-editar', { zona, nombre: zona.nombre, error: null });
  } catch (error) {
    next(error);
  }
});

// CA-09.4: renombrar.
router.post('/zonas/:id(\\d+)', soloCoordinadora, async (req, res, next) => {
  try {
    const resultado = await renombrarZona(Number(req.params.id), req.body.nombre);
    if (resultado.noExiste) return noExiste(res);
    if (resultado.error) {
      const zona = await buscarZona(req.params.id);
      return res.status(400).render('zona-editar', { zona, nombre: resultado.nombre, error: resultado.error });
    }
    req.session.aviso = `Zona renombrada a «${resultado.zona.nombre}».`;
    res.redirect('/zonas');
  } catch (error) {
    next(error);
  }
});

// CA-09.5: desactivar (solo si nadie activo la usa) y volver a activar.
router.post('/zonas/:id(\\d+)/:accion(desactivar|activar)', soloCoordinadora, async (req, res, next) => {
  try {
    const activa = req.params.accion === 'activar';
    const resultado = await cambiarActiva(req.params.id, activa);
    if (resultado.noExiste) return noExiste(res);
    if (resultado.error) return mostrarLista(req, res, { estado: 409, error: resultado.error });
    req.session.aviso = `Zona «${resultado.zona.nombre}» ${activa ? 'activada' : 'desactivada'}.`;
    res.redirect('/zonas');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
