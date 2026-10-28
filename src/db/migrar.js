// Aplica las migraciones SQL de src/db/migraciones, en orden, una sola vez cada una.
// Se puede ejecutar varias veces sin problema: las ya aplicadas se saltan.
const fs = require('fs');
const path = require('path');
const { pool } = require('./conexion');

const carpeta = path.join(__dirname, 'migraciones');

async function migrar() {
  const cliente = await pool.connect();
  try {
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
        nombre TEXT PRIMARY KEY,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const hechas = (await cliente.query('SELECT nombre FROM migraciones_aplicadas')).rows.map((f) => f.nombre);
    const archivos = fs.readdirSync(carpeta).filter((a) => a.endsWith('.sql')).sort();
    const aplicadas = [];

    for (const archivo of archivos) {
      if (hechas.includes(archivo)) continue;
      // Cada migración va en su propia transacción: o se aplica completa o no se aplica.
      await cliente.query('BEGIN');
      try {
        await cliente.query(fs.readFileSync(path.join(carpeta, archivo), 'utf8'));
        await cliente.query('INSERT INTO migraciones_aplicadas (nombre) VALUES ($1)', [archivo]);
        await cliente.query('COMMIT');
        aplicadas.push(archivo);
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falló la migración ${archivo}: ${error.message}`);
      }
    }
    return aplicadas;
  } finally {
    cliente.release();
  }
}

module.exports = { migrar };

// Si se ejecuta directamente (npm run db:migrar), aplica y cierra la conexión.
if (require.main === module) {
  migrar()
    .then((aplicadas) => {
      console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'No hay migraciones nuevas.');
      return pool.end();
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
