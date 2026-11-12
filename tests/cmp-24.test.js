// CMP-24 · Solicitar acceso desde la página de ingreso (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP24-${Date.now()}`;
const zona = `Zona ${marca}`;
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };

async function crearUsuario(usuario, rol, datos = {}) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion, telefono) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [usuario.nombre, rol, hash, datos.zona === undefined ? null : datos.zona, datos.direccion || null, datos.telefono || null]
  );
  usuario.id = r.rows[0].id;
  return usuario;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

async function solicitudPorNombre(nombre) {
  const r = await consultar('SELECT * FROM solicitudes_acceso WHERE nombre = $1', [nombre]);
  return r.rows[0] || null;
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [zona]);
  await crearUsuario(marcela, 'coordinadora');
  await crearUsuario(ana, 'voluntario', { zona });
  coordinadora = await ingresar(marcela);
});

// CA-24.12: todas las pruebas envían desde 127.0.0.1; cada una empieza con el conteo de solicitudes en cero.
beforeEach(async () => {
  await consultar("DELETE FROM intentos_ingreso WHERE clave LIKE 'solicitud:%'");
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-24 · Solicitar acceso', () => {
  test('CA-24.1 · la página de ingreso tiene un enlace para solicitar acceso', async () => {
    const pagina = await request(app).get('/ingreso');
    expect(pagina.text).toContain('href="/solicitar-acceso"');
    expect(pagina.text).toContain('Solicita acceso');
  });

  test('CA-24.3 · los campos obligatorios vacíos se rechazan uno por uno, sin guardar nada', async () => {
    const envio = await request(app).post('/solicitar-acceso').type('form').send({ nombre: '', telefono: '', rol: '' });
    expect(envio.status).toBe(400);
    expect(envio.text).toContain('Falta el nombre');
    expect(envio.text).toContain('Falta el teléfono');
    expect(envio.text).toContain('Falta elegir el rol');
  });

  test('CA-24.2 y CA-24.3 · un voluntario sin zona se rechaza pidiendo la zona', async () => {
    const nombre = `Nuevo voluntario ${marca}`;
    const envio = await request(app).post('/solicitar-acceso').type('form').send({
      nombre,
      telefono: '3001234567',
      rol: 'voluntario',
    });
    expect(envio.status).toBe(400);
    expect(envio.text).toContain('Falta elegir la zona');
    expect(await solicitudPorNombre(nombre)).toBeNull();
  });

  test('CA-24.4 · un nombre que ya usa un usuario se rechaza', async () => {
    const envio = await request(app).post('/solicitar-acceso').type('form').send({
      nombre: ana.nombre,
      telefono: '3001234567',
      rol: 'voluntario',
      zona,
    });
    expect(envio.status).toBe(400);
    expect(envio.text).toContain('Ya existe una cuenta con ese nombre');
  });

  test('CA-24.6 · una solicitud válida queda pendiente y se confirma', async () => {
    const nombre = `Voluntario nuevo ${marca}`;
    const envio = await request(app).post('/solicitar-acceso').type('form').send({
      nombre,
      telefono: '3009876543',
      rol: 'voluntario',
      zona,
    });
    expect(envio.status).toBe(201);
    expect(envio.text).toContain(nombre);
    expect(envio.text).toContain('Solicitud enviada');

    const solicitud = await solicitudPorNombre(nombre);
    expect(solicitud.estado).toBe('pendiente');
  });

  test('CA-24.5 · dos solicitudes con el mismo nombre: la segunda se rechaza mientras la primera esté pendiente', async () => {
    const nombre = `Repetido ${marca}`;
    const primera = await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3001112233', rol: 'voluntario', zona });
    expect(primera.status).toBe(201);

    const segunda = await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3004445566', rol: 'voluntario', zona });
    expect(segunda.status).toBe(400);
    expect(segunda.text).toContain('Ya hay una solicitud con ese nombre');
  });

  test('CA-24.7 · la coordinadora ve las solicitudes pendientes con sus datos', async () => {
    const nombre = `Comercio solicitante ${marca}`;
    await request(app).post('/solicitar-acceso').type('form').send({
      nombre,
      telefono: '3005551234',
      rol: 'donante',
      zona,
      direccion: 'Calle 9',
    });

    const lista = await coordinadora.get('/solicitudes');
    expect(lista.status).toBe(200);
    expect(lista.text).toContain(nombre);
    expect(lista.text).toContain('3005551234');
    expect(lista.text).toContain('Calle 9');

    const inicio = await coordinadora.get('/');
    expect(inicio.text).toContain('Solicitudes de acceso');
  });

  test('CA-24.8 · la coordinadora aprueba: se crea el usuario activo con PIN temporal', async () => {
    const nombre = `Aprobado ${marca}`;
    await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3007778888', rol: 'voluntario', zona });
    const solicitud = await solicitudPorNombre(nombre);

    const aprobar = await coordinadora.post(`/solicitudes/${solicitud.id}/aprobar`);
    expect(aprobar.status).toBe(201);
    expect(aprobar.text).toContain(nombre);
    expect(aprobar.text).toMatch(/PIN temporal.*\d{4}/s);

    const r = await consultar('SELECT * FROM usuarios WHERE nombre = $1', [nombre]);
    expect(r.rows[0].activo).toBe(true);
    const resuelta = await consultar('SELECT estado, usuario_creado_id FROM solicitudes_acceso WHERE id = $1', [solicitud.id]);
    expect(resuelta.rows[0].estado).toBe('aprobada');
    expect(resuelta.rows[0].usuario_creado_id).toBe(r.rows[0].id);
  });

  test('CA-24.9 · la coordinadora rechaza con un motivo', async () => {
    const nombre = `Rechazado ${marca}`;
    await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3009990000', rol: 'voluntario', zona });
    const solicitud = await solicitudPorNombre(nombre);

    const sinMotivo = await coordinadora.post(`/solicitudes/${solicitud.id}/rechazar`).type('form').send({ motivo: '' });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.text).toContain('Falta el motivo');

    const rechazo = await coordinadora.post(`/solicitudes/${solicitud.id}/rechazar`).type('form').send({ motivo: 'No hay más cupo en esa zona' });
    expect(rechazo.status).toBe(302);

    const resuelta = await consultar('SELECT estado, motivo_rechazo FROM solicitudes_acceso WHERE id = $1', [solicitud.id]);
    expect(resuelta.rows[0].estado).toBe('rechazada');
    expect(resuelta.rows[0].motivo_rechazo).toBe('No hay más cupo en esa zona');

    const usuarioCreado = await consultar('SELECT 1 FROM usuarios WHERE nombre = $1', [nombre]);
    expect(usuarioCreado.rows.length).toBe(0);
  });

  test('CA-24.10 · una solicitud ya resuelta no se puede aprobar ni rechazar de nuevo', async () => {
    const nombre = `Ya resuelto ${marca}`;
    await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3001230000', rol: 'voluntario', zona });
    const solicitud = await solicitudPorNombre(nombre);
    await coordinadora.post(`/solicitudes/${solicitud.id}/aprobar`);

    const segundaVez = await coordinadora.post(`/solicitudes/${solicitud.id}/aprobar`);
    expect(segundaVez.status).toBe(302);
    expect(segundaVez.headers.location).toBe('/solicitudes');

    const usuarios = await consultar('SELECT count(*)::int AS total FROM usuarios WHERE nombre = $1', [nombre]);
    expect(usuarios.rows[0].total).toBe(1); // no se creó un segundo usuario
  });

  test('CA-24.12 · desde un mismo origen, la sexta solicitud en una hora se rechaza y no se guarda', async () => {
    for (let i = 1; i <= 5; i += 1) {
      const envio = await request(app)
        .post('/solicitar-acceso')
        .type('form')
        .send({ nombre: `Límite ${i} ${marca}`, telefono: '3001112222', rol: 'voluntario', zona });
      expect(envio.status).toBe(201);
    }

    const nombre = `Límite 6 ${marca}`;
    const sexta = await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3001112222', rol: 'voluntario', zona });
    expect(sexta.status).toBe(429);
    expect(sexta.text).toContain('Se enviaron demasiadas solicitudes desde esta conexión');
    expect(await solicitudPorNombre(nombre)).toBeNull();
  });

  test('CA-24.12 · las solicitudes con errores no cuentan para el límite', async () => {
    for (let i = 1; i <= 6; i += 1) {
      await request(app).post('/solicitar-acceso').type('form').send({ nombre: '', telefono: '', rol: '' });
    }
    const valida = await request(app)
      .post('/solicitar-acceso')
      .type('form')
      .send({ nombre: `Tras errores ${marca}`, telefono: '3001112222', rol: 'voluntario', zona });
    expect(valida.status).toBe(201);
  });

  test('CA-24.13 · la coordinadora ve las resueltas con estado, quién, cuándo y el motivo', async () => {
    const aprobada = `Historial aprobada ${marca}`;
    const rechazada = `Historial rechazada ${marca}`;
    await request(app).post('/solicitar-acceso').type('form').send({ nombre: aprobada, telefono: '3002223333', rol: 'voluntario', zona });
    await request(app).post('/solicitar-acceso').type('form').send({ nombre: rechazada, telefono: '3004445555', rol: 'voluntario', zona });
    await coordinadora.post(`/solicitudes/${(await solicitudPorNombre(aprobada)).id}/aprobar`);
    await coordinadora
      .post(`/solicitudes/${(await solicitudPorNombre(rechazada)).id}/rechazar`)
      .type('form')
      .send({ motivo: 'No vive en ninguna zona atendida' });

    const lista = await coordinadora.get('/solicitudes');
    expect(lista.text).toContain('Resueltas en los últimos 60 días');
    expect(lista.text).toContain(`${aprobada} · Aprobada`);
    expect(lista.text).toContain(`${rechazada} · Rechazada`);
    expect(lista.text).toContain('Motivo: No vive en ninguna zona atendida');
    expect(lista.text).toContain(`Por ${marcela.nombre}`);
    // La más reciente (la rechazada) va primero.
    expect(lista.text.indexOf(`${rechazada} · Rechazada`)).toBeLessThan(lista.text.indexOf(`${aprobada} · Aprobada`));
  });

  test('CA-24.11 · quien no es coordinadora no puede abrir «Solicitudes de acceso»', async () => {
    const agenteAna = await ingresar(ana);
    const lista = await agenteAna.get('/solicitudes');
    expect(lista.status).toBe(403);
  });

  test('CA-24.11 · el formulario de solicitud no exige sesión', async () => {
    const formulario = await request(app).get('/solicitar-acceso');
    expect(formulario.status).toBe(200);
  });
});
