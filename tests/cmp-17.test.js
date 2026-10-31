// CMP-17 · Nombres de usuario fáciles de distinguir y de escribir (docs/spec/comportamientos.md).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP17-${Date.now()}`;
const zona = `Zona ${marca}`;

async function crearUsuario(nombre, pin, rol = 'voluntario') {
  const hash = await bcrypt.hash(pin, 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, $2, $3, $4) RETURNING id', [nombre, rol, hash, zona]);
  return { id: r.rows[0].id, nombre, pin };
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [zona]);
  const marcela = await crearUsuario(`Marcela ${marca}`, '4444', 'coordinadora');
  coordinadora = request.agent(app);
  await coordinadora.post('/ingreso').type('form').send({ nombre: marcela.nombre, pin: marcela.pin });
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-17 · Nombres de usuario fáciles de distinguir y de escribir', () => {
  test('CA-17.1 · se entra sin importar mayúsculas, tildes en mayúscula ni espacios de más', async () => {
    const ana = await crearUsuario(`Ana Pérez ${marca}`, '2222');
    for (const escrito of [`ana pérez ${marca}`, `ANA PÉREZ ${marca.toUpperCase()}`, `  Ana   Pérez   ${marca}  `]) {
      const res = await request(app).post('/ingreso').type('form').send({ nombre: escrito, pin: ana.pin });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/');
    }
    const pinMalo = await request(app).post('/ingreso').type('form').send({ nombre: `ana pérez ${marca}`, pin: '0001' });
    expect(pinMalo.status).toBe(401);
  });

  test('CA-17.2 · un nombre repetido (aunque cambien mayúsculas y tildes) se rechaza con la sugerencia', async () => {
    await crearUsuario(`Beto Ñúñez ${marca}`, '3333');
    const res = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre: `BETO ÑÚÑEZ ${marca.toUpperCase()}`, rol: 'voluntario', telefono: '3001234567', zona });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Ya existe un usuario con ese nombre. Agrega el apellido o un apodo');
    const r = await consultar('SELECT count(*)::int AS total FROM usuarios WHERE nombre ILIKE $1', [`beto%${marca}`]);
    expect(r.rows[0].total).toBe(1);
  });

  test('CA-17.3 · el formulario explica que el nombre debe ser único y sugiere nombre y apellido', async () => {
    const res = await coordinadora.get('/usuarios/nuevo');
    expect(res.text).toContain('Nombre y apellido (con este nombre se ingresa)');
    expect(res.text).toContain('Debe ser único.');
  });
});
