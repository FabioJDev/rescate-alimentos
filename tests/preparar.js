// Se ejecuta antes de cada archivo de pruebas (package.json → jest.setupFilesAfterEnv).
const { consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

beforeAll(async () => {
  await migrar();

  // Todas las pruebas entran desde la misma dirección (127.0.0.1) y algunas usan nombres fijos («Nadie»). Sin esto,
  // correr la suite varias veces seguidas sumaría los fallos de todas las corridas y el límite de CMP-16 bloquearía
  // pruebas ajenas. Cada archivo empieza con el conteo de intentos en cero.
  await consultar('DELETE FROM intentos_ingreso');

  // CMP-18: SOLO en la base de pruebas, los usuarios que crean las pruebas nacen con el aviso de privacidad aceptado,
  // para que las pruebas de los demás comportamientos no tengan que aceptarlo antes de cada acción. Las pruebas de
  // CMP-18 lo dejan vacío a propósito. En producción el valor por defecto sigue vacío (migración 012).
  await consultar('ALTER TABLE usuarios ALTER COLUMN privacidad_aceptada_en SET DEFAULT now()');
});
