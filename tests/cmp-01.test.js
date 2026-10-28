// CMP-01 · Registrar una donación (docs/spec/comportamientos.md). Cada prueba empieza con su ID de CA.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const sufijo = Date.now();
const donante = { nombre: `Panadería de prueba ${sufijo}`, pin: '5678', direccion: 'Calle 10 # 5-20, Norte', zona: 'Norte' };
const voluntario = { nombre: `Voluntario de prueba ${sufijo}`, pin: '8765' };

// Hora de Colombia dentro de dos horas, con el formato del campo datetime-local ("2026-10-29T18:30").
function horaLimiteFutura() {
  const enDosHoras = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return enDosHoras.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace(' ', 'T').slice(0, 16);
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

beforeAll(async () => {
  await migrar();
  const hashDonante = await bcrypt.hash(donante.pin, 4);
  const r = await consultar(
    "INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion) VALUES ($1, 'donante', $2, $3, $4) RETURNING id",
    [donante.nombre, hashDonante, donante.zona, donante.direccion]
  );
  donante.id = r.rows[0].id;

  const hashVoluntario = await bcrypt.hash(voluntario.pin, 4);
  await consultar("INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, 'voluntario', $2, 'Norte')", [
    voluntario.nombre,
    hashVoluntario,
  ]);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-01 · Registrar una donación', () => {
  test('CA-01.1 · el donante completa los 4 datos y la donación queda «disponible» con su autor y fecha de registro', async () => {
    const agente = await ingresar(donante);
    const horaLimite = horaLimiteFutura();

    const envio = await agente.post('/donaciones').type('form').send({
      tipo_alimento: 'Panadería',
      cantidad: '20',
      unidad: 'unidades',
      punto_recogida: 'Calle 10 # 5-20, Norte',
      hora_limite: horaLimite,
    });
    expect(envio.status).toBe(302);
    expect(envio.headers.location).toMatch(/^\/donaciones\/D-\d{4,}\/registrada$/);

    const codigo = envio.headers.location.split('/')[2];
    const guardada = (await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo])).rows[0];

    expect(guardada.estado).toBe('disponible');
    expect(guardada.tipo_alimento).toBe('Panadería');
    expect(Number(guardada.cantidad)).toBe(20);
    expect(guardada.unidad).toBe('unidades');
    expect(guardada.zona).toBe('Norte');
    expect(guardada.donante_id).toBe(donante.id);
    expect(guardada.registrada_por_id).toBe(donante.id);
    expect(guardada.creada_en).toBeInstanceOf(Date);
    // La hora límite se guarda como la hora de Colombia que escribió el donante.
    const guardadaEnBogota = guardada.hora_limite.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace(' ', 'T').slice(0, 16);
    expect(guardadaEnBogota).toBe(horaLimite);

    const movimientos = (await consultar('SELECT tipo, usuario_id FROM movimientos WHERE donacion_id = $1', [guardada.id])).rows;
    expect(movimientos).toEqual([{ tipo: 'registro', usuario_id: donante.id }]);
  });

  test('CA-01.1 · el donante ve el código de la donación (ej. D-0012) al terminar', async () => {
    const agente = await ingresar(donante);
    const envio = await agente.post('/donaciones').type('form').send({
      tipo_alimento: 'Lácteos',
      cantidad: '5.5',
      unidad: 'kg',
      punto_recogida: 'Carrera 7 # 1-1',
      hora_limite: horaLimiteFutura(),
    });

    const confirmacion = await agente.get(envio.headers.location);
    const codigo = envio.headers.location.split('/')[2];
    expect(confirmacion.status).toBe(200);
    expect(confirmacion.text).toContain(codigo);
    expect(confirmacion.text).toContain('Donación registrada');
  });

  test('CA-01.1 · el punto de recogida viene prellenado con la dirección del comercio y se puede editar', async () => {
    const agente = await ingresar(donante);
    const formulario = await agente.get('/donaciones/nueva');

    expect(formulario.status).toBe(200);
    expect(formulario.text).toContain(`value="${donante.direccion}"`);
  });

  test('CA-01.6 · el registro es una sola pantalla con los 4 campos obligatorios', async () => {
    const agente = await ingresar(donante);
    const formulario = await agente.get('/donaciones/nueva');

    // Los 4 datos: tipo de alimento, cantidad (con su unidad), punto de recogida y hora límite.
    for (const campo of ['tipo_alimento', 'cantidad', 'unidad', 'punto_recogida', 'hora_limite']) {
      expect(formulario.text).toMatch(new RegExp(`name="${campo}"[^>]*required`));
    }
    // Una sola pantalla: un solo formulario que se envía una vez.
    expect(formulario.text.match(/<form /g)).toHaveLength(1);
  });

  test('Acceso · un voluntario no puede abrir el formulario de publicar donación', async () => {
    const agente = await ingresar(voluntario);
    const formulario = await agente.get('/donaciones/nueva');
    expect(formulario.status).toBe(403);
  });

  test('Acceso · sin sesión, el formulario lleva a la pantalla de ingreso', async () => {
    const formulario = await request(app).get('/donaciones/nueva');
    expect(formulario.status).toBe(302);
    expect(formulario.headers.location).toBe('/ingreso');
  });
});
