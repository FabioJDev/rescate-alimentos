// CMP-10 · Administrar los usuarios (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { listarComercios } = require('../src/servicios/registrar');

const marca = `CMP10-${Date.now()}`;
const zona = `Zona ${marca}`;
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };

async function crearUsuario(usuario, rol, datos = {}) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion, telefono) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [usuario.nombre, rol, hash, datos.zona === undefined ? zona : datos.zona, datos.direccion || null, datos.telefono || null]
  );
  usuario.id = r.rows[0].id;
  return usuario;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

async function usuarioPorNombre(nombre) {
  const r = await consultar('SELECT * FROM usuarios WHERE nombre = $1', [nombre]);
  return r.rows[0] || null;
}

// Una sesión sigue abierta si al pedir el inicio no la mandan a ingresar.
async function sigueDentro(agente) {
  const res = await agente.get('/');
  return res.status === 200;
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [zona]);
  await crearUsuario(marcela, 'coordinadora', { zona: null });
  await crearUsuario(ana, 'voluntario', { telefono: '300 111 2233' });
  coordinadora = await ingresar(marcela);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-10 · Administrar los usuarios', () => {
  test('CA-10.1 · la coordinadora ve los usuarios con sus datos y puede filtrar por rol', async () => {
    const donante = await crearUsuario({ nombre: `Panadería ${marca}`, pin: '1111' }, 'donante', {
      direccion: 'Calle 5',
      telefono: '601 222 3344',
    });

    const todos = await coordinadora.get('/usuarios');
    expect(todos.status).toBe(200);
    expect(todos.text).toContain(ana.nombre);
    expect(todos.text).toContain('300 111 2233');
    expect(todos.text).toContain(donante.nombre);

    const voluntarios = await coordinadora.get('/usuarios?rol=voluntario');
    expect(voluntarios.text).toContain(ana.nombre);
    expect(voluntarios.text).not.toContain(donante.nombre);
  });

  test('CA-10.2 · al crear un usuario queda activo y se muestra un PIN temporal que sirve para entrar', async () => {
    const nombre = `Bruno ${marca}`;
    const res = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre, rol: 'voluntario', telefono: '310 555 6677', zona, direccion: 'no aplica' });
    expect(res.status).toBe(201);

    const pin = /class="pin-temporal">(\d{4})</.exec(res.text)[1];
    const guardado = await usuarioPorNombre(nombre);
    expect(guardado.activo).toBe(true);
    expect(guardado.debe_cambiar_pin).toBe(true);
    expect(guardado.direccion).toBeNull(); // solo los comercios tienen dirección
    expect(guardado.pin_hash).not.toContain(pin);

    const entrar = await request(app).post('/ingreso').type('form').send({ nombre, pin });
    expect(entrar.status).toBe(302);
  });

  test('CA-10.3 · si falta un dato obligatorio del rol no se guarda nada y se conserva lo escrito', async () => {
    const nombre = `Comercio incompleto ${marca}`;
    const res = await coordinadora.post('/usuarios').type('form').send({ nombre, rol: 'donante', telefono: '', zona: '' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Falta el teléfono.');
    expect(res.text).toContain('Falta elegir la zona.');
    expect(res.text).toContain('Falta la dirección del comercio.');
    expect(res.text).toContain(`value="${nombre}"`);
    expect(await usuarioPorNombre(nombre)).toBeNull();

    const sinNombre = await coordinadora.post('/usuarios').type('form').send({ rol: 'coordinadora' });
    expect(sinNombre.text).toContain('Falta el nombre.');
  });

  test('CA-10.4 · nombre repetido (sin importar mayúsculas), teléfono inválido o zona inactiva se rechazan', async () => {
    const repetido = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre: ana.nombre.toUpperCase(), rol: 'voluntario', telefono: '3001234567', zona });
    expect(repetido.status).toBe(400);
    expect(repetido.text).toContain('Ya existe un usuario con ese nombre.');

    const telefono = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre: `Tel ${marca}`, rol: 'voluntario', telefono: '12-ab', zona });
    expect(telefono.text).toContain('El teléfono debe tener entre 7 y 15 números.');

    const inactiva = `Zona inactiva ${marca}`;
    await consultar('INSERT INTO zonas (nombre, activa) VALUES ($1, FALSE)', [inactiva]);
    const zonaMala = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre: `Zona mala ${marca}`, rol: 'voluntario', telefono: '3001234567', zona: inactiva });
    expect(zonaMala.text).toContain('Elige una zona de la lista.');
    expect(await usuarioPorNombre(`Zona mala ${marca}`)).toBeNull();
  });

  test('CA-10.5 · editar guarda los datos y cierra las sesiones abiertas de esa persona', async () => {
    const carla = await crearUsuario({ nombre: `Carla ${marca}`, pin: '5555' }, 'voluntario', { telefono: '3000000000' });
    const otraZona = `Otra zona ${marca}`;
    await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [otraZona]);
    const agenteCarla = await ingresar(carla);
    expect(await sigueDentro(agenteCarla)).toBe(true);

    const res = await coordinadora
      .post(`/usuarios/${carla.id}`)
      .type('form')
      .send({ nombre: carla.nombre, rol: 'voluntario', telefono: '311 999 8888', zona: otraZona });
    expect(res.status).toBe(302);

    const guardado = await usuarioPorNombre(carla.nombre);
    expect(guardado.zona).toBe(otraZona);
    expect(guardado.telefono).toBe('311 999 8888');
    expect(await sigueDentro(agenteCarla)).toBe(false);
  });

  test('CA-10.6 · desactivar cierra sus sesiones, impide entrar, lo saca de las listas y se puede reactivar', async () => {
    const comercio = await crearUsuario({ nombre: `Fruver ${marca}`, pin: '6666' }, 'donante', { direccion: 'Calle 8' });
    const agenteComercio = await ingresar(comercio);

    const res = await coordinadora.post(`/usuarios/${comercio.id}/desactivar`);
    expect(res.status).toBe(302);
    expect((await usuarioPorNombre(comercio.nombre)).activo).toBe(false);
    expect(await sigueDentro(agenteComercio)).toBe(false);
    expect((await listarComercios()).map((c) => c.id)).not.toContain(comercio.id);

    const entrar = await request(app).post('/ingreso').type('form').send({ nombre: comercio.nombre, pin: comercio.pin });
    expect(entrar.status).toBe(403);
    expect(entrar.text).toContain('Tu usuario está desactivado. Habla con la coordinadora.');

    // Con el PIN equivocado no se revela que el usuario existe.
    const pinMalo = await request(app).post('/ingreso').type('form').send({ nombre: comercio.nombre, pin: '0001' });
    expect(pinMalo.text).toContain('El nombre o el PIN no son correctos.');

    await coordinadora.post(`/usuarios/${comercio.id}/activar`);
    const otraVez = await request(app).post('/ingreso').type('form').send({ nombre: comercio.nombre, pin: comercio.pin });
    expect(otraVez.status).toBe(302);
  });

  test('CA-10.7 · un voluntario con donaciones asignadas no se desactiva ni deja de ser voluntario', async () => {
    const dario = await crearUsuario({ nombre: `Darío ${marca}`, pin: '7777' }, 'voluntario', { telefono: '3000000001' });
    const donante = await crearUsuario({ nombre: `Donante 7 ${marca}`, pin: '8888' }, 'donante', { direccion: 'Calle 7' });
    await consultar(
      `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                               registrada_por_id, voluntario_id, tomada_en)
       VALUES ('Panadería', 5, 'kg', 'Calle 7', $1, now() + interval '2 hours', 'asignada', $2, $2, $3, now())`,
      [zona, donante.id, dario.id]
    );

    const desactivar = await coordinadora.post(`/usuarios/${dario.id}/desactivar`);
    expect(desactivar.status).toBe(409);
    expect(desactivar.text).toContain('Tiene 1 donaciones asignadas. Libéralas o asígnalas a otro voluntario primero.');
    expect((await usuarioPorNombre(dario.nombre)).activo).toBe(true);

    const cambiarRol = await coordinadora
      .post(`/usuarios/${dario.id}`)
      .type('form')
      .send({ nombre: dario.nombre, rol: 'donante', telefono: '3000000001', zona, direccion: 'Calle 1' });
    expect(cambiarRol.status).toBe(400);
    expect(cambiarRol.text).toContain('Tiene 1 donaciones asignadas.');
    expect((await usuarioPorNombre(dario.nombre)).rol).toBe('voluntario');
  });

  test('CA-10.8 · la coordinadora no puede desactivarse ni quitarse el rol', async () => {
    const desactivar = await coordinadora.post(`/usuarios/${marcela.id}/desactivar`);
    expect(desactivar.status).toBe(409);
    expect(desactivar.text).toContain('No puedes desactivar tu propio usuario.');

    const quitarRol = await coordinadora
      .post(`/usuarios/${marcela.id}`)
      .type('form')
      .send({ nombre: marcela.nombre, rol: 'voluntario', telefono: '3000000002', zona });
    expect(quitarRol.status).toBe(400);
    expect(quitarRol.text).toContain('No puedes quitarte el rol de coordinadora.');

    const yo = await usuarioPorNombre(marcela.nombre);
    expect(yo.activo).toBe(true);
    expect(yo.rol).toBe('coordinadora');
    expect(await sigueDentro(coordinadora)).toBe(true);
  });

  test('CA-10.9 · quien no es coordinadora no puede ver ni cambiar usuarios', async () => {
    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/usuarios')).status).toBe(403);
    expect((await agenteAna.get('/usuarios/nuevo')).status).toBe(403);
    const nombre = `Intruso ${marca}`;
    const crear = await agenteAna.post('/usuarios').type('form').send({ nombre, rol: 'coordinadora' });
    expect(crear.status).toBe(403);
    expect(await usuarioPorNombre(nombre)).toBeNull();
    expect((await agenteAna.post(`/usuarios/${marcela.id}/desactivar`)).status).toBe(403);
  });
});
