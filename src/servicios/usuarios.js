// Lógica de usuarios: comprobar el nombre + PIN (ADR-003).
const bcrypt = require('bcryptjs');
const { consultar } = require('../db/conexion');

// Devuelve los datos públicos del usuario si el nombre y el PIN son correctos; si no, null.
// No dice cuál de los dos falló, para no ayudar a adivinar nombres.
async function autenticar(nombre, pin) {
  const resultado = await consultar(
    'SELECT id, nombre, rol, zona, pin_hash FROM usuarios WHERE nombre = $1',
    [nombre]
  );
  const usuario = resultado.rows[0];
  if (!usuario) return null;

  const pinCorrecto = await bcrypt.compare(pin, usuario.pin_hash);
  if (!pinCorrecto) return null;

  // Nunca devolvemos el hash del PIN fuera de este archivo.
  return { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, zona: usuario.zona };
}

module.exports = { autenticar };
