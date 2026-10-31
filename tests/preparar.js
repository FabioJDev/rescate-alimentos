// Se ejecuta antes de cada archivo de pruebas (package.json → jest.setupFilesAfterEnv).
// Todas las pruebas entran desde la misma dirección (127.0.0.1). Sin esto, correr la suite varias veces seguidas
// sumaría los fallos de ingreso de todas las corridas y el límite por origen de CMP-16 bloquearía pruebas ajenas.
const { consultar } = require('../src/db/conexion');

beforeAll(async () => {
  try {
    await consultar("DELETE FROM intentos_ingreso WHERE clave LIKE 'origen:%'");
  } catch (error) {
    // En una base recién creada la tabla aún no existe: la crea la migración de cada archivo.
    if (error.code !== '42P01') throw error;
  }
});
