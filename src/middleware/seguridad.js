// T-SEG.1 · Formularios de otros sitios y cabeceras de seguridad (ADR-006).
const helmet = require('helmet');

// CA-SEG.3: cabeceras de seguridad. Solo se permiten scripts propios (las vistas no tienen JavaScript en línea),
// la aplicación no se puede mostrar dentro de otra página y el navegador no adivina tipos de archivo.
function cabeceras({ enProduccion }) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        'frame-ancestors': ["'none'"],
        // Las fotos (CMP-23) se previsualizan en el teléfono antes de enviarlas.
        'img-src': ["'self'", 'data:', 'blob:'],
        // En local no hay HTTPS: pedir «subir a https» rompería los estilos y scripts.
        'upgrade-insecure-requests': enProduccion ? [] : null,
      },
    },
    frameguard: { action: 'deny' },
    // NO «no-referrer» (lo que trae helmet por defecto): con esa política el navegador manda «Origin: null» en los
    // formularios y verificarOrigen los rechazaría todos. «same-origin» da el origen a la propia página y nada a otras.
    referrerPolicy: { policy: 'same-origin' },
  });
}

// CA-SEG.1 y CA-SEG.2: un envío (POST) que dice venir de otro sitio se rechaza. Los navegadores mandan la cabecera
// Origin en todo POST (o Referer si no); si no viene ninguna, no es un navegador engañado y se deja pasar.
function verificarOrigen(req, res, next) {
  if (req.method !== 'POST') return next();
  const procedencia = req.get('Origin') || req.get('Referer');
  if (!procedencia) return next();

  let host = null;
  try {
    host = new URL(procedencia).host;
  } catch {
    host = null; // «null» u otro valor raro: se trata como de otro sitio
  }
  if (host && host === req.get('Host')) return next();

  if (req.path.startsWith('/api/')) return res.status(403).json({ estado: 'origen_no_permitido' });
  res.status(403).render('error', {
    titulo: 'No se hizo nada',
    mensaje: 'Esta acción no viene de la página de Rescate de Alimentos.',
  });
}

module.exports = { cabeceras, verificarOrigen };
