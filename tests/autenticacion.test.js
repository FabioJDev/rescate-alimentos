// Pruebas del ingreso con nombre + PIN, la sesión y el control por rol (T-00.4, ADR-003).
// Necesitan PostgreSQL real: las sesiones y los usuarios viven en la base de datos.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { requerirRol } = require('../src/middleware/autenticacion');

const nombreUsuario = `Voluntaria de prueba ${Date.now()}`;
const pinUsuario = '4321';

beforeAll(async () => {
  await migrar();
  const pinHash = await bcrypt.hash(pinUsuario, 4);
  await consultar(
    "INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, 'voluntario', $2, 'Norte')",
    [nombreUsuario, pinHash]
  );
});

afterAll(async () => {
  await pool.end();
});

describe('Ingreso con nombre + PIN', () => {
  test('Ingreso · nombre y PIN correctos inician sesión y llevan al inicio', async () => {
    const agente = request.agent(app);

    const ingreso = await agente.post('/ingreso').type('form').send({ nombre: nombreUsuario, pin: pinUsuario });
    expect(ingreso.status).toBe(302);
    expect(ingreso.headers.location).toBe('/');

    const inicio = await agente.get('/');
    expect(inicio.status).toBe(200);
    expect(inicio.text).toContain(nombreUsuario);
  });

  test('Ingreso · un PIN incorrecto se rechaza con un mensaje claro y no inicia sesión', async () => {
    const agente = request.agent(app);

    const ingreso = await agente.post('/ingreso').type('form').send({ nombre: nombreUsuario, pin: '0000' });
    expect(ingreso.status).toBe(401);
    expect(ingreso.text).toContain('El nombre o el PIN no son correctos.');

    const inicio = await agente.get('/');
    expect(inicio.status).toBe(302);
    expect(inicio.headers.location).toBe('/ingreso');
  });

  test('Ingreso · un nombre que no existe se rechaza con el mismo mensaje', async () => {
    const ingreso = await request(app).post('/ingreso').type('form').send({ nombre: 'Nadie', pin: '1234' });
    expect(ingreso.status).toBe(401);
    expect(ingreso.text).toContain('El nombre o el PIN no son correctos.');
  });

  test('Ingreso · un PIN que no tiene 4 dígitos se rechaza', async () => {
    const ingreso = await request(app).post('/ingreso').type('form').send({ nombre: nombreUsuario, pin: '12ab' });
    expect(ingreso.status).toBe(401);
  });

  test('Ingreso · sin sesión, el inicio lleva a la pantalla de ingreso', async () => {
    const inicio = await request(app).get('/');
    expect(inicio.status).toBe(302);
    expect(inicio.headers.location).toBe('/ingreso');
  });

  test('Salir · cierra la sesión y ya no se puede entrar al inicio', async () => {
    const agente = request.agent(app);
    await agente.post('/ingreso').type('form').send({ nombre: nombreUsuario, pin: pinUsuario });

    await agente.post('/salir');

    const inicio = await agente.get('/');
    expect(inicio.status).toBe(302);
    expect(inicio.headers.location).toBe('/ingreso');
  });
});

describe('Control por rol', () => {
  function respuestaFalsa() {
    return {
      codigo: null,
      redireccion: null,
      status(c) { this.codigo = c; return this; },
      render() { return this; },
      redirect(destino) { this.redireccion = destino; return this; },
    };
  }

  test('Roles · deja pasar al rol permitido', () => {
    const res = respuestaFalsa();
    const siguiente = jest.fn();
    requerirRol('voluntario')({ session: { usuario: { rol: 'voluntario' } } }, res, siguiente);
    expect(siguiente).toHaveBeenCalled();
  });

  test('Roles · rechaza con 403 a un rol que no está permitido', () => {
    const res = respuestaFalsa();
    const siguiente = jest.fn();
    requerirRol('voluntario')({ session: { usuario: { rol: 'donante' } } }, res, siguiente);
    expect(res.codigo).toBe(403);
    expect(siguiente).not.toHaveBeenCalled();
  });

  test('Roles · sin sesión manda a ingresar', () => {
    const res = respuestaFalsa();
    const siguiente = jest.fn();
    requerirRol('voluntario')({ session: {} }, res, siguiente);
    expect(res.redireccion).toBe('/ingreso');
    expect(siguiente).not.toHaveBeenCalled();
  });
});
