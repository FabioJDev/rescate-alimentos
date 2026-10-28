// CMP-05 · Consultar el estado de una donación en cualquier momento, y CA-02.4 (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP05-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Panadería ${marca}`, pin: '1100' };
const otroDonante = { nombre: `Plaza ${marca}`, pin: '4400' };
const voluntario = { nombre: `Voluntaria ${marca}`, pin: '2200' };
const coordinadora = { nombre: `Coordinadora ${marca}`, pin: '3300' };
let organizacion;

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

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

// Crea una donación con su historial según el estado pedido, con horas distintas y ordenadas.
async function crearDonacion({ minutosLimite = 120, estado = 'disponible', dueno = donante } = {}) {
  const base = Date.now() - 3 * 60 * 60 * 1000; // hace 3 horas
  const hace = (minutos) => new Date(base + minutos * 60 * 1000);

  const campos = {
    tipo_alimento: 'Lácteos',
    cantidad: 8,
    unidad: 'cajas',
    punto_recogida: `Punto ${marca}`,
    zona,
    hora_limite: new Date(Date.now() + minutosLimite * 60000),
    estado,
    donante_id: dueno.id,
    registrada_por_id: dueno.id,
    creada_en: hace(0),
  };
  if (estado !== 'disponible') Object.assign(campos, { voluntario_id: voluntario.id, tomada_en: hace(30) });
  if (estado === 'entregada') {
    Object.assign(campos, { organizacion_id: organizacion, recibido_por: 'Doña Rosa', entregada_en: hace(90) });
  }

  const nombres = Object.keys(campos);
  const r = await consultar(
    `INSERT INTO donaciones (${nombres.join(', ')}) VALUES (${nombres.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, codigo`,
    nombres.map((n) => campos[n])
  );
  const { id, codigo } = r.rows[0];

  const mov = (tipo, usuarioId, cuando) =>
    consultar('INSERT INTO movimientos (donacion_id, tipo, usuario_id, ocurrido_en) VALUES ($1, $2, $3, $4)', [id, tipo, usuarioId, cuando]);
  await mov('registro', dueno.id, hace(0));
  if (estado !== 'disponible') await mov('toma', voluntario.id, hace(30));
  if (estado === 'entregada') await mov('entrega', voluntario.id, hace(90));

  return { id, codigo };
}

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(otroDonante, 'donante');
  await crearUsuario(voluntario, 'voluntario');
  await crearUsuario(coordinadora, 'coordinadora');
  const org = await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 5', $2) RETURNING id", [
    `Comedor ${marca}`,
    zona,
  ]);
  organizacion = org.rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-05 · Consultar el estado de una donación', () => {
  test.each([
    ['un donante', donante],
    ['un voluntario', voluntario],
    ['la coordinadora', coordinadora],
  ])('CA-05.1 · %s con sesión abre una donación y ve su estado actual y sus datos', async (_nombre, usuario) => {
    const donacion = await crearDonacion();
    const agente = await ingresar(usuario);

    const detalle = await agente.get(`/donaciones/${donacion.codigo}`);

    expect(detalle.status).toBe(200);
    expect(detalle.text).toContain(donacion.codigo);
    expect(detalle.text).toContain('Estado: <strong>Disponible</strong>');
    expect(detalle.text).toContain('Lácteos · 8 cajas');
    expect(detalle.text).toContain(`Punto ${marca}`);
    expect(detalle.text).toContain(`Donante: ${donante.nombre}`);
    expect(detalle.text).toContain('Hora límite:');
  });

  test('CA-05.1 · buscar por código lleva al detalle de la donación', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(voluntario);

    const busqueda = await agente.get('/buscar').query({ codigo: donacion.codigo });

    expect(busqueda.status).toBe(302);
    expect(busqueda.headers.location).toBe(`/donaciones/${donacion.codigo}`);
  });

  test('CA-05.1 · la búsqueda entiende el código en minúsculas o solo con el número', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(voluntario);
    const numero = String(Number(donacion.codigo.slice(2)));

    const enMinusculas = await agente.get('/buscar').query({ codigo: donacion.codigo.toLowerCase() });
    const soloNumero = await agente.get('/buscar').query({ codigo: numero });

    expect(enMinusculas.headers.location).toBe(`/donaciones/${donacion.codigo}`);
    expect(soloNumero.headers.location).toBe(`/donaciones/${donacion.codigo}`);
  });

  test('CA-05.2 · el detalle muestra el historial en orden: registrada, tomada y entregada', async () => {
    const donacion = await crearDonacion({ estado: 'entregada' });
    const agente = await ingresar(coordinadora);

    const detalle = await agente.get(`/donaciones/${donacion.codigo}`);

    const registrada = detalle.text.indexOf(`Registrada por ${donante.nombre}`);
    const tomada = detalle.text.indexOf(`Tomada por ${voluntario.nombre}`);
    const entregada = detalle.text.indexOf(`Entregada a Comedor ${marca}. Recibió: Doña Rosa. Entregó: ${voluntario.nombre}`);

    expect(registrada).toBeGreaterThan(-1);
    expect(tomada).toBeGreaterThan(registrada);
    expect(entregada).toBeGreaterThan(tomada);
    expect(detalle.text).toContain('Estado: <strong>Entregada</strong>');
  });

  test('CA-05.2 · una donación asignada muestra registrada y tomada, y todavía no la entrega', async () => {
    const donacion = await crearDonacion({ estado: 'asignada' });
    const agente = await ingresar(coordinadora);

    const detalle = await agente.get(`/donaciones/${donacion.codigo}`);

    expect(detalle.text).toContain('Estado: <strong>Asignada</strong>');
    expect(detalle.text).toContain(`Tomada por ${voluntario.nombre}`);
    expect(detalle.text).not.toContain('Entregada a');
  });

  test('CA-05.3 y CA-02.4 · una disponible con la hora límite cumplida se muestra como «Vencida (no recogida)»', async () => {
    const donacion = await crearDonacion({ minutosLimite: -20 });
    const agente = await ingresar(voluntario);

    const detalle = await agente.get(`/donaciones/${donacion.codigo}`);

    expect(detalle.status).toBe(200);
    expect(detalle.text).toContain('Vencida (no recogida)');
    expect(detalle.text).not.toContain('Estado: <strong>Disponible</strong>');
  });

  test('CA-05.3 · una disponible con tiempo todavía no figura como vencida', async () => {
    const donacion = await crearDonacion({ minutosLimite: 60 });
    const agente = await ingresar(voluntario);

    const detalle = await agente.get(`/donaciones/${donacion.codigo}`);

    expect(detalle.text).toContain('Estado: <strong>Disponible</strong>');
    expect(detalle.text).not.toContain('Vencida');
  });

  test('CA-05.4 · un código que no existe muestra «No existe una donación con ese código»', async () => {
    const agente = await ingresar(voluntario);

    const detalle = await agente.get('/donaciones/D-9999999');
    expect(detalle.status).toBe(404);
    expect(detalle.text).toContain('No existe una donación con ese código');

    const busqueda = await agente.get('/buscar').query({ codigo: 'D-9999999' });
    expect(busqueda.status).toBe(302);
    const resultado = await agente.get(busqueda.headers.location);
    expect(resultado.text).toContain('No existe una donación con ese código');
  });

  test('CA-05.4 · un texto que no es un código tampoco rompe la búsqueda', async () => {
    const agente = await ingresar(voluntario);

    const busqueda = await agente.get('/buscar').query({ codigo: 'hola' });

    expect(busqueda.status).toBe(404);
    expect(busqueda.text).toContain('No existe una donación con ese código');
  });

  test('Acceso · sin sesión, el detalle y la búsqueda llevan a la pantalla de ingreso', async () => {
    const donacion = await crearDonacion();

    const detalle = await request(app).get(`/donaciones/${donacion.codigo}`);
    const busqueda = await request(app).get('/buscar');

    expect(detalle.status).toBe(302);
    expect(detalle.headers.location).toBe('/ingreso');
    expect(busqueda.status).toBe(302);
    expect(busqueda.headers.location).toBe('/ingreso');
  });
});

describe('CMP-05 · Listas de la coordinadora y del donante', () => {
  // Una donación en cada estado, para comprobar qué lista y qué filtro deja ver cada una.
  let vigente;
  let asignada;
  let entregada;
  let vencida;
  let deOtroDonante;

  beforeAll(async () => {
    vigente = await crearDonacion({ minutosLimite: 120 });
    asignada = await crearDonacion({ estado: 'asignada' });
    entregada = await crearDonacion({ estado: 'entregada' });
    vencida = await crearDonacion({ minutosLimite: -30 });
    deOtroDonante = await crearDonacion({ dueno: otroDonante });
  });

  test('CA-05.5 · la coordinadora ve la lista de todas las donaciones, con el estado de cada una', async () => {
    const agente = await ingresar(coordinadora);

    const lista = await agente.get('/todas');

    expect(lista.status).toBe(200);
    for (const d of [vigente, asignada, entregada, vencida, deOtroDonante]) expect(lista.text).toContain(d.codigo);
    expect(lista.text).toContain(`Donante: ${donante.nombre}`);
    expect(lista.text).toContain(`Donante: ${otroDonante.nombre}`);
    expect(lista.text).toContain('Vencida (no recogida)');
  });

  test.each([
    ['disponible', () => [vigente, deOtroDonante], () => [asignada, entregada, vencida]],
    ['asignada', () => [asignada], () => [vigente, entregada, vencida]],
    ['entregada', () => [entregada], () => [vigente, asignada, vencida]],
    ['vencida', () => [vencida], () => [vigente, asignada, entregada]],
  ])('CA-05.5 · la coordinadora filtra la lista por estado «%s»', async (estado, deberianVerse, noDeberianVerse) => {
    const agente = await ingresar(coordinadora);

    const lista = await agente.get('/todas').query({ estado });

    expect(lista.status).toBe(200);
    for (const d of deberianVerse()) expect(lista.text).toContain(d.codigo);
    for (const d of noDeberianVerse()) expect(lista.text).not.toContain(d.codigo);
  });

  test('CA-05.5 · un filtro desconocido no rompe la lista: muestra todas', async () => {
    const agente = await ingresar(coordinadora);

    const lista = await agente.get('/todas').query({ estado: 'cualquier-cosa' });

    expect(lista.status).toBe(200);
    expect(lista.text).toContain(vigente.codigo);
    expect(lista.text).toContain(entregada.codigo);
  });

  test.each([
    ['un voluntario', voluntario],
    ['un donante', donante],
  ])('CA-05.5 · %s no puede ver la lista de todas las donaciones', async (_nombre, usuario) => {
    const agente = await ingresar(usuario);
    const lista = await agente.get('/todas');
    expect(lista.status).toBe(403);
  });

  test('CA-05.6 · el donante ve «Mis donaciones» con el estado de cada una', async () => {
    const agente = await ingresar(donante);

    const lista = await agente.get('/mis-donaciones');

    expect(lista.status).toBe(200);
    for (const d of [vigente, asignada, entregada, vencida]) expect(lista.text).toContain(d.codigo);
    expect(lista.text).toContain('Disponible');
    expect(lista.text).toContain('Asignada');
    expect(lista.text).toContain('Entregada');
    expect(lista.text).toContain('Vencida (no recogida)');
  });

  test('CA-05.6 · el donante solo ve sus propias donaciones, no las de otro donante', async () => {
    const agente = await ingresar(donante);

    const lista = await agente.get('/mis-donaciones');

    expect(lista.text).not.toContain(deOtroDonante.codigo);
  });

  test('CA-05.6 · un donante sin donaciones ve un mensaje y no una lista vacía', async () => {
    const sinDonaciones = { nombre: `Sin donaciones ${marca}`, pin: '5500' };
    await crearUsuario(sinDonaciones, 'donante');
    const agente = await ingresar(sinDonaciones);

    const lista = await agente.get('/mis-donaciones');

    expect(lista.status).toBe(200);
    expect(lista.text).toContain('Todavía no has publicado donaciones.');
  });

  test.each([
    ['un voluntario', voluntario],
    ['la coordinadora', coordinadora],
  ])('CA-05.6 · %s no tiene «Mis donaciones»', async (_nombre, usuario) => {
    const agente = await ingresar(usuario);
    const lista = await agente.get('/mis-donaciones');
    expect(lista.status).toBe(403);
  });

  test('Acceso · sin sesión, las listas llevan a la pantalla de ingreso', async () => {
    const todas = await request(app).get('/todas');
    const mias = await request(app).get('/mis-donaciones');
    expect(todas.headers.location).toBe('/ingreso');
    expect(mias.headers.location).toBe('/ingreso');
  });
});
