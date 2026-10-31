// CMP-22 · Kilos aproximados rescatados (docs/spec/comportamientos.md).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { fechaParaCampo } = require('../src/utilidades/fechas');

const marca = `CMP22-${Date.now()}`;
const zona = `Zona ${marca}`;
const u = {};
let organizacionId;

async function crearUsuario(clave, rol) {
  const nombre = `${clave} ${marca}`;
  const hash = await bcrypt.hash('1234', 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
    nombre,
    rol,
    hash,
    rol === 'coordinadora' ? null : zona,
    rol === 'donante' ? 'Calle 22' : null,
  ]);
  u[clave] = { id: r.rows[0].id, nombre };
}

async function ingresar(clave) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: u[clave].nombre, pin: '1234' });
  return agente;
}

const enDosHoras = () => fechaParaCampo(new Date(Date.now() + 2 * 3600000));

function publicar(agente, datos) {
  return agente
    .post('/donaciones')
    .type('form')
    .send({ tipo_alimento: 'Panadería', cantidad: '3', unidad: 'cajas', punto_recogida: 'Calle 22', hora_limite: enDosHoras(), ...datos });
}

const porCodigo = async (codigo) => (await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo])).rows[0];
const codigoDe = (res) => /\/donaciones\/(D-\d+)\/registrada/.exec(res.headers.location)[1];

beforeAll(async () => {
  await crearUsuario('Panaderia', 'donante');
  await crearUsuario('Ana', 'voluntario');
  await crearUsuario('Marcela', 'coordinadora');
  organizacionId = (await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 1', $2) RETURNING id", [`Comedor ${marca}`, zona])).rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-22 · Kilos aproximados rescatados', () => {
  test('CA-22.1 · el formulario tiene el peso aproximado opcional; con unidad kg no se usa', async () => {
    const agente = await ingresar('Panaderia');
    expect((await agente.get('/donaciones/nueva')).text).toContain('Peso aproximado en kg (opcional, si la unidad no es kg)');

    const cajas = await publicar(agente, { kg_aproximados: '12,5' });
    expect(Number((await porCodigo(codigoDe(cajas))).kg_aproximados)).toBe(12.5);

    const kilos = await publicar(agente, { unidad: 'kg', cantidad: '8', kg_aproximados: '99' });
    expect((await porCodigo(codigoDe(kilos))).kg_aproximados).toBeNull();
  });

  test('CA-22.2 · un peso que no es un número mayor que cero se rechaza; vacío se registra igual', async () => {
    const agente = await ingresar('Panaderia');
    for (const malo of ['abc', '0', '-2']) {
      const res = await publicar(agente, { kg_aproximados: malo, punto_recogida: `Rechazo ${malo} ${marca}` });
      expect(res.status).toBe(400);
      expect(res.text).toContain('El peso aproximado debe ser un número mayor que cero');
      const r = await consultar('SELECT 1 FROM donaciones WHERE punto_recogida = $1', [`Rechazo ${malo} ${marca}`]);
      expect(r.rows).toHaveLength(0);
    }
    const vacio = await publicar(agente, { kg_aproximados: '' });
    expect(vacio.status).toBe(302);
    expect((await porCodigo(codigoDe(vacio))).kg_aproximados).toBeNull();
  });

  test('CA-22.3 · el reporte suma kg declarados y pesos aproximados, y cuenta las entregas sin peso', async () => {
    // Donaciones entregadas en un día propio para que el reporte solo las vea a ellas.
    const dia = '2001-03-15';
    const entregar = async (cantidad, unidad, kg) =>
      consultar(
        `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                                 registrada_por_id, voluntario_id, tomada_en, organizacion_id, recibido_por, entregada_en,
                                 creada_en, kg_aproximados)
         VALUES ('Panadería', $1, $2, 'Calle 22', $3, $4, 'entregada', $5, $5, $6, $4, $7, 'Rosa', $4, $4, $8)`,
        [cantidad, unidad, zona, `${dia} 10:00-05`, u.Panaderia.id, u.Ana.id, organizacionId, kg]
      );
    await entregar(20, 'kg', null);
    await entregar(4, 'cajas', 10);
    await entregar(30, 'unidades', null);

    const agente = await ingresar('Marcela');
    const reporte = await agente.get(`/reporte?desde=${dia}&hasta=${dia}`);
    expect(reporte.text).toContain('data-kilos>30 kg<');
    expect(reporte.text).toContain('data-sin-peso>1<');
    expect(reporte.text).toContain('no pesados');

    const csv = await agente.get(`/reporte.csv?desde=${dia}&hasta=${dia}`);
    expect(csv.text).toContain('Kg aproximados');
  });

  test('CA-22.4 · al corregir y al sincronizar sin conexión también se indica el peso aproximado', async () => {
    const agente = await ingresar('Panaderia');
    const codigo = codigoDe(await publicar(agente, {}));
    const formulario = await agente.get(`/donaciones/${codigo}/corregir`);
    const hora = /name="hora_limite" type="datetime-local" value="([^"]+)"/.exec(formulario.text)[1];
    await agente
      .post(`/donaciones/${codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '3', unidad: 'cajas', punto_recogida: 'Calle 22', hora_limite: hora, kg_aproximados: '9' });
    expect(Number((await porCodigo(codigo)).kg_aproximados)).toBe(9);
    const mov = await consultar("SELECT detalle FROM movimientos m JOIN donaciones d ON d.id = m.donacion_id WHERE d.codigo = $1 AND m.tipo = 'correccion'", [codigo]);
    expect(mov.rows[0].detalle).toContain('Peso aproximado: sin peso → 9 kg');

    const idLocal = `kilos-${Date.now()}`;
    const res = await agente.post('/api/donaciones/sincronizar').send({
      id_local: idLocal,
      usuario_id: u.Panaderia.id,
      tipo_alimento: 'Panadería',
      cantidad: '2',
      unidad: 'bultos',
      punto_recogida: 'Calle 22',
      hora_limite: enDosHoras(),
      kg_aproximados: '15',
    });
    expect(res.status).toBe(201);
    expect(Number((await porCodigo(res.body.codigo)).kg_aproximados)).toBe(15);
  });
});
