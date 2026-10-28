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

// ---- Validaciones y rechazos (T-01.2) ----

async function contarDonaciones() {
  const r = await consultar('SELECT count(*)::int AS total FROM donaciones WHERE donante_id = $1', [donante.id]);
  return r.rows[0].total;
}

function datosValidos(cambios = {}) {
  return {
    tipo_alimento: 'Frutas y verduras',
    cantidad: '12',
    unidad: 'kg',
    punto_recogida: 'Plaza de Mercado, puesto 3',
    hora_limite: horaLimiteFutura(),
    ...cambios,
  };
}

describe('CMP-01 · Rechazos al registrar', () => {
  const camposObligatorios = [
    ['tipo_alimento', 'Falta elegir el tipo de alimento.'],
    ['cantidad', 'Falta la cantidad aproximada.'],
    ['unidad', 'Falta elegir la unidad.'],
    ['punto_recogida', 'Falta el punto de recogida.'],
    ['hora_limite', 'Falta la hora límite.'],
  ];

  test.each(camposObligatorios)(
    'CA-01.2 · con el campo «%s» vacío no se registra nada y se indica qué falta',
    async (campo, mensaje) => {
      const agente = await ingresar(donante);
      const antes = await contarDonaciones();

      const envio = await agente.post('/donaciones').type('form').send(datosValidos({ [campo]: '' }));

      expect(envio.status).toBe(400);
      expect(envio.text).toContain(mensaje);
      expect(await contarDonaciones()).toBe(antes);
    }
  );

  test('CA-01.2 · al rechazar se conservan los datos que ya se habían escrito', async () => {
    const agente = await ingresar(donante);

    const envio = await agente
      .post('/donaciones')
      .type('form')
      .send(datosValidos({ tipo_alimento: 'Cárnicos', cantidad: '7', punto_recogida: '' }));

    expect(envio.status).toBe(400);
    expect(envio.text).toContain('value="7"');
    expect(envio.text).toMatch(/<option value="Cárnicos" selected>/);
    expect(envio.text).toContain('Falta el punto de recogida.');
  });

  test('CA-01.3 · una hora límite anterior a la actual se rechaza con su mensaje', async () => {
    const agente = await ingresar(donante);
    const antes = await contarDonaciones();
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000)
      .toLocaleString('sv-SE', { timeZone: 'America/Bogota' })
      .replace(' ', 'T')
      .slice(0, 16);

    const envio = await agente.post('/donaciones').type('form').send(datosValidos({ hora_limite: haceUnaHora }));

    expect(envio.status).toBe(400);
    expect(envio.text).toContain('La hora límite debe ser posterior a la hora actual');
    expect(await contarDonaciones()).toBe(antes);
  });

  test('CA-01.3 · una hora límite igual a la actual (este mismo minuto) también se rechaza', async () => {
    const agente = await ingresar(donante);
    const antes = await contarDonaciones();
    // El campo solo llega hasta el minuto, así que «este minuto» ya no es posterior a ahora.
    const esteMinuto = new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace(' ', 'T').slice(0, 16);

    const envio = await agente.post('/donaciones').type('form').send(datosValidos({ hora_limite: esteMinuto }));

    expect(envio.status).toBe(400);
    expect(envio.text).toContain('La hora límite debe ser posterior a la hora actual');
    expect(await contarDonaciones()).toBe(antes);
  });

  test.each([
    ['vacía', '', 'Falta la cantidad aproximada.'],
    ['cero', '0', 'La cantidad debe ser mayor que cero.'],
    ['negativa', '-3', 'La cantidad debe ser mayor que cero.'],
    ['no numérica', 'muchas', 'La cantidad debe ser un número.'],
  ])('CA-01.4 · una cantidad %s se rechaza con un mensaje claro', async (_nombre, cantidad, mensaje) => {
    const agente = await ingresar(donante);
    const antes = await contarDonaciones();

    const envio = await agente.post('/donaciones').type('form').send(datosValidos({ cantidad }));

    expect(envio.status).toBe(400);
    expect(envio.text).toContain(mensaje);
    expect(await contarDonaciones()).toBe(antes);
  });

  test('CA-01.4 · una cantidad con coma decimal («5,5») se acepta', async () => {
    const agente = await ingresar(donante);

    const envio = await agente.post('/donaciones').type('form').send(datosValidos({ cantidad: '5,5' }));

    expect(envio.status).toBe(302);
    const codigo = envio.headers.location.split('/')[2];
    const guardada = (await consultar('SELECT cantidad FROM donaciones WHERE codigo = $1', [codigo])).rows[0];
    expect(Number(guardada.cantidad)).toBe(5.5);
  });
});
