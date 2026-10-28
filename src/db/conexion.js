// Conexión a PostgreSQL. La cadena de conexión viene de la variable de entorno DATABASE_URL.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Atajo para ejecutar una consulta con parámetros ($1, $2, ...). Los parámetros evitan inyección SQL.
function consultar(texto, parametros) {
  return pool.query(texto, parametros);
}

module.exports = { pool, consultar };
