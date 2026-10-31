// CMP-23 · Foto opcional de la donación (ADR-007).
const { consultar } = require('../db/conexion');

const MAXIMO_BYTES = 400 * 1024;

// Los primeros bytes de cada formato. Se mira el contenido real y no lo que diga el nombre o el navegador:
// así nadie sube otro tipo de archivo disfrazado de imagen (CA-23.2).
function tipoReal(datos) {
  if (datos.length >= 3 && datos[0] === 0xff && datos[1] === 0xd8 && datos[2] === 0xff) return 'image/jpeg';
  if (datos.length >= 8 && datos.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (datos.length >= 12 && datos.toString('ascii', 0, 4) === 'RIFF' && datos.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

// El teléfono manda la foto ya achicada como texto «data:image/jpeg;base64,...» en un campo oculto del formulario.
// Devuelve { foto: null } si no hay foto, { foto } si sirve o { error } si no.
function leerFoto(texto) {
  const valor = (texto || '').trim();
  if (!valor) return { foto: null };

  const partes = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(valor);
  if (!partes) return { error: 'La foto debe ser una imagen JPEG, PNG o WebP.' };

  const datos = Buffer.from(partes[2], 'base64');
  if (datos.length > MAXIMO_BYTES) return { error: 'La foto pesa más de 400 KB. Elige otra o tómala de nuevo.' };

  const tipo = tipoReal(datos);
  if (!tipo) return { error: 'La foto debe ser una imagen JPEG, PNG o WebP.' };
  return { foto: { tipo, datos } };
}

// Se guarda dentro de la transacción del registro (`cliente`): o quedan la donación y su foto, o ninguna.
async function guardarFoto(cliente, donacionId, foto) {
  await cliente.query('INSERT INTO fotos_donacion (donacion_id, tipo, datos, bytes) VALUES ($1, $2, $3, $4)', [
    donacionId,
    foto.tipo,
    foto.datos,
    foto.datos.length,
  ]);
}

async function obtenerFoto(codigo) {
  const r = await consultar(
    `SELECT f.tipo, f.datos FROM fotos_donacion f JOIN donaciones d ON d.id = f.donacion_id WHERE d.codigo = $1`,
    [codigo]
  );
  return r.rows[0] || null;
}

module.exports = { MAXIMO_BYTES, leerFoto, guardarFoto, obtenerFoto };
