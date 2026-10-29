// CMP-08 · Registrar sin conexión (ADR-004). Aquí está lo que el servidor ofrece al teléfono:
// recibir una donación guardada sin señal, saber quién es el usuario actual y mostrar la pantalla «Sin conexión».
const express = require('express');
const { registrarDesdeFormulario } = require('../servicios/registrar');
const { buscarPorIdLocal } = require('../servicios/donaciones');
const { formatearFechaHora } = require('../utilidades/fechas');

const router = express.Router();

// Estas rutas las usa el JavaScript del teléfono: responden JSON y NO redirigen a «ingresar»
// (una redirección haría creer al teléfono que el envío salió bien).
const ROLES_QUE_REGISTRAN = ['donante', 'coordinadora'];

// CA-08.6: pantalla que se muestra sin conexión en cualquier página que no se guardó en el teléfono.
// No pide sesión: el service worker la guarda de antemano.
router.get('/sin-conexion', (req, res) => {
  res.render('sin-conexion');
});

// El teléfono pregunta quién es el usuario actual para enviar solo lo suyo.
router.get('/api/yo', (req, res) => {
  const usuario = req.session && req.session.usuario;
  if (!usuario) return res.status(401).json({ estado: 'sin_sesion' });
  res.json({ id: usuario.id, rol: usuario.rol });
});

// Un texto corto de la hora en que se guardó en el teléfono, solo si es una fecha razonable (no del futuro).
// El reloj del teléfono no es confiable: es un dato informativo, la fecha de registro la pone el servidor.
function textoDeCaptura(valor, ahora = new Date()) {
  const fecha = new Date(valor);
  if (typeof valor !== 'string' || Number.isNaN(fecha.getTime()) || fecha > new Date(ahora.getTime() + 60000)) return null;
  return `Guardada sin conexión el ${formatearFechaHora(fecha)}; enviada al volver la señal`;
}

const comoTexto = (valor) => (valor === null || valor === undefined ? '' : String(valor));

// CA-08.2 a CA-08.5 y CA-08.7: recibe UNA donación pendiente.
//   201 registrada · 200 ya estaba registrada (CA-08.3) · 422 datos inválidos (CA-08.4)
//   401 sin sesión · 409 es de otro usuario (CA-08.5) · 403 rol sin permiso (CA-08.7)
router.post('/api/donaciones/sincronizar', express.json({ limit: '20kb' }), async (req, res, next) => {
  try {
    const usuario = req.session && req.session.usuario;
    if (!usuario) return res.status(401).json({ estado: 'sin_sesion' });
    if (!ROLES_QUE_REGISTRAN.includes(usuario.rol)) return res.status(403).json({ estado: 'prohibido' });

    const cuerpo = req.body && typeof req.body === 'object' ? req.body : {};

    // CA-08.5: lo guardado por otra persona en ese teléfono no se registra a nombre de quien está ahora.
    if (Number(cuerpo.usuario_id) !== usuario.id) return res.status(409).json({ estado: 'otro_usuario' });

    const idLocal = comoTexto(cuerpo.id_local);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(idLocal)) {
      return res.status(422).json({ estado: 'invalida', errores: { id_local: 'El identificador de la donación no es válido.' } });
    }

    // CA-08.3: si ya se registró (envío repetido), se devuelve la misma, aunque ahora su hora límite ya haya pasado.
    const yaRegistrada = await buscarPorIdLocal(usuario.id, idLocal);
    if (yaRegistrada) return res.json({ estado: 'registrada', codigo: yaRegistrada.codigo, repetida: true });

    // CA-08.4: las mismas reglas de CMP-01 (CA-01.2 a CA-01.4). Todo llega como texto, como en el formulario.
    const campos = {};
    for (const nombre of ['tipo_alimento', 'cantidad', 'unidad', 'punto_recogida', 'hora_limite', 'donante_id']) {
      campos[nombre] = comoTexto(cuerpo[nombre]);
    }

    const resultado = await registrarDesdeFormulario(usuario, campos, {
      idLocal,
      detalle: textoDeCaptura(cuerpo.capturada_en),
    });

    if (resultado.errores) return res.status(422).json({ estado: 'invalida', errores: resultado.errores });

    const repetida = Boolean(resultado.donacion.repetida);
    res.status(repetida ? 200 : 201).json({ estado: 'registrada', codigo: resultado.donacion.codigo, repetida });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
