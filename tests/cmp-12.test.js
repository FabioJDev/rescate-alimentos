// CMP-12 · Administrar las organizaciones receptoras (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { listarOrganizaciones } = require('../src/servicios/entregas');

const marca = `CMP12-${Date.now()}`;
const zona = `Zona ${marca}`;
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const donante = { nombre: `Donante ${marca}`, pin: '1111' };

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

async function organizacionPorNombre(nombre) {
  const r = await consultar('SELECT * FROM organizaciones WHERE nombre = $1', [nombre]);
  return r.rows[0] || null;
}

function datosValidos(nombre) {
  return { nombre, direccion: 'Carrera 4 # 5-6', zona, refrigeracion: 'si', telefono: '602 333 4455' };
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [zona]);
  await crearUsuario(marcela, 'coordinadora');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(donante, 'donante');
  coordinadora = await ingresar(marcela);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-12 · Administrar las organizaciones receptoras', () => {
  test('CA-12.1 · la coordinadora ve cada organización con sus datos', async () => {
    const nombre = `Comedor lista ${marca}`;
    await consultar(
      "INSERT INTO organizaciones (nombre, direccion, zona, refrigeracion, telefono) VALUES ($1, 'Calle 1', $2, TRUE, '3001112233')",
      [nombre, zona]
    );
    const res = await coordinadora.get('/organizaciones');
    expect(res.status).toBe(200);
    const tarjeta = res.text.slice(res.text.indexOf(nombre));
    expect(tarjeta).toContain('Calle 1 · zona');
    expect(tarjeta).toContain('Refrigeración: sí · Teléfono: 3001112233');
  });

  test('CA-12.2 · al crear una organización queda activa y aparece al registrar una entrega', async () => {
    const nombre = `Hogar nuevo ${marca}`;
    const res = await coordinadora.post('/organizaciones').type('form').send(datosValidos(nombre));
    expect(res.status).toBe(302);

    const guardada = await organizacionPorNombre(nombre);
    expect(guardada.activa).toBe(true);
    expect(guardada.refrigeracion).toBe(true);
    expect((await listarOrganizaciones()).map((o) => o.nombre)).toContain(nombre);
  });

  test('CA-12.3 · datos faltantes, nombre repetido, teléfono inválido o zona inactiva se rechazan', async () => {
    const vacia = await coordinadora.post('/organizaciones').type('form').send({ telefono: '12' });
    expect(vacia.status).toBe(400);
    for (const mensaje of [
      'Falta el nombre de la organización.',
      'Falta la dirección.',
      'Falta elegir la zona.',
      'Indica si tiene refrigeración.',
      'El teléfono debe tener entre 7 y 15 números.',
    ]) {
      expect(vacia.text).toContain(mensaje);
    }

    const nombre = `Fundación repetida ${marca}`;
    await coordinadora.post('/organizaciones').type('form').send(datosValidos(nombre));
    const repetida = await coordinadora.post('/organizaciones').type('form').send(datosValidos(nombre.toLowerCase()));
    expect(repetida.status).toBe(400);
    expect(repetida.text).toContain('Ya existe una organización con ese nombre.');
    expect(repetida.text).toContain(`value="${nombre.toLowerCase()}"`);

    const inactiva = `Zona cerrada ${marca}`;
    await consultar('INSERT INTO zonas (nombre, activa) VALUES ($1, FALSE)', [inactiva]);
    const zonaMala = await coordinadora
      .post('/organizaciones')
      .type('form')
      .send({ ...datosValidos(`Org zona mala ${marca}`), zona: inactiva });
    expect(zonaMala.text).toContain('Elige una zona de la lista.');
    expect(await organizacionPorNombre(`Org zona mala ${marca}`)).toBeNull();
  });

  test('CA-12.4 · editar guarda los datos y las entregas pasadas siguen apuntando a ella', async () => {
    const org = (
      await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 2', $2) RETURNING id", [
        `Comedor viejo ${marca}`,
        zona,
      ])
    ).rows[0];
    const donacion = (
      await consultar(
        `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                                 registrada_por_id, voluntario_id, tomada_en, organizacion_id, recibido_por, entregada_en)
         VALUES ('Lácteos', 3, 'cajas', 'Calle 9', $1, now() + interval '1 hour', 'entregada', $2, $2, $3, now(), $4, 'Rosa', now())
         RETURNING id, codigo`,
        [zona, donante.id, ana.id, org.id]
      )
    ).rows[0];
    await consultar("INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'entrega', $2)", [donacion.id, ana.id]);

    const nuevoNombre = `Comedor renovado ${marca}`;
    const res = await coordinadora
      .post(`/organizaciones/${org.id}`)
      .type('form')
      .send({ ...datosValidos(nuevoNombre), refrigeracion: 'no' });
    expect(res.status).toBe(302);

    const guardada = await organizacionPorNombre(nuevoNombre);
    expect(guardada.id).toBe(org.id);
    expect(guardada.refrigeracion).toBe(false);
    const detalle = await coordinadora.get(`/donaciones/${donacion.codigo}`);
    expect(detalle.text).toContain(`Entregada a ${nuevoNombre}`);
  });

  test('CA-12.5 · una organización desactivada no se puede elegir al entregar y se puede reactivar', async () => {
    const nombre = `Comedor cerrado ${marca}`;
    const org = (
      await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 3', $2) RETURNING id", [nombre, zona])
    ).rows[0];
    const donacion = (
      await consultar(
        `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                                 registrada_por_id, voluntario_id, tomada_en)
         VALUES ('Panadería', 8, 'unidades', 'Calle 9', $1, now() + interval '1 hour', 'asignada', $2, $2, $3, now())
         RETURNING codigo`,
        [zona, donante.id, ana.id]
      )
    ).rows[0];

    expect((await coordinadora.post(`/organizaciones/${org.id}/desactivar`)).status).toBe(302);
    expect((await organizacionPorNombre(nombre)).activa).toBe(false);

    const agenteAna = await ingresar(ana);
    const formulario = await agenteAna.get(`/donaciones/${donacion.codigo}/entregar`);
    expect(formulario.text).not.toContain(nombre);

    const entrega = await agenteAna
      .post(`/donaciones/${donacion.codigo}/entregar`)
      .type('form')
      .send({ organizacion_id: String(org.id), recibido_por: 'Luis' });
    expect(entrega.status).toBe(400);
    expect(entrega.text).toContain('Elige una organización de la lista.');
    const estado = await consultar('SELECT estado FROM donaciones WHERE codigo = $1', [donacion.codigo]);
    expect(estado.rows[0].estado).toBe('asignada');

    await coordinadora.post(`/organizaciones/${org.id}/activar`);
    expect((await listarOrganizaciones()).map((o) => o.nombre)).toContain(nombre);
  });

  test('CA-12.6 · quien no es coordinadora no puede ver ni cambiar organizaciones', async () => {
    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/organizaciones')).status).toBe(403);
    const nombre = `Org prohibida ${marca}`;
    expect((await agenteAna.post('/organizaciones').type('form').send(datosValidos(nombre))).status).toBe(403);
    expect(await organizacionPorNombre(nombre)).toBeNull();
  });
});
