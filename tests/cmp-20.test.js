// CMP-20 · Personas atendidas, sin doble conteo (docs/spec/comportamientos.md).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { hoyEnColombia } = require('../src/servicios/reporte');

const marca = `CMP20-${Date.now()}`;
const usuarios = {};
let comedor;
let hogar;

function haceDias(dias) {
  const d = new Date(`${hoyEnColombia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

async function crearUsuario(clave, rol, organizacionId = null) {
  const nombre = `${clave} ${marca}`;
  const hash = await bcrypt.hash('1234', 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, organizacion_id) VALUES ($1, $2, $3, $4) RETURNING id', [
    nombre,
    rol,
    hash,
    organizacionId,
  ]);
  usuarios[clave] = { id: r.rows[0].id, nombre };
}

async function ingresar(clave) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuarios[clave].nombre, pin: '1234' });
  return agente;
}

const cifra = async (organizacionId, fecha) =>
  (await consultar('SELECT * FROM atenciones WHERE organizacion_id = $1 AND fecha = $2', [organizacionId, fecha])).rows;

beforeAll(async () => {
  comedor = (await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 1', 'Norte') RETURNING id", [`Comedor ${marca}`])).rows[0];
  hogar = (await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 2', 'Sur') RETURNING id", [`Hogar ${marca}`])).rows[0];
  await crearUsuario('Comedor', 'organizacion', comedor.id);
  await crearUsuario('Marcela', 'coordinadora');
  await crearUsuario('Ana', 'voluntario');
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-20 · Personas atendidas, sin doble conteo', () => {
  test('CA-20.1 · la organización registra cuántas personas atendió un día, a su nombre', async () => {
    const agente = await ingresar('Comedor');
    const formulario = await agente.get('/personas-atendidas');
    expect(formulario.text).toContain(`value="${hoyEnColombia()}"`);

    const fecha = haceDias(1);
    const res = await agente.post('/personas-atendidas').type('form').send({ fecha, personas: '85' });
    expect(res.status).toBe(302);
    const [fila] = await cifra(comedor.id, fecha);
    expect(fila.personas).toBe(85);
    expect(fila.registrada_por_id).toBe(usuarios.Comedor.id);
    expect((await agente.get('/personas-atendidas')).text).toContain('Registrado: 85 personas');
  });

  test('CA-20.2 · el mismo día no se suma dos veces; se puede corregir y queda quién corrigió', async () => {
    const agente = await ingresar('Comedor');
    const fecha = haceDias(2);
    await agente.post('/personas-atendidas').type('form').send({ fecha, personas: '40' });

    const repetido = await agente.post('/personas-atendidas').type('form').send({ fecha, personas: '45' });
    expect(repetido.status).toBe(409);
    expect(repetido.text).toContain('Ya se registraron <strong>40</strong> personas para el');
    expect(repetido.text).toContain('Si es un error, corrígelo.');
    expect((await cifra(comedor.id, fecha))[0].personas).toBe(40);

    const corregir = await agente.post('/personas-atendidas').type('form').send({ fecha, personas: '45', accion: 'corregir' });
    expect(corregir.status).toBe(302);
    const [fila] = await cifra(comedor.id, fecha);
    expect(fila.personas).toBe(45);
    expect(fila.corregida_por_id).toBe(usuarios.Comedor.id);
    expect(await cifra(comedor.id, fecha)).toHaveLength(1);
  });

  test('CA-20.3 · número inválido o fecha futura o muy vieja se rechazan', async () => {
    const agente = await ingresar('Comedor');
    const casos = [
      [{ personas: '' }, 'Falta el número de personas atendidas.'],
      [{ personas: '0' }, 'El número de personas debe ser mayor que cero.'],
      [{ personas: '-3' }, 'Escribe un número entero, sin decimales.'],
      [{ personas: '12.5' }, 'Escribe un número entero, sin decimales.'],
      [{ personas: '5001' }, 'El número parece muy alto'],
      [{ personas: '10', fecha: haceDias(-1) }, 'La fecha no puede ser futura.'],
      [{ personas: '10', fecha: haceDias(61) }, 'Solo se pueden registrar los últimos 60 días.'],
      [{ personas: '10', fecha: '2026-02-31' }, 'La fecha no es válida.'],
    ];
    for (const [datos, mensaje] of casos) {
      const res = await agente.post('/personas-atendidas').type('form').send({ fecha: haceDias(3), ...datos });
      expect(res.status).toBe(400);
      expect(res.text).toContain(mensaje);
    }
    expect(await cifra(comedor.id, haceDias(3))).toHaveLength(0);
  });

  test('CA-20.4 · la coordinadora registra eligiendo la organización', async () => {
    const agente = await ingresar('Marcela');
    const sinOrg = await agente.post('/personas-atendidas').type('form').send({ fecha: haceDias(1), personas: '30' });
    expect(sinOrg.text).toContain('Falta elegir la organización.');

    const res = await agente.post('/personas-atendidas').type('form').send({ fecha: haceDias(1), personas: '30', organizacion_id: String(hogar.id) });
    expect(res.status).toBe(302);
    const [fila] = await cifra(hogar.id, haceDias(1));
    expect(fila.personas).toBe(30);
    expect(fila.registrada_por_id).toBe(usuarios.Marcela.id);
  });

  test('CA-20.5 · el reporte muestra el total de atenciones, el detalle por organización y su CSV', async () => {
    const agente = await ingresar('Marcela');
    const desde = haceDias(5);
    const hasta = hoyEnColombia();
    const reporte = await agente.get(`/reporte?desde=${desde}&hasta=${hasta}`);
    expect(reporte.text).toContain('Atenciones (personas por día)');
    expect(reporte.text).toMatch(new RegExp(`data-atenciones="Comedor ${marca}">130<`)); // 85 + 45
    expect(reporte.text).toMatch(new RegExp(`data-atenciones="Hogar ${marca}">30<`));

    const csv = await agente.get(`/reporte/atenciones.csv?desde=${desde}&hasta=${hasta}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain('Fecha,Organización,Personas atendidas,Registró,Corrigió');
    expect(csv.text).toContain(`${haceDias(2)},Comedor ${marca},45,Comedor ${marca},Comedor ${marca}`);
  });

  test('CA-20.6 · nadie más registra, y una organización solo registra para sí misma', async () => {
    const ana = await ingresar('Ana');
    expect((await ana.get('/personas-atendidas')).status).toBe(403);
    expect((await ana.post('/personas-atendidas').type('form').send({ personas: '10' })).status).toBe(403);

    // El comedor intenta registrar a nombre del hogar: se ignora y queda a nombre del comedor.
    const agente = await ingresar('Comedor');
    const fecha = haceDias(4);
    await agente.post('/personas-atendidas').type('form').send({ fecha, personas: '12', organizacion_id: String(hogar.id) });
    expect(await cifra(hogar.id, fecha)).toHaveLength(0);
    expect((await cifra(comedor.id, fecha))[0].personas).toBe(12);
  });
});
