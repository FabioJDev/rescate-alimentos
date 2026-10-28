// Pruebas del modelo de datos (T-00.2). Necesitan un PostgreSQL real: ver DATABASE_URL en .env.example.
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

beforeAll(async () => {
  await migrar();
});

afterAll(async () => {
  await pool.end();
});

async function crearUsuario(nombre) {
  const r = await consultar(
    "INSERT INTO usuarios (nombre, rol, pin_hash) VALUES ($1, 'donante', 'hash-de-prueba') RETURNING id",
    [nombre]
  );
  return r.rows[0].id;
}

async function insertarDonacion(donanteId, { cantidad = 5, estado = 'disponible' } = {}) {
  return consultar(
    `INSERT INTO donaciones
       (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id, registrada_por_id)
     VALUES ('Panadería', $1, 'kg', 'Calle 1', 'Norte', now() + interval '2 hours', $2, $3, $3)
     RETURNING id, codigo, estado`,
    [cantidad, estado, donanteId]
  );
}

describe('Modelo de datos', () => {
  let donanteId;

  beforeAll(async () => {
    donanteId = await crearUsuario(`Donante de prueba ${Date.now()}`);
  });

  test('Esquema · existen las cuatro tablas del plan técnico', async () => {
    const r = await consultar(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('usuarios', 'organizaciones', 'donaciones', 'movimientos')`
    );
    expect(r.rows.map((f) => f.table_name).sort()).toEqual(['donaciones', 'movimientos', 'organizaciones', 'usuarios']);
  });

  test('Esquema · una donación nueva queda «disponible» con código tipo D-0001', async () => {
    const r = await insertarDonacion(donanteId);
    expect(r.rows[0].estado).toBe('disponible');
    expect(r.rows[0].codigo).toMatch(/^D-\d{4,}$/);
  });

  test('Esquema · la base rechaza una cantidad cero', async () => {
    await expect(insertarDonacion(donanteId, { cantidad: 0 })).rejects.toThrow();
  });

  test('Esquema · la base rechaza una donación asignada sin voluntario', async () => {
    await expect(insertarDonacion(donanteId, { estado: 'asignada' })).rejects.toThrow();
  });

  test('Esquema · migrar dos veces no falla ni repite migraciones', async () => {
    const aplicadas = await migrar();
    expect(aplicadas).toEqual([]);
  });
});
