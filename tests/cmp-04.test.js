// CMP-04 · Registrar la entrega a la organización receptora (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { formatearFechaHora } = require('../src/utilidades/fechas');

const marca = `CMP04-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1111' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const bruno = { nombre: `Bruno ${marca}`, pin: '3333' };
let organizacion; // { id, nombre }

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

// Crea una donación en el estado pedido. Si está «asignada», la tomó `voluntario` (Ana por defecto).
async function crearDonacion({ estado = 'asignada', minutosLimite = 120, voluntario = ana } = {}) {
  const r = await consultar(
    `INSERT INTO donaciones
       (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id, registrada_por_id,
        voluntario_id, tomada_en, organizacion_id, recibido_por, entregada_en)
     VALUES ('Panadería', 15, 'unidades', $1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)
     RETURNING id, codigo`,
    [
      `Punto ${marca}`,
      zona,
      new Date(Date.now() + minutosLimite * 60000),
      estado,
      donante.id,
      estado === 'disponible' ? null : voluntario.id,
      estado === 'disponible' ? null : new Date(Date.now() - 60 * 60000),
      estado === 'entregada' ? organizacion.id : null,
      estado === 'entregada' ? 'Doña Rosa' : null,
      estado === 'entregada' ? new Date(Date.now() - 10 * 60000) : null,
    ]
  );
  return r.rows[0];
}

const leer = async (id) => (await consultar('SELECT * FROM donaciones WHERE id = $1', [id])).rows[0];
const entregas = async (id) =>
  (await consultar("SELECT usuario_id FROM movimientos WHERE donacion_id = $1 AND tipo = 'entrega'", [id])).rows;

function datosEntrega(cambios = {}) {
  return { organizacion_id: String(organizacion.id), recibido_por: 'Doña Rosa', ...cambios };
}

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(bruno, 'voluntario');
  const nombre = `Comedor ${marca}`;
  const r = await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 5', $2) RETURNING id", [nombre, zona]);
  organizacion = { id: r.rows[0].id, nombre };
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-04 · Registrar la entrega', () => {
  test('CA-04.1 · el voluntario asignado elige la organización, escribe quién recibe y confirma: la donación queda «entregada»', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    // Desde «Mis recogidas» llega al formulario, que ofrece las organizaciones.
    const recogidas = await agente.get('/mis-recogidas');
    expect(recogidas.text).toContain(`/donaciones/${donacion.codigo}/entregar`);
    const formulario = await agente.get(`/donaciones/${donacion.codigo}/entregar`);
    expect(formulario.status).toBe(200);
    expect(formulario.text).toContain(organizacion.nombre);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());
    expect(envio.status).toBe(302);
    expect(envio.headers.location).toBe(`/donaciones/${donacion.codigo}`);

    const guardada = await leer(donacion.id);
    expect(guardada.estado).toBe('entregada');
    expect(guardada.organizacion_id).toBe(organizacion.id);
    expect(guardada.recibido_por).toBe('Doña Rosa');
    expect(guardada.voluntario_id).toBe(ana.id);
    expect(guardada.entregada_en).toBeInstanceOf(Date);
    expect(await entregas(donacion.id)).toEqual([{ usuario_id: ana.id }]);
  });

  test('CA-04.1 · el detalle de la donación muestra la entrega con organización, quien recibe y quien entrega', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());
    const detalle = await agente.get(envio.headers.location);

    expect(detalle.text).toContain('Estado: <strong>Entregada</strong>');
    expect(detalle.text).toContain(`Entregada a ${organizacion.nombre}. Recibió: Doña Rosa. Entregó: ${ana.nombre}`);
  });

  test('CA-04.1 · una donación entregada ya no aparece en «Mis recogidas»', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());
    const recogidas = await agente.get('/mis-recogidas');

    expect(recogidas.text).not.toContain(donacion.codigo);
  });

  test('CA-04.2 · la fecha y hora de la entrega las pone el servidor: lo que escriba el usuario se ignora', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);
    const antes = Date.now();

    await agente
      .post(`/donaciones/${donacion.codigo}/entregar`)
      .type('form')
      .send(datosEntrega({ entregada_en: '2000-01-01T00:00:00Z' }));

    const entregadaEn = (await leer(donacion.id)).entregada_en.getTime();
    expect(entregadaEn).toBeGreaterThanOrEqual(antes - 2000);
    expect(entregadaEn).toBeLessThanOrEqual(Date.now() + 2000);
  });

  test.each([
    ['la organización', { organizacion_id: '' }, 'Falta elegir la organización que recibe.'],
    ['el nombre de quien recibe', { recibido_por: '   ' }, 'Falta el nombre de quien recibe.'],
    ['una organización que no existe', { organizacion_id: '99999999' }, 'Elige una organización de la lista.'],
  ])('CA-04.3 · si falta %s se rechaza indicando qué falta y no se cambia nada', async (_nombre, cambios, mensaje) => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega(cambios));

    expect(envio.status).toBe(400);
    expect(envio.text).toContain(mensaje);
    expect((await leer(donacion.id)).estado).toBe('asignada');
    expect(await entregas(donacion.id)).toEqual([]);
  });

  test('CA-04.3 · al rechazar por falta de datos se conserva lo que ya se había escrito', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    const envio = await agente
      .post(`/donaciones/${donacion.codigo}/entregar`)
      .type('form')
      .send(datosEntrega({ recibido_por: 'Don Luis', organizacion_id: '' }));

    expect(envio.text).toContain('value="Don Luis"');
  });

  test('CA-04.4 · un voluntario distinto del asignado no puede registrar la entrega', async () => {
    const donacion = await crearDonacion({ voluntario: ana });
    const agenteBruno = await ingresar(bruno);

    const formulario = await agenteBruno.get(`/donaciones/${donacion.codigo}/entregar`);
    const envio = await agenteBruno.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());

    expect(formulario.status).toBe(409);
    expect(envio.status).toBe(409);
    expect(envio.text).toContain('Solo quien la tomó puede registrar su entrega');
    const guardada = await leer(donacion.id);
    expect(guardada.estado).toBe('asignada');
    expect(guardada.voluntario_id).toBe(ana.id);
    expect(await entregas(donacion.id)).toEqual([]);
  });

  test('CA-04.5 · si la donación no está asignada (sigue disponible) se rechaza', async () => {
    const donacion = await crearDonacion({ estado: 'disponible' });
    const agente = await ingresar(ana);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());

    expect(envio.status).toBe(409);
    expect(envio.text).toContain('todavía no ha sido tomada');
    expect((await leer(donacion.id)).estado).toBe('disponible');
  });

  test('CA-04.5 · si la donación ya fue entregada se muestra «Esta donación ya fue entregada el [fecha] a [organización]»', async () => {
    const donacion = await crearDonacion({ estado: 'entregada' });
    const agente = await ingresar(ana);
    const guardada = await leer(donacion.id);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());

    expect(envio.status).toBe(409);
    expect(envio.text).toContain(`Esta donación ya fue entregada el ${formatearFechaHora(guardada.entregada_en)} a ${organizacion.nombre}`);
  });

  test('CA-04.5 · un doble clic no duplica la entrega: la segunda vez ve que ya fue entregada', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());
    const segunda = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega({ recibido_por: 'Otra persona' }));

    expect(segunda.status).toBe(409);
    expect(segunda.text).toContain('ya fue entregada el');
    expect((await leer(donacion.id)).recibido_por).toBe('Doña Rosa');
    expect(await entregas(donacion.id)).toHaveLength(1);
  });

  test('CA-04.6 · la entrega se puede registrar aunque ya haya pasado la hora límite', async () => {
    const donacion = await crearDonacion({ minutosLimite: -45 });
    const agente = await ingresar(ana);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());

    expect(envio.status).toBe(302);
    expect((await leer(donacion.id)).estado).toBe('entregada');
  });

  test('Acceso · un donante no puede registrar entregas', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(donante);

    const envio = await agente.post(`/donaciones/${donacion.codigo}/entregar`).type('form').send(datosEntrega());

    expect(envio.status).toBe(403);
    expect((await leer(donacion.id)).estado).toBe('asignada');
  });

  test('Código inexistente · se avisa que no existe', async () => {
    const agente = await ingresar(ana);
    const envio = await agente.post('/donaciones/D-9999999/entregar').type('form').send(datosEntrega());
    expect(envio.status).toBe(404);
    expect(envio.text).toContain('No existe una donación con ese código');
  });
});
