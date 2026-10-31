// CMP-14 · La coordinadora interviene en una donación tomada (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { liberar } = require('../src/servicios/intervenciones');
const { registrarEntrega } = require('../src/servicios/entregas');

const marca = `CMP14-${Date.now()}`;
const zona = `Zona ${marca}`;
const donante = { nombre: `Donante ${marca}`, pin: '1111' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const bruno = { nombre: `Bruno ${marca}`, pin: '3333' };
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
let organizacion;

async function crearUsuario(usuario, rol, activo = true) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, activo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [usuario.nombre, rol, hash, zona, activo]
  );
  usuario.id = r.rows[0].id;
  usuario.rol = rol;
  return usuario;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

// Una donación disponible, o asignada a `voluntario` (Ana por defecto), con su registro (y su toma) en el historial.
async function crearDonacion({ voluntario = null, minutosLimite = 120, estado = null } = {}) {
  const asignada = Boolean(voluntario);
  const r = await consultar(
    `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                             registrada_por_id, voluntario_id, tomada_en)
     VALUES ('Frutas y verduras', 30, 'kg', 'Plaza 4', $1, $2, $3, $4, $4, $5, $6)
     RETURNING id, codigo`,
    [
      zona,
      new Date(Date.now() + minutosLimite * 60000),
      estado || (asignada ? 'asignada' : 'disponible'),
      donante.id,
      asignada ? voluntario.id : null,
      asignada ? new Date(Date.now() - 60000) : null,
    ]
  );
  const d = r.rows[0];
  await consultar("INSERT INTO movimientos (donacion_id, tipo, usuario_id, ocurrido_en) VALUES ($1, 'registro', $2, now() - interval '2 minutes')", [
    d.id,
    donante.id,
  ]);
  if (asignada) {
    await consultar("INSERT INTO movimientos (donacion_id, tipo, usuario_id, ocurrido_en) VALUES ($1, 'toma', $2, now() - interval '1 minute')", [
      d.id,
      voluntario.id,
    ]);
  }
  return d;
}

async function leer(codigo) {
  return (await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo])).rows[0];
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(bruno, 'voluntario');
  await crearUsuario(marcela, 'coordinadora');
  organizacion = (
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 1', $2) RETURNING id, nombre", [
      `Comedor ${marca}`,
      zona,
    ])
  ).rows[0];
  coordinadora = await ingresar(marcela);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-14 · La coordinadora interviene en una donación tomada', () => {
  test('CA-14.1 · liberar: vuelve a disponible, sale de «Mis recogidas» y el historial dice a quién se la quitó', async () => {
    const d = await crearDonacion({ voluntario: ana });
    const confirmar = await coordinadora.get(`/donaciones/${d.codigo}/liberar`);
    expect(confirmar.status).toBe(200);
    expect(confirmar.text).toContain(ana.nombre);

    const res = await coordinadora.post(`/donaciones/${d.codigo}/liberar`).type('form').send({ voluntario_actual: String(ana.id) });
    expect(res.status).toBe(302);
    const guardada = await leer(d.codigo);
    expect(guardada.estado).toBe('disponible');
    expect(guardada.voluntario_id).toBeNull();
    expect(guardada.tomada_en).toBeNull();

    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/mis-recogidas')).text).not.toContain(d.codigo);
    expect((await agenteAna.get('/disponibles')).text).toContain(d.codigo);
    const detalle = await coordinadora.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(`Liberada por ${marcela.nombre} (la tenía ${ana.nombre})`);
  });

  test('CA-14.2 · asignar una disponible a un voluntario activo: aparece en sus recogidas', async () => {
    const d = await crearDonacion();
    const formulario = await coordinadora.get(`/donaciones/${d.codigo}/asignar`);
    expect(formulario.text).toContain(bruno.nombre);

    const res = await coordinadora
      .post(`/donaciones/${d.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(bruno.id), voluntario_actual: '' });
    expect(res.status).toBe(302);
    const guardada = await leer(d.codigo);
    expect(guardada.estado).toBe('asignada');
    expect(guardada.voluntario_id).toBe(bruno.id);
    expect(guardada.tomada_en).not.toBeNull();

    const agenteBruno = await ingresar(bruno);
    expect((await agenteBruno.get('/mis-recogidas')).text).toContain(d.codigo);
    const detalle = await coordinadora.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(`Asignada a ${bruno.nombre} por ${marcela.nombre}`);
  });

  test('CA-14.2 · reasignar: pasa de un voluntario a otro y el historial lo dice', async () => {
    const d = await crearDonacion({ voluntario: ana });
    await coordinadora
      .post(`/donaciones/${d.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(bruno.id), voluntario_actual: String(ana.id) });
    expect((await leer(d.codigo)).voluntario_id).toBe(bruno.id);
    const detalle = await coordinadora.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(`Asignada a ${bruno.nombre} por ${marcela.nombre}; antes la tenía ${ana.nombre}`);
  });

  test('CA-14.3 · no se asigna una vencida, a un voluntario inactivo ni al mismo que ya la tiene', async () => {
    const vencida = await crearDonacion({ minutosLimite: -5 });
    const r1 = await coordinadora
      .post(`/donaciones/${vencida.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(bruno.id), voluntario_actual: '' });
    expect(r1.status).toBe(409);
    expect(r1.text).toContain('La hora límite de esta donación ya pasó; no se puede asignar');

    const inactivo = await crearUsuario({ nombre: `Inactivo ${marca}`, pin: '9999' }, 'voluntario', false);
    const d = await crearDonacion();
    const r2 = await coordinadora
      .post(`/donaciones/${d.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(inactivo.id), voluntario_actual: '' });
    expect(r2.status).toBe(400);
    expect(r2.text).toContain('Elige un voluntario de la lista');
    expect((await leer(d.codigo)).estado).toBe('disponible');

    const deAna = await crearDonacion({ voluntario: ana });
    const r3 = await coordinadora
      .post(`/donaciones/${deAna.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(ana.id), voluntario_actual: String(ana.id) });
    expect(r3.status).toBe(409);
    expect(r3.text).toContain('Ya está asignada a ese voluntario');
  });

  test('CA-14.4 · registrar la entrega en nombre del voluntario: entregó él, la registró la coordinadora', async () => {
    const d = await crearDonacion({ voluntario: ana, minutosLimite: -30 }); // CA-04.6: la hora límite no aplica a la entrega
    const formulario = await coordinadora.get(`/donaciones/${d.codigo}/entregar-por`);
    expect(formulario.text).toContain(`En nombre de: <strong>${ana.nombre}</strong>`);

    const faltan = await coordinadora
      .post(`/donaciones/${d.codigo}/entregar-por`)
      .type('form')
      .send({ voluntario_actual: String(ana.id), organizacion_id: '', recibido_por: '' });
    expect(faltan.status).toBe(400);
    expect(faltan.text).toContain('Falta elegir la organización que recibe.');

    const res = await coordinadora
      .post(`/donaciones/${d.codigo}/entregar-por`)
      .type('form')
      .send({ voluntario_actual: String(ana.id), organizacion_id: String(organizacion.id), recibido_por: 'Doña Rosa', entregada_en: '2000-01-01' });
    expect(res.status).toBe(302);
    const guardada = await leer(d.codigo);
    expect(guardada.estado).toBe('entregada');
    expect(guardada.voluntario_id).toBe(ana.id);
    expect(guardada.entregada_en.getFullYear()).toBeGreaterThan(2000);

    const mov = await consultar("SELECT usuario_id FROM movimientos WHERE donacion_id = $1 AND tipo = 'entrega'", [d.id]);
    expect(mov.rows[0].usuario_id).toBe(marcela.id);
    const detalle = await coordinadora.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(`Entregó: ${ana.nombre}. Registrada por ${marcela.nombre}`);
  });

  test('CA-14.5 · una entregada o cancelada no se libera, asigna ni entrega', async () => {
    const entregada = await crearDonacion({ voluntario: ana });
    await registrarEntrega({ codigo: entregada.codigo, voluntarioId: ana.id, organizacionId: organizacion.id, recibidoPor: 'Rosa' });
    for (const ruta of ['liberar', 'asignar', 'entregar-por']) {
      const res = await coordinadora.get(`/donaciones/${entregada.codigo}/${ruta}`);
      expect(res.status).toBe(409);
      expect(res.text).toContain('Esta donación ya fue entregada el');
    }

    const cancelada = await crearDonacion();
    await consultar("UPDATE donaciones SET estado = 'cancelada', motivo_cancelacion = 'x', cancelada_en = now() WHERE id = $1", [cancelada.id]);
    const res = await coordinadora
      .post(`/donaciones/${cancelada.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(bruno.id), voluntario_actual: '' });
    expect(res.status).toBe(409);
    expect(res.text).toContain('Esta donación ya fue cancelada.');
  });

  test('CA-14.6 · coordinadora libera y voluntario entrega al mismo tiempo: exactamente una gana', async () => {
    for (let i = 0; i < 8; i += 1) {
      const d = await crearDonacion({ voluntario: ana });
      const [liberacion, entrega] = await Promise.all([
        liberar(d.codigo, marcela, String(ana.id)),
        registrarEntrega({ codigo: d.codigo, voluntarioId: ana.id, organizacionId: organizacion.id, recibidoPor: 'Rosa' }),
      ]);
      const ganaron = [liberacion.motivo === 'hecho', entrega.entregada].filter(Boolean);
      expect(ganaron).toHaveLength(1);
      const final = await leer(d.codigo);
      expect(final.estado).toBe(entrega.entregada ? 'entregada' : 'disponible');
    }
  });

  test('CA-14.6 · si la donación cambió mientras la coordinadora decidía, no se toca', async () => {
    // La coordinadora abrió «Asignar» cuando la tenía Ana; mientras tanto Ana la soltó y Bruno la tomó.
    const d = await crearDonacion({ voluntario: bruno });
    const res = await coordinadora
      .post(`/donaciones/${d.codigo}/asignar`)
      .type('form')
      .send({ voluntario_id: String(ana.id), voluntario_actual: String(ana.id) });
    expect(res.status).toBe(409);
    expect(res.text).toContain('La donación cambió mientras decidías; revisa su estado.');
    expect((await leer(d.codigo)).voluntario_id).toBe(bruno.id);

    const liberarViejo = await coordinadora.post(`/donaciones/${d.codigo}/liberar`).type('form').send({ voluntario_actual: String(ana.id) });
    expect(liberarViejo.text).toContain('La donación cambió mientras decidías; revisa su estado.');
    expect((await leer(d.codigo)).estado).toBe('asignada');
  });

  test('CA-14.7 · quien no es coordinadora no puede liberar, asignar ni entregar por otro', async () => {
    const d = await crearDonacion({ voluntario: ana });
    const agenteBruno = await ingresar(bruno);
    expect((await agenteBruno.post(`/donaciones/${d.codigo}/liberar`).type('form').send({ voluntario_actual: String(ana.id) })).status).toBe(403);
    expect(
      (await agenteBruno.post(`/donaciones/${d.codigo}/asignar`).type('form').send({ voluntario_id: String(bruno.id), voluntario_actual: String(ana.id) })).status
    ).toBe(403);
    expect((await agenteBruno.get(`/donaciones/${d.codigo}/entregar-por`)).status).toBe(403);
    const final = await leer(d.codigo);
    expect(final.estado).toBe('asignada');
    expect(final.voluntario_id).toBe(ana.id);
  });
});
