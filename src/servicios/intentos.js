// CMP-16 · Límite de intentos de ingreso (ADR-006).
const { consultar } = require('../db/conexion');

const LIMITE_POR_NOMBRE = 5;
const LIMITE_POR_ORIGEN = 20;
const MINUTOS = 15;

// «  Ana   PÉREZ » y «ana pérez» son el mismo nombre para contar intentos.
function claveDeNombre(nombre) {
  return `nombre:${(nombre || '').trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

function claveDeOrigen(origen) {
  return `origen:${origen || 'desconocido'}`;
}

// CA-16.1, CA-16.2 y CA-16.5: ¿el nombre o el origen siguen bloqueados?
async function estaBloqueado(nombre, origen) {
  const r = await consultar('SELECT 1 FROM intentos_ingreso WHERE clave = ANY($1) AND bloqueado_hasta > now()', [
    [claveDeNombre(nombre), claveDeOrigen(origen)],
  ]);
  return r.rows.length > 0;
}

// Suma un fallo en una sola sentencia (dos intentos al mismo tiempo no se pisan). Si el conteo empezó hace más de
// 15 minutos, vuelve a empezar. Al llegar al límite, bloquea 15 minutos y reinicia el conteo.
async function sumarFallo(clave, limite) {
  const r = await consultar(
    `INSERT INTO intentos_ingreso (clave, fallos, desde) VALUES ($1, 1, now())
     ON CONFLICT (clave) DO UPDATE SET
       fallos = CASE WHEN intentos_ingreso.desde < now() - make_interval(mins => $2) THEN 1
                     ELSE intentos_ingreso.fallos + 1 END,
       desde  = CASE WHEN intentos_ingreso.desde < now() - make_interval(mins => $2) THEN now()
                     ELSE intentos_ingreso.desde END
     RETURNING fallos`,
    [clave, MINUTOS]
  );
  if (r.rows[0].fallos >= limite) {
    await consultar(
      'UPDATE intentos_ingreso SET bloqueado_hasta = now() + make_interval(mins => $2), fallos = 0, desde = now() WHERE clave = $1',
      [clave, MINUTOS]
    );
  }
}

async function registrarFallo(nombre, origen) {
  await sumarFallo(claveDeNombre(nombre), LIMITE_POR_NOMBRE);
  await sumarFallo(claveDeOrigen(origen), LIMITE_POR_ORIGEN);
}

// CA-16.3 y CA-16.4: entrar bien o que la coordinadora restablezca el PIN deja el nombre en cero. El conteo por origen
// NO se limpia al entrar bien: si no, alguien podría entrar con su propio usuario entre intento e intento.
async function limpiarNombre(nombre) {
  await consultar('DELETE FROM intentos_ingreso WHERE clave = $1', [claveDeNombre(nombre)]);
}

module.exports = { LIMITE_POR_NOMBRE, LIMITE_POR_ORIGEN, MINUTOS, estaBloqueado, registrarFallo, limpiarNombre };
