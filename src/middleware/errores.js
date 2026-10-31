// T-SEG.2 · Registro de errores con código (ADR-006).
const crypto = require('crypto');

// Un código corto y fácil de dictar por teléfono: 6 letras y números («7F3A0C»).
function nuevoCodigo() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// CA-SEG.4 y CA-SEG.5: el usuario ve solo el código; el registro de Render guarda una línea con el mismo código y
// todo lo necesario para encontrar el problema. Nunca se muestra la pila ni el mensaje interno en la página.
// eslint-disable-next-line no-unused-vars
function manejarError(error, req, res, next) {
  // CA-23.2: un envío demasiado grande (una foto sin achicar) no es un error del sistema: se explica.
  if (error.type === 'entity.too.large') {
    return res.status(413).render('error', {
      titulo: 'El envío es muy pesado',
      mensaje: 'La foto pesa demasiado. Vuelve atrás, quítala o elige otra, y publica de nuevo.',
    });
  }

  const codigo = nuevoCodigo();
  const usuario = req.session && req.session.usuario;
  console.error(
    JSON.stringify({
      nivel: 'error',
      codigo,
      fecha: new Date().toISOString(),
      metodo: req.method,
      ruta: req.originalUrl,
      usuario_id: usuario ? usuario.id : null,
      mensaje: error.message,
      pila: error.stack,
    })
  );

  if (req.path.startsWith('/api/')) return res.status(500).json({ estado: 'error', codigo });
  res.status(500).render('error', {
    titulo: 'Algo salió mal',
    mensaje: `Algo salió mal. Si vuelve a pasar, avisa a la coordinadora con este código: ${codigo}`,
  });
}

module.exports = { manejarError };
