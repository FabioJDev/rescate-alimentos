// CMP-11 · Cambiar y restablecer el PIN (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP11-${Date.now()}`;
const zona = `Zona ${marca}`;
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };

async function crearUsuario(usuario, rol, { debeCambiarPin = false, direccion = null } = {}) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion, debe_cambiar_pin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [usuario.nombre, rol, hash, rol === 'coordinadora' ? null : zona, direccion, debeCambiarPin]
  );
  usuario.id = r.rows[0].id;
  return usuario;
}

async function ingresar(usuario, pin = usuario.pin) {
  const agente = request.agent(app);
  const res = await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin });
  return { agente, res };
}

async function puedeEntrar(usuario, pin) {
  const res = await request(app).post('/ingreso').type('form').send({ nombre: usuario.nombre, pin });
  return res.status === 302;
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await crearUsuario(marcela, 'coordinadora');
  coordinadora = (await ingresar(marcela)).agente;
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-11 · Cambiar y restablecer el PIN', () => {
  test('CA-11.1 · cualquier usuario cambia su PIN y sigue con su sesión', async () => {
    const ana = await crearUsuario({ nombre: `Ana ${marca}`, pin: '2222' }, 'voluntario');
    const { agente } = await ingresar(ana);

    const res = await agente.post('/mi-pin').type('form').send({ pin_actual: '2222', pin_nuevo: '9876', pin_repetido: '9876' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    const inicio = await agente.get('/');
    expect(inicio.status).toBe(200);
    expect(inicio.text).toContain('Tu PIN quedó cambiado.');
    expect(await puedeEntrar(ana, '9876')).toBe(true);
    expect(await puedeEntrar(ana, '2222')).toBe(false);
  });

  test('CA-11.2 · PIN actual incorrecto, nuevo inválido, que no coincide o igual al actual: no cambia nada', async () => {
    const beto = await crearUsuario({ nombre: `Beto ${marca}`, pin: '3333' }, 'voluntario');
    const { agente } = await ingresar(beto);
    const intentos = [
      [{ pin_actual: '0000', pin_nuevo: '1212', pin_repetido: '1212' }, 'El PIN actual no es correcto.'],
      [{ pin_actual: '3333', pin_nuevo: '12a4', pin_repetido: '12a4' }, 'El PIN nuevo debe tener 4 números.'],
      [{ pin_actual: '3333', pin_nuevo: '1212', pin_repetido: '1213' }, 'Los dos PIN nuevos no coinciden.'],
      [{ pin_actual: '3333', pin_nuevo: '3333', pin_repetido: '3333' }, 'El PIN nuevo debe ser distinto del actual.'],
    ];
    for (const [datos, mensaje] of intentos) {
      const res = await agente.post('/mi-pin').type('form').send(datos);
      expect(res.status).toBe(400);
      expect(res.text).toContain(mensaje);
    }
    expect(await puedeEntrar(beto, '3333')).toBe(true);
  });

  test('CA-11.3 · la coordinadora restablece el PIN: el anterior deja de servir y se cierran sus sesiones', async () => {
    const carla = await crearUsuario({ nombre: `Carla ${marca}`, pin: '5555' }, 'donante', { direccion: 'Calle 1' });
    const { agente } = await ingresar(carla);
    expect((await agente.get('/')).status).toBe(200);

    const confirmar = await coordinadora.get(`/usuarios/${carla.id}/restablecer-pin`);
    expect(confirmar.status).toBe(200);
    expect(confirmar.text).toContain('Sí, restablecer el PIN');

    const res = await coordinadora.post(`/usuarios/${carla.id}/restablecer-pin`);
    expect(res.status).toBe(200);
    const pin = /class="pin-temporal">(\d{4})</.exec(res.text)[1];

    expect(await puedeEntrar(carla, '5555')).toBe(pin === '5555');
    expect(await puedeEntrar(carla, pin)).toBe(true);
    const despues = await agente.get('/');
    expect(despues.status).toBe(302);
    expect(despues.headers.location).toBe('/ingreso');
  });

  test('CA-11.3 · la coordinadora no restablece su propio PIN desde la lista', async () => {
    const res = await coordinadora.post(`/usuarios/${marcela.id}/restablecer-pin`);
    expect(res.status).toBe(409);
    expect(res.text).toContain('Para tu propio PIN usa «Cambiar mi PIN».');
  });

  test('CA-11.4 · con PIN temporal solo se puede cambiar el PIN o salir; después, todo normal', async () => {
    const dario = await crearUsuario({ nombre: `Darío ${marca}`, pin: '7777' }, 'voluntario', { debeCambiarPin: true });
    const { agente, res } = await ingresar(dario);
    expect(res.status).toBe(302);

    const inicio = await agente.get('/');
    expect(inicio.status).toBe(302);
    expect(inicio.headers.location).toBe('/mi-pin');
    const disponibles = await agente.get('/disponibles');
    expect(disponibles.headers.location).toBe('/mi-pin');

    const pantalla = await agente.get('/mi-pin');
    expect(pantalla.status).toBe(200);
    expect(pantalla.text).toContain('Entraste con un PIN temporal.');

    await agente.post('/mi-pin').type('form').send({ pin_actual: '7777', pin_nuevo: '4321', pin_repetido: '4321' });
    expect((await agente.get('/disponibles')).status).toBe(200);
    const guardado = await consultar('SELECT debe_cambiar_pin FROM usuarios WHERE id = $1', [dario.id]);
    expect(guardado.rows[0].debe_cambiar_pin).toBe(false);
  });

  test('CA-11.4 · con PIN temporal se puede salir', async () => {
    const elena = await crearUsuario({ nombre: `Elena ${marca}`, pin: '8888' }, 'voluntario', { debeCambiarPin: true });
    const { agente } = await ingresar(elena);
    const salir = await agente.post('/salir');
    expect(salir.status).toBe(302);
    expect(salir.headers.location).toBe('/ingreso');
  });

  test('CA-11.5 · con PIN temporal la sincronización no registra nada y lo pendiente se conserva', async () => {
    const comercio = await crearUsuario({ nombre: `Comercio ${marca}`, pin: '6666' }, 'donante', {
      debeCambiarPin: true,
      direccion: 'Calle 6',
    });
    const { agente } = await ingresar(comercio);

    expect((await agente.get('/api/yo')).status).toBe(401);
    const idLocal = `pendiente-${marca}`;
    const res = await agente.post('/api/donaciones/sincronizar').send({
      id_local: idLocal,
      usuario_id: comercio.id,
      tipo_alimento: 'Panadería',
      cantidad: '5',
      unidad: 'kg',
      punto_recogida: 'Calle 6',
      hora_limite: '2099-01-01T10:00',
    });
    expect(res.status).toBe(401);
    expect(res.body.estado).toBe('sin_sesion');
    const r = await consultar('SELECT count(*)::int AS total FROM donaciones WHERE id_local = $1', [idLocal]);
    expect(r.rows[0].total).toBe(0);
  });

  test('CA-11.6 · quien no es coordinadora no puede restablecer el PIN de otro', async () => {
    const fabio = await crearUsuario({ nombre: `Fabio ${marca}`, pin: '1111' }, 'voluntario');
    const { agente } = await ingresar(fabio);
    expect((await agente.get(`/usuarios/${marcela.id}/restablecer-pin`)).status).toBe(403);
    expect((await agente.post(`/usuarios/${marcela.id}/restablecer-pin`)).status).toBe(403);
    expect(await puedeEntrar(marcela, '4444')).toBe(true);
  });
});
