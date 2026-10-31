// Crea la primera coordinadora en producción (T-ADM.3, plan técnico sección 5). El plan gratis de Render no tiene
// consola, así que el nombre y el PIN vienen de las variables PRIMERA_COORDINADORA_NOMBRE y PRIMERA_COORDINADORA_PIN,
// que se escriben en la página de Render (nunca en el repositorio). Solo actúa si no hay ninguna coordinadora activa,
// así que se puede ejecutar en cada arranque. Esa persona debe cambiar el PIN al entrar (CA-11.4).
//   npm run db:primera-coordinadora
const bcrypt = require('bcryptjs');
const { pool } = require('./conexion');

// `cliente` permite a las pruebas usar una transacción que después se deshace.
async function crearPrimeraCoordinadora({ nombre, pin, cliente = pool }) {
  const activas = await cliente.query("SELECT count(*)::int AS total FROM usuarios WHERE rol = 'coordinadora' AND activo");
  if (activas.rows[0].total > 0) return { creada: false, motivo: 'Ya hay una coordinadora activa: no se cambia nada.' };

  const nombreLimpio = (nombre || '').trim();
  if (!nombreLimpio || !/^\d{4}$/.test(pin || '')) {
    return {
      creada: false,
      motivo: 'No hay ninguna coordinadora activa. Define PRIMERA_COORDINADORA_NOMBRE y PRIMERA_COORDINADORA_PIN (4 números) y vuelve a arrancar.',
    };
  }

  const pinHash = await bcrypt.hash(pin, 10);
  await cliente.query(
    "INSERT INTO usuarios (nombre, rol, pin_hash, debe_cambiar_pin) VALUES ($1, 'coordinadora', $2, TRUE)",
    [nombreLimpio, pinHash]
  );
  return { creada: true, motivo: `Coordinadora «${nombreLimpio}» creada. Deberá cambiar el PIN la primera vez que entre.` };
}

module.exports = { crearPrimeraCoordinadora };

// Nunca detiene el arranque: si falta algo, lo dice en el registro y el servidor arranca igual.
if (require.main === module) {
  crearPrimeraCoordinadora({ nombre: process.env.PRIMERA_COORDINADORA_NOMBRE, pin: process.env.PRIMERA_COORDINADORA_PIN })
    .then((r) => console.log(r.motivo))
    .catch((error) => console.error(`No se pudo revisar la primera coordinadora: ${error.message}`))
    .finally(() => pool.end());
}
