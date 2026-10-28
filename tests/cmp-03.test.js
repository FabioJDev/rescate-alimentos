// CMP-03 · Tomar una donación, con bloqueo de una segunda toma (docs/spec/comportamientos.md, ADR-001).
// Cada prueba empieza con su ID de CA. La prueba de dos tomas realmente simultáneas está en la tarea T-03.3.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { formatearHora } = require('../src/utilidades/fechas');

const marca = `CMP03-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1010' };
const ana = { nombre: `Ana ${marca}`, pin: '2020' };
const bruno = { nombre: `Bruno ${marca}`, pin: '3030' };
const coordinadora = { nombre: `Coordinadora ${marca}`, pin: '4040' };

let contador = 0;

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

async function crearUsuario(usuario, rol) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, $2, $3, $4) RETURNING id', [
    usuario.nombre,
    rol,
    hash,
    zona,
  ]);
  usuario.id = r.rows[0].id;
}

// Crea una donación disponible con la hora límite a `minutos` de ahora (negativo = ya vencida).
async function crearDonacion(minutos = 120) {
  contador += 1;
  const punto = `Punto ${marca}-${contador}`;
  const r = await consultar(
    `INSERT INTO donaciones
       (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id)
     VALUES ('Panadería', 12, 'kg', $1, $2, $3, $4, $4)
     RETURNING id, codigo`,
    [punto, zona, new Date(Date.now() + minutos * 60000), donante.id]
  );
  return { ...r.rows[0], punto };
}

async function leerDonacion(id) {
  return (await consultar('SELECT * FROM donaciones WHERE id = $1', [id])).rows[0];
}

async function contarMovimientos(id, tipo) {
  const r = await consultar('SELECT count(*)::int AS total FROM movimientos WHERE donacion_id = $1 AND tipo = $2', [id, tipo]);
  return r.rows[0].total;
}

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(bruno, 'voluntario');
  await crearUsuario(coordinadora, 'coordinadora');
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-03 · Tomar una donación', () => {
  test('CA-03.1 · al pulsar «Tomar» y confirmar, la donación pasa a «asignada» con el voluntario y la hora de la toma', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    // «Tomar» lleva a la pantalla de confirmación, donde todavía no pasa nada.
    const confirmar = await agente.get(`/donaciones/${donacion.codigo}/tomar`);
    expect(confirmar.status).toBe(200);
    expect(confirmar.text).toContain('Sí, tomar esta donación');
    expect((await leerDonacion(donacion.id)).estado).toBe('disponible');

    const toma = await agente.post(`/donaciones/${donacion.codigo}/tomar`);
    expect(toma.status).toBe(302);
    expect(toma.headers.location).toBe(`/donaciones/${donacion.codigo}/tomada`);

    const guardada = await leerDonacion(donacion.id);
    expect(guardada.estado).toBe('asignada');
    expect(guardada.voluntario_id).toBe(ana.id);
    expect(guardada.tomada_en).toBeInstanceOf(Date);
  });

  test('CA-03.1 · queda registrado el movimiento de la toma con quién la hizo', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    await agente.post(`/donaciones/${donacion.codigo}/tomar`);

    const movimientos = (await consultar("SELECT usuario_id FROM movimientos WHERE donacion_id = $1 AND tipo = 'toma'", [donacion.id])).rows;
    expect(movimientos).toEqual([{ usuario_id: ana.id }]);
  });

  test('CA-03.1 · el voluntario ve el punto de recogida y la hora límite', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    const toma = await agente.post(`/donaciones/${donacion.codigo}/tomar`);
    const pantalla = await agente.get(toma.headers.location);

    expect(pantalla.status).toBe(200);
    expect(pantalla.text).toContain(donacion.punto);
    expect(pantalla.text).toContain('Hora límite:');
  });

  test('CA-03.1 · la donación tomada aparece en «Mis recogidas»', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    await agente.post(`/donaciones/${donacion.codigo}/tomar`);
    const recogidas = await agente.get('/mis-recogidas');

    expect(recogidas.status).toBe(200);
    expect(recogidas.text).toContain(donacion.punto);
    expect(recogidas.text).toContain(donacion.codigo);
  });

  test('CA-03.2 · el segundo voluntario que intenta tomarla ve quién la tomó y la donación no cambia', async () => {
    const donacion = await crearDonacion();
    const agenteAna = await ingresar(ana);
    const agenteBruno = await ingresar(bruno);

    await agenteAna.post(`/donaciones/${donacion.codigo}/tomar`);
    const despuesDeAna = await leerDonacion(donacion.id);

    const intentoDeBruno = await agenteBruno.post(`/donaciones/${donacion.codigo}/tomar`);

    expect(intentoDeBruno.status).toBe(409);
    expect(intentoDeBruno.text).toContain(`Esta donación ya fue tomada por ${ana.nombre} a las ${formatearHora(despuesDeAna.tomada_en)}.`);
    expect(intentoDeBruno.text).toContain('No vayas al punto de recogida.');

    // El intento rechazado no modifica la donación ni deja otro movimiento.
    const despuesDeBruno = await leerDonacion(donacion.id);
    expect(despuesDeBruno.voluntario_id).toBe(ana.id);
    expect(despuesDeBruno.tomada_en).toEqual(despuesDeAna.tomada_en);
    expect(await contarMovimientos(donacion.id, 'toma')).toBe(1);
  });

  test('CA-03.3 · con una lista desactualizada, quien pulsa «Tomar» ve el mismo mensaje porque se verifica en el servidor', async () => {
    const donacion = await crearDonacion();
    const agenteAna = await ingresar(ana);
    const agenteBruno = await ingresar(bruno);

    // Bruno carga la lista y la ve disponible...
    const lista = await agenteBruno.get('/disponibles?zona=todas');
    expect(lista.text).toContain(donacion.punto);

    // ...Ana la toma después de que él la cargó...
    await agenteAna.post(`/donaciones/${donacion.codigo}/tomar`);

    // ...y Bruno, con su lista vieja, pulsa «Tomar».
    const intento = await agenteBruno.post(`/donaciones/${donacion.codigo}/tomar`);
    expect(intento.status).toBe(409);
    expect(intento.text).toContain(`Esta donación ya fue tomada por ${ana.nombre} a las`);
    expect(intento.text).toContain('No vayas al punto de recogida.');
    expect((await leerDonacion(donacion.id)).voluntario_id).toBe(ana.id);
  });

  test('CA-03.4 · una donación cuya hora límite ya se cumplió se rechaza y no se modifica', async () => {
    const donacion = await crearDonacion(-30);
    const agente = await ingresar(ana);

    const intento = await agente.post(`/donaciones/${donacion.codigo}/tomar`);

    expect(intento.status).toBe(409);
    expect(intento.text).toContain('La hora límite de esta donación ya pasó; no se puede tomar');
    const guardada = await leerDonacion(donacion.id);
    expect(guardada.estado).toBe('disponible');
    expect(guardada.voluntario_id).toBeNull();
    expect(await contarMovimientos(donacion.id, 'toma')).toBe(0);
  });

  test('CA-03.5 · si quien ya la tomó vuelve a pulsar «Tomar», no se duplica nada y ve «Ya tomaste esta donación»', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    await agente.post(`/donaciones/${donacion.codigo}/tomar`);
    const tomadaEn = (await leerDonacion(donacion.id)).tomada_en;

    // Doble clic o reintento por mala señal.
    const reintento = await agente.post(`/donaciones/${donacion.codigo}/tomar`);

    expect(reintento.status).toBe(200);
    expect(reintento.text).toContain('Ya tomaste esta donación');
    expect(reintento.text).toContain(donacion.punto);
    expect((await leerDonacion(donacion.id)).tomada_en).toEqual(tomadaEn);
    expect(await contarMovimientos(donacion.id, 'toma')).toBe(1);
  });

  test.each([
    ['un donante', donante],
    ['la coordinadora', coordinadora],
  ])('CA-03.6 · %s no puede tomar una donación', async (_nombre, usuario) => {
    const donacion = await crearDonacion();
    const agente = await ingresar(usuario);

    const intento = await agente.post(`/donaciones/${donacion.codigo}/tomar`);

    expect(intento.status).toBe(403);
    expect((await leerDonacion(donacion.id)).estado).toBe('disponible');
    expect(await contarMovimientos(donacion.id, 'toma')).toBe(0);
  });

  test('CA-03.6 · sin sesión no se puede tomar: lleva a ingresar', async () => {
    const donacion = await crearDonacion();

    const intento = await request(app).post(`/donaciones/${donacion.codigo}/tomar`);

    expect(intento.status).toBe(302);
    expect(intento.headers.location).toBe('/ingreso');
    expect((await leerDonacion(donacion.id)).estado).toBe('disponible');
  });

  test('CA-03.2 · la pantalla de confirmación de una donación ya tomada muestra el mismo aviso', async () => {
    const donacion = await crearDonacion();
    const agenteAna = await ingresar(ana);
    const agenteBruno = await ingresar(bruno);
    await agenteAna.post(`/donaciones/${donacion.codigo}/tomar`);

    const confirmar = await agenteBruno.get(`/donaciones/${donacion.codigo}/tomar`);

    expect(confirmar.status).toBe(409);
    expect(confirmar.text).toContain('No vayas al punto de recogida.');
    expect(confirmar.text).not.toContain('Sí, tomar esta donación');
  });

  test('Código inexistente · se avisa que no existe y no se rompe', async () => {
    const agente = await ingresar(ana);
    const intento = await agente.post('/donaciones/D-9999999/tomar');
    expect(intento.status).toBe(404);
    expect(intento.text).toContain('No existe una donación con ese código');
  });
});
