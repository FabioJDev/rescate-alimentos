// CMP-16 · Límite de intentos de ingreso (docs/spec/comportamientos.md, ADR-006).
// Cada prueba empieza con su ID de CA. Cada prueba entra desde una dirección distinta (cabecera X-Forwarded-For)
// para que el límite por origen de una no afecte a las otras.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP16-${Date.now()}`;
const BLOQUEO = 'Demasiados intentos. Espera 15 minutos o pide a la coordinadora que restablezca tu PIN.';
let siguienteOrigen = 1;

async function crearUsuario(nombre, pin, rol = 'voluntario') {
  const hash = await bcrypt.hash(pin, 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash) VALUES ($1, $2, $3) RETURNING id', [nombre, rol, hash]);
  return { id: r.rows[0].id, nombre, pin };
}

function nuevoOrigen() {
  siguienteOrigen += 1;
  return `10.16.${Math.floor(siguienteOrigen / 250)}.${siguienteOrigen % 250}`;
}

function intentar(nombre, pin, origen, agente = request(app)) {
  return agente.post('/ingreso').set('X-Forwarded-For', origen).type('form').send({ nombre, pin });
}

beforeAll(async () => {
  await migrar();
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-16 · Límite de intentos de ingreso', () => {
  test('CA-16.1 · tras 5 fallos seguidos, el sexto intento no entra aunque el PIN sea correcto', async () => {
    const ana = await crearUsuario(`Ana ${marca}`, '2222');
    const origen = nuevoOrigen();
    for (let i = 0; i < 5; i += 1) {
      const fallo = await intentar(ana.nombre, '9999', origen);
      expect(fallo.status).toBe(401);
    }
    const sexto = await intentar(ana.nombre, '2222', nuevoOrigen());
    expect(sexto.status).toBe(429);
    expect(sexto.text).toContain(BLOQUEO);
  });

  test('CA-16.1 · el bloqueo vale aunque el nombre se escriba con otras mayúsculas o espacios', async () => {
    const beto = await crearUsuario(`Beto ${marca}`, '3333');
    const origen = nuevoOrigen();
    for (let i = 0; i < 5; i += 1) await intentar(`  ${beto.nombre.toUpperCase()} `, '9999', origen);
    expect((await intentar(beto.nombre, '3333', nuevoOrigen())).status).toBe(429);
  });

  test('CA-16.2 · pasados 15 minutos puede volver a intentar', async () => {
    const carla = await crearUsuario(`Carla ${marca}`, '4444');
    const origen = nuevoOrigen();
    for (let i = 0; i < 5; i += 1) await intentar(carla.nombre, '9999', origen);
    expect((await intentar(carla.nombre, '4444', nuevoOrigen())).status).toBe(429);

    // Se simula el paso del tiempo moviendo el bloqueo al pasado.
    await consultar("UPDATE intentos_ingreso SET bloqueado_hasta = now() - interval '1 second' WHERE clave = $1", [
      `nombre:${carla.nombre.toLowerCase()}`,
    ]);
    expect((await intentar(carla.nombre, '4444', nuevoOrigen())).status).toBe(302);
  });

  test('CA-16.3 · entrar bien antes del límite deja los fallos en cero', async () => {
    const dario = await crearUsuario(`Darío ${marca}`, '5555');
    const origen = nuevoOrigen();
    for (let i = 0; i < 4; i += 1) await intentar(dario.nombre, '9999', origen);
    expect((await intentar(dario.nombre, '5555', origen)).status).toBe(302);
    for (let i = 0; i < 4; i += 1) await intentar(dario.nombre, '9999', origen);
    expect((await intentar(dario.nombre, '5555', origen)).status).toBe(302);
  });

  test('CA-16.4 · restablecer el PIN desbloquea y se entra con el PIN temporal', async () => {
    const elena = await crearUsuario(`Elena ${marca}`, '6666');
    const marcela = await crearUsuario(`Marcela ${marca}`, '1111', 'coordinadora');
    const origen = nuevoOrigen();
    for (let i = 0; i < 5; i += 1) await intentar(elena.nombre, '9999', origen);
    expect((await intentar(elena.nombre, '6666', nuevoOrigen())).status).toBe(429);

    const coordinadora = request.agent(app);
    await intentar(marcela.nombre, marcela.pin, nuevoOrigen(), coordinadora);
    const res = await coordinadora.post(`/usuarios/${elena.id}/restablecer-pin`).set('X-Forwarded-For', nuevoOrigen());
    const pin = /class="pin-temporal">(\d{4})</.exec(res.text)[1];
    expect((await intentar(elena.nombre, pin, nuevoOrigen())).status).toBe(302);
  });

  test('CA-16.5 · 20 fallos desde el mismo origen lo bloquean, con cualquier nombre', async () => {
    const fabio = await crearUsuario(`Fabio ${marca}`, '7777');
    const origen = nuevoOrigen();
    for (let i = 0; i < 20; i += 1) {
      await intentar(`Inventado ${i} ${marca}`, '9999', origen);
    }
    const bloqueado = await intentar(fabio.nombre, '7777', origen);
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.text).toContain(BLOQUEO);

    // Desde otro origen, el mismo usuario entra sin problema.
    expect((await intentar(fabio.nombre, '7777', nuevoOrigen())).status).toBe(302);
  });

  test('CA-16.6 · con un nombre que no existe el mensaje y el bloqueo son los mismos', async () => {
    const origen = nuevoOrigen();
    const nombre = `Nadie ${marca}`;
    const primero = await intentar(nombre, '1234', origen);
    expect(primero.status).toBe(401);
    expect(primero.text).toContain('El nombre o el PIN no son correctos.');
    for (let i = 0; i < 4; i += 1) await intentar(nombre, '1234', origen);
    const bloqueado = await intentar(nombre, '1234', nuevoOrigen());
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.text).toContain(BLOQUEO);
  });
});
