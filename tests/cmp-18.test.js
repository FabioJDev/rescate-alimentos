// CMP-18 · Aviso de privacidad y autorización de datos (docs/spec/comportamientos.md).
// Los usuarios de estas pruebas se crean con el aviso SIN aceptar (privacidad_aceptada_en = NULL).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');

const marca = `CMP18-${Date.now()}`;

async function crearUsuario(nombre, pin, { rol = 'voluntario', aceptado = false, pinTemporal = false } = {}) {
  const hash = await bcrypt.hash(pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, debe_cambiar_pin, privacidad_aceptada_en) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [nombre, rol, hash, pinTemporal, aceptado ? new Date() : null]
  );
  return { id: r.rows[0].id, nombre, pin };
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

afterAll(async () => {
  await pool.end();
});

describe('CMP-18 · Aviso de privacidad y autorización de datos', () => {
  test('CA-18.1 · cualquiera puede leer el aviso, enlazado desde la página de ingreso', async () => {
    const ingreso = await request(app).get('/ingreso');
    expect(ingreso.text).toContain('href="/privacidad"');
    const aviso = await request(app).get('/privacidad');
    expect(aviso.status).toBe(200);
    for (const texto of ['Qué datos guardamos', 'Para qué los usamos', 'Quién los ve', 'Cuánto tiempo', 'Tus derechos']) {
      expect(aviso.text).toContain(texto);
    }
    expect(aviso.text).not.toContain('Acepto que la fundación');
  });

  test('CA-18.2 · sin aceptar solo puede leer el aviso, aceptarlo o salir; se guarda cuándo aceptó', async () => {
    const ana = await crearUsuario(`Ana ${marca}`, '2222');
    const agente = await ingresar(ana);
    const inicio = await agente.get('/');
    expect(inicio.status).toBe(302);
    expect(inicio.headers.location).toBe('/privacidad');
    expect((await agente.get('/disponibles')).headers.location).toBe('/privacidad');
    expect((await agente.get('/api/yo')).status).toBe(401);

    const aviso = await agente.get('/privacidad');
    expect(aviso.text).toContain('Acepto que la fundación use mis datos así');

    const acepta = await agente.post('/privacidad/aceptar');
    expect(acepta.headers.location).toBe('/');
    expect((await agente.get('/')).status).toBe(200);
    const r = await consultar('SELECT privacidad_aceptada_en FROM usuarios WHERE id = $1', [ana.id]);
    expect(r.rows[0].privacidad_aceptada_en).not.toBeNull();
  });

  test('CA-18.2 · sin aceptar puede salir', async () => {
    const beto = await crearUsuario(`Beto ${marca}`, '3333');
    const agente = await ingresar(beto);
    const salir = await agente.post('/salir');
    expect(salir.headers.location).toBe('/ingreso');
  });

  test('CA-18.3 · quien ya aceptó no lo vuelve a ver', async () => {
    const carla = await crearUsuario(`Carla ${marca}`, '4444', { aceptado: true });
    const agente = await ingresar(carla);
    expect((await agente.get('/')).status).toBe(200);
    const aviso = await agente.get('/privacidad');
    expect(aviso.text).not.toContain('Acepto que la fundación');
  });

  test('CA-18.4 · con PIN temporal, primero acepta el aviso y luego cambia el PIN', async () => {
    const dario = await crearUsuario(`Darío ${marca}`, '5555', { pinTemporal: true });
    const agente = await ingresar(dario);
    expect((await agente.get('/')).headers.location).toBe('/privacidad');
    expect((await agente.get('/privacidad')).status).toBe(200);

    await agente.post('/privacidad/aceptar');
    expect((await agente.get('/')).headers.location).toBe('/mi-pin');
    await agente.post('/mi-pin').type('form').send({ pin_actual: '5555', pin_nuevo: '1357', pin_repetido: '1357' });
    expect((await agente.get('/')).status).toBe(200);
  });

  test('CA-18.5 · la coordinadora ve quién aceptó el aviso y cuándo', async () => {
    const marcela = await crearUsuario(`Marcela ${marca}`, '1111', { rol: 'coordinadora', aceptado: true });
    await crearUsuario(`Elena ${marca}`, '6666');
    const agente = await ingresar(marcela);
    const lista = await agente.get('/usuarios');
    const tarjetaElena = lista.text.slice(lista.text.indexOf(`Elena ${marca}`));
    expect(tarjetaElena).toContain('Aviso de privacidad: sin aceptar');
    const tarjetaMarcela = lista.text.slice(lista.text.indexOf(`Marcela ${marca}`));
    expect(tarjetaMarcela).toMatch(/Aviso de privacidad: aceptado el/);
  });
});
