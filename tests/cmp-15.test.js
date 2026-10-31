// CMP-15 · Ver el teléfono de contacto de quien hace falta (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP15-${Date.now()}`;
const zona = `Zona ${marca}`;
const TEL_COMERCIO = '601 444 5566';
const TEL_ANA = '300 777 8899';
const TEL_ORG = '602 111 0000';
const donante = { nombre: `Panadería ${marca}`, pin: '1111', telefono: TEL_COMERCIO };
const sinTelefono = { nombre: `Fruver ${marca}`, pin: '5555', telefono: null };
const otroDonante = { nombre: `Otro comercio ${marca}`, pin: '6666', telefono: '601 000 1111' };
const ana = { nombre: `Ana ${marca}`, pin: '2222', telefono: TEL_ANA };
const bruno = { nombre: `Bruno ${marca}`, pin: '3333', telefono: '310 000 2222' };
const marcela = { nombre: `Marcela ${marca}`, pin: '4444', telefono: null };
let organizacion;

async function crearUsuario(usuario, rol) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [usuario.nombre, rol, hash, zona, usuario.telefono]
  );
  usuario.id = r.rows[0].id;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

async function crearDonacion({ de = donante, voluntario = null, entregada = false } = {}) {
  const estado = entregada ? 'entregada' : voluntario ? 'asignada' : 'disponible';
  const r = await consultar(
    `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                             registrada_por_id, voluntario_id, tomada_en, organizacion_id, recibido_por, entregada_en)
     VALUES ('Panadería', 10, 'unidades', 'Calle 3', $1, now() + interval '2 hours', $2, $3, $3, $4, $5, $6, $7, $8)
     RETURNING id, codigo`,
    [
      zona,
      estado,
      de.id,
      voluntario ? voluntario.id : null,
      voluntario ? new Date() : null,
      entregada ? organizacion.id : null,
      entregada ? 'Rosa' : null,
      entregada ? new Date() : null,
    ]
  );
  return r.rows[0];
}

beforeAll(async () => {
  await migrar();
  for (const [u, rol] of [
    [donante, 'donante'],
    [sinTelefono, 'donante'],
    [otroDonante, 'donante'],
    [ana, 'voluntario'],
    [bruno, 'voluntario'],
    [marcela, 'coordinadora'],
  ]) {
    await crearUsuario(u, rol);
  }
  organizacion = (
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona, telefono) VALUES ($1, 'Calle 1', $2, $3) RETURNING id", [
      `Comedor ${marca}`,
      zona,
      TEL_ORG,
    ])
  ).rows[0];
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-15 · Ver el teléfono de contacto de quien hace falta', () => {
  test('CA-15.1 · el voluntario ve el teléfono del comercio al tomarla y en «Mis recogidas»', async () => {
    const d = await crearDonacion();
    const agenteAna = await ingresar(ana);
    const toma = await agenteAna.post(`/donaciones/${d.codigo}/tomar`);
    const tomada = await agenteAna.get(toma.headers.location);
    expect(tomada.text).toContain(TEL_COMERCIO);
    expect(tomada.text).toContain('href="tel:6014445566"');

    const recogidas = await agenteAna.get('/mis-recogidas');
    expect(recogidas.text).toContain(TEL_COMERCIO);
  });

  test('CA-15.1 · si el comercio no tiene teléfono, se dice', async () => {
    await crearDonacion({ de: sinTelefono, voluntario: ana });
    const agenteAna = await ingresar(ana);
    const recogidas = await agenteAna.get('/mis-recogidas');
    expect(recogidas.text).toContain('El comercio no tiene teléfono registrado');
  });

  test('CA-15.2 · el donante ve en «Mis donaciones» quién va a recoger y su teléfono', async () => {
    const d = await crearDonacion({ voluntario: ana });
    const agenteDonante = await ingresar(donante);
    const mis = await agenteDonante.get('/mis-donaciones');
    const tarjeta = mis.text.slice(mis.text.indexOf(d.codigo));
    expect(tarjeta).toContain(`Va a recogerla: <strong>${ana.nombre}</strong>`);
    expect(tarjeta).toContain(TEL_ANA);
  });

  test('CA-15.3 · la coordinadora ve los teléfonos del donante, del voluntario y de la organización', async () => {
    const d = await crearDonacion({ voluntario: ana, entregada: true });
    const agenteMarcela = await ingresar(marcela);
    const detalle = await agenteMarcela.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(TEL_COMERCIO);
    expect(detalle.text).toContain(TEL_ANA);
    expect(detalle.text).toContain(TEL_ORG);
  });

  test('CA-15.4 · nadie más ve teléfonos: ni en disponibles ni en el detalle ajeno', async () => {
    const disponible = await crearDonacion();
    const deAna = await crearDonacion({ voluntario: ana });

    const agenteBruno = await ingresar(bruno);
    const disponibles = await agenteBruno.get('/disponibles');
    expect(disponibles.text).toContain(disponible.codigo);
    expect(disponibles.text).not.toContain(TEL_COMERCIO);

    // Bruno no es el voluntario asignado: no ve el teléfono del comercio ni el de Ana.
    const detalleAjeno = await agenteBruno.get(`/donaciones/${deAna.codigo}`);
    expect(detalleAjeno.text).not.toContain(TEL_COMERCIO);
    expect(detalleAjeno.text).not.toContain(TEL_ANA);

    // Otro comercio no ve el teléfono del voluntario de una donación que no es suya.
    const agenteOtro = await ingresar(otroDonante);
    const detalleOtro = await agenteOtro.get(`/donaciones/${deAna.codigo}`);
    expect(detalleOtro.text).not.toContain(TEL_ANA);

    // El donante de esa donación sí ve el del voluntario; Ana sí ve el del comercio.
    const agenteDonante = await ingresar(donante);
    expect((await agenteDonante.get(`/donaciones/${deAna.codigo}`)).text).toContain(TEL_ANA);
    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get(`/donaciones/${deAna.codigo}`)).text).toContain(TEL_COMERCIO);
  });
});
