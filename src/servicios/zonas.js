// CMP-09 · Catálogo de zonas. Las zonas se crean, se renombran y se desactivan; nunca se borran, porque las
// donaciones antiguas guardan el nombre de su zona.
const { pool, consultar } = require('../db/conexion');

// Quien lo escribió con espacios de más («  Norte   alto ») queda como «Norte alto».
function limpiarNombre(texto) {
  return (texto || '').trim().replace(/\s+/g, ' ');
}

// CA-09.3: el nombre es obligatorio y corto. La repetición la detecta la base de datos (índice único).
function validarNombre(texto) {
  const nombre = limpiarNombre(texto);
  if (!nombre) return { nombre, error: 'Falta el nombre de la zona' };
  if (nombre.length > 60) return { nombre, error: 'El nombre de la zona es muy largo' };
  return { nombre, error: null };
}

const MENSAJE_REPETIDA = 'Ya existe una zona con ese nombre';

// CA-09.1: cada zona con cuántos usuarios y organizaciones la usan. Se compara sin importar mayúsculas ni
// espacios porque los datos de antes de la lista se escribieron a mano.
async function listarZonasConUso() {
  const r = await consultar(
    `SELECT z.id, z.nombre, z.activa,
            (SELECT count(*)::int FROM usuarios u
              WHERE u.activo AND lower(trim(u.zona)) = lower(trim(z.nombre))) AS usuarios,
            (SELECT count(*)::int FROM organizaciones o
              WHERE lower(trim(o.zona)) = lower(trim(z.nombre))) AS organizaciones
       FROM zonas z
      ORDER BY z.activa DESC, z.nombre`
  );
  return r.rows;
}

// Las zonas que se pueden elegir en los formularios (CA-09.2).
async function listarZonasActivas() {
  const r = await consultar('SELECT id, nombre FROM zonas WHERE activa ORDER BY nombre');
  return r.rows;
}

async function buscarZona(id) {
  const r = await consultar('SELECT id, nombre, activa FROM zonas WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// CA-09.2: crea la zona activa. Devuelve { error } si el nombre no sirve.
async function crearZona(texto) {
  const { nombre, error } = validarNombre(texto);
  if (error) return { error, nombre };
  try {
    const r = await consultar('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id, nombre, activa', [nombre]);
    return { zona: r.rows[0] };
  } catch (e) {
    // 23505 = violación de unicidad: ya hay una zona que se llama igual.
    if (e.code === '23505') return { error: MENSAJE_REPETIDA, nombre };
    throw e;
  }
}

// CA-09.4: el nombre nuevo se aplica a la zona y a todo lo que la usa, en una sola transacción: o cambia todo
// o no cambia nada. Así los voluntarios siguen viendo las donaciones de su zona.
async function renombrarZona(id, texto) {
  const { nombre, error } = validarNombre(texto);
  if (error) return { error, nombre };

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const anterior = await cliente.query('SELECT nombre FROM zonas WHERE id = $1 FOR UPDATE', [id]);
    if (anterior.rows.length === 0) {
      await cliente.query('ROLLBACK');
      return { noExiste: true };
    }
    const nombreAnterior = anterior.rows[0].nombre;

    await cliente.query('UPDATE zonas SET nombre = $1 WHERE id = $2', [nombre, id]);
    for (const tabla of ['usuarios', 'organizaciones', 'donaciones']) {
      await cliente.query(`UPDATE ${tabla} SET zona = $1 WHERE lower(trim(zona)) = lower(trim($2))`, [
        nombre,
        nombreAnterior,
      ]);
    }
    await cliente.query('COMMIT');
    return { zona: { id, nombre } };
  } catch (e) {
    await cliente.query('ROLLBACK');
    if (e.code === '23505') return { error: MENSAJE_REPETIDA, nombre };
    throw e;
  } finally {
    cliente.release();
  }
}

// CA-09.5: solo se desactiva si nadie la usa; si la usan, se dice cuántos. Activar siempre se puede.
async function cambiarActiva(id, activa) {
  const zona = (await listarZonasConUso()).find((z) => z.id === Number(id));
  if (!zona) return { noExiste: true };

  if (!activa && (zona.usuarios > 0 || zona.organizaciones > 0)) {
    return {
      error: `No se puede desactivar «${zona.nombre}»: la usan ${zona.usuarios} usuario(s) y ${zona.organizaciones} organización(es). Cámbiales la zona primero.`,
    };
  }
  await consultar('UPDATE zonas SET activa = $1 WHERE id = $2', [activa, id]);
  return { zona: { ...zona, activa } };
}

// Para los formularios: la zona elegida tiene que existir en la lista y estar activa (CA-10.4 y CA-12.3).
async function esZonaActiva(nombre) {
  const r = await consultar('SELECT 1 FROM zonas WHERE activa AND nombre = $1', [nombre]);
  return r.rows.length > 0;
}

module.exports = {
  validarNombre,
  listarZonasConUso,
  listarZonasActivas,
  buscarZona,
  crearZona,
  renombrarZona,
  cambiarActiva,
  esZonaActiva,
};
