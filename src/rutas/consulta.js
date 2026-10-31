// CMP-05 · Consultar el estado de una donación en cualquier momento (y CA-02.4: «Vencida»).
const express = require('express');
const { requerirSesion } = require('../middleware/autenticacion');
const { obtenerDetalle } = require('../servicios/donaciones');
const { formatearFechaHora } = require('../utilidades/fechas');
const { etiquetaDeEstado } = require('../utilidades/estados');
const { puedeCambiar } = require('../servicios/correcciones');

const router = express.Router();

const MENSAJE_NO_EXISTE = 'No existe una donación con ese código';

// «D-0012», «d-12» y «12» se entienden como el mismo código.
function normalizarCodigo(texto) {
  const limpio = (texto || '').trim().toUpperCase();
  const soloNumero = /^(?:D-?)?(\d{1,9})$/.exec(limpio);
  return soloNumero ? `D-${soloNumero[1].padStart(4, '0')}` : limpio;
}

// CA-05.2: cada paso del historial como una frase, en el orden en que ocurrió.
function frasesDelHistorial(donacion, historial) {
  return historial.map((paso) => {
    const cuando = formatearFechaHora(paso.ocurrido_en);
    if (paso.tipo === 'registro') return { cuando, texto: `Registrada por ${paso.usuario_nombre}` };
    if (paso.tipo === 'toma') return { cuando, texto: `Tomada por ${paso.usuario_nombre}` };
    // CA-06.6: soltar una donación también queda en el historial.
    // CA-14.1: si la liberó la coordinadora, el detalle dice a quién se la quitó.
    if (paso.tipo === 'liberacion') {
      return { cuando, texto: paso.detalle ? `Liberada por ${paso.usuario_nombre} (${paso.detalle})` : `Soltada por ${paso.usuario_nombre}` };
    }
    if (paso.tipo === 'asignacion') return { cuando, texto: paso.detalle };
    // CA-13.1 y CA-13.6: las correcciones dicen qué cambió y las cancelaciones, por qué.
    if (paso.tipo === 'correccion') return { cuando, texto: `Corregida por ${paso.usuario_nombre}. ${paso.detalle}` };
    if (paso.tipo === 'cancelacion') return { cuando, texto: `Cancelada por ${paso.usuario_nombre}. Motivo: ${paso.detalle}` };
    // CA-14.4: quien entregó es el voluntario; si la registró la coordinadora en su nombre, también se dice.
    const registro = paso.usuario_nombre !== donacion.voluntario_nombre ? `. Registrada por ${paso.usuario_nombre}` : '';
    return {
      cuando,
      texto: `Entregada a ${donacion.organizacion_nombre}. Recibió: ${donacion.recibido_por}. Entregó: ${donacion.voluntario_nombre}${registro}`,
    };
  });
}

function mostrarNoExiste(res) {
  res.status(404).render('buscar', { mensaje: MENSAJE_NO_EXISTE, codigo: '' });
}

// CA-05.1: la búsqueda por código lleva al detalle.
router.get('/buscar', requerirSesion, (req, res) => {
  const codigoBuscado = req.query.codigo;
  if (codigoBuscado === undefined) return res.render('buscar', { mensaje: null, codigo: '' });

  const codigo = normalizarCodigo(codigoBuscado);
  if (!/^D-\d+$/.test(codigo)) return res.status(404).render('buscar', { mensaje: MENSAJE_NO_EXISTE, codigo: codigoBuscado });
  res.redirect(`/donaciones/${codigo}`);
});

// CA-05.1 a CA-05.4: cualquier usuario con sesión ve el estado actual, los datos y el historial.
router.get('/donaciones/:codigo(D-\\d+)', requerirSesion, async (req, res, next) => {
  try {
    const detalle = await obtenerDetalle(req.params.codigo);
    if (!detalle) return mostrarNoExiste(res);

    const { donacion, historial } = detalle;
    const usuario = req.session.usuario;
    res.render('donacion-detalle', {
      donacion: { ...donacion, cantidad: Number(donacion.cantidad) },
      estadoTexto: etiquetaDeEstado(donacion),
      horaLimite: formatearFechaHora(donacion.hora_limite),
      historial: frasesDelHistorial(donacion, historial),
      puedeCorregir: puedeCambiar('corregir', donacion, usuario),
      puedeCancelar: puedeCambiar('cancelar', donacion, usuario),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
