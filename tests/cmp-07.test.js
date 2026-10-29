// CMP-07 · Reporte del periodo (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Para que los números sean exactos aunque la base tenga otras donaciones,
// los datos se crean en un día único del pasado que se comprueba vacío antes de empezar.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { leerPeriodo } = require('../src/servicios/reporte');

const marca = `CMP07-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1111' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
let comedorA;
let comedorB;
let dia; // «AAAA-MM-DD»: el día único del pasado donde viven los datos de esta prueba

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

async function crearOrganizacion(nombre) {
  const r = await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 5', $2) RETURNING id", [nombre, zona]);
  return { id: r.rows[0].id, nombre };
}

// Busca un día lejano en el pasado donde no haya ninguna donación registrada.
async function elegirDiaVacio() {
  for (;;) {
    const candidato = new Date(Date.UTC(1950, 0, 1) + Math.floor(Math.random() * 20000) * 86400000).toISOString().slice(0, 10);
    const r = await consultar(
      `SELECT count(*)::int AS n FROM donaciones
        WHERE creada_en >= ($1::date::timestamp AT TIME ZONE 'America/Bogota' - interval '2 days')
          AND creada_en <  ($1::date::timestamp AT TIME ZONE 'America/Bogota' + interval '3 days')`,
      [candidato]
    );
    if (r.rows[0].n === 0) return candidato;
  }
}

// Crea una donación registrada a la hora de Colombia indicada («HH:MM» de `fecha`).
async function crearDonacion({ fecha = dia, hora = '12:00', estado = 'disponible', minutosLimite = 120, tipo = 'Panadería', cantidad = 10, unidad = 'kg', organizacion = null, recibidoPor = null } = {}) {
  const creada = new Date(`${fecha}T${hora}:00-05:00`);
  const r = await consultar(
    `INSERT INTO donaciones
       (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id, registrada_por_id,
        creada_en, voluntario_id, tomada_en, organizacion_id, recibido_por, entregada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id, codigo`,
    [
      tipo,
      cantidad,
      unidad,
      `Punto ${marca}`,
      zona,
      new Date(Date.now() + minutosLimite * 60000),
      estado,
      donante.id,
      creada,
      estado === 'disponible' ? null : ana.id,
      estado === 'disponible' ? null : creada,
      estado === 'entregada' ? organizacion.id : null,
      estado === 'entregada' ? recibidoPor || 'Doña Rosa' : null,
      estado === 'entregada' ? creada : null,
    ]
  );
  return r.rows[0];
}

// Lee un número del reporte: <strong data-dato="total">5</strong>
const dato = (texto, nombre) => {
  const m = new RegExp(`data-dato="${nombre}">(\\d+)<`).exec(texto);
  return m ? Number(m[1]) : null;
};

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(marcela, 'coordinadora');
  comedorA = await crearOrganizacion(`Comedor A ${marca}`);
  comedorB = await crearOrganizacion(`Comedor B ${marca}`);
  dia = await elegirDiaVacio();

  // Datos del periodo: 5 donaciones registradas el mismo día.
  await crearDonacion({ estado: 'disponible', minutosLimite: 120, tipo: 'Lácteos' });
  await crearDonacion({ estado: 'disponible', minutosLimite: -60, tipo: 'Lácteos' }); // vencida
  await crearDonacion({ estado: 'asignada', cantidad: 100, unidad: 'kg' }); // no cuenta como rescatada
  await crearDonacion({ estado: 'entregada', cantidad: 10, unidad: 'kg', organizacion: comedorA });
  await crearDonacion({ estado: 'entregada', cantidad: 5.5, unidad: 'kg', organizacion: comedorA });
  await crearDonacion({ estado: 'entregada', cantidad: 3, unidad: 'cajas', organizacion: comedorB, recibidoPor: '=HYPERLINK("http://x")' });

  // Bordes del día en hora de Colombia: 23:50 del día anterior y 00:10 del siguiente quedan FUERA; 23:30 y 00:05 DENTRO.
  const antes = new Date(new Date(`${dia}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const despues = new Date(new Date(`${dia}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  await crearDonacion({ fecha: antes, hora: '23:50', tipo: 'Cárnicos' });
  await crearDonacion({ fecha: despues, hora: '00:10', tipo: 'Cárnicos' });
  await crearDonacion({ hora: '23:30', tipo: 'Granos y secos' });
  await crearDonacion({ hora: '00:05', tipo: 'Granos y secos' });
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-07 · Reporte del periodo', () => {
  test('CA-07.1 · la coordinadora ve cuántas donaciones se registraron y en qué estado, con el día en hora de Colombia', async () => {
    const agente = await ingresar(marcela);
    const respuesta = await agente.get(`/reporte?desde=${dia}&hasta=${dia}`);

    expect(respuesta.status).toBe(200);
    // 6 del día + 2 de los bordes dentro (23:30 y 00:05); las de 23:50 (día anterior) y 00:10 (día siguiente) no entran.
    expect(dato(respuesta.text, 'total')).toBe(8);
    expect(dato(respuesta.text, 'entregadas')).toBe(3);
    expect(dato(respuesta.text, 'asignadas')).toBe(1);
    expect(dato(respuesta.text, 'vencidas')).toBe(1);
    expect(dato(respuesta.text, 'disponibles')).toBe(3); // 1 de Lácteos + las 2 de Granos y secos

    // Sin elegir fechas, muestra los últimos 30 días.
    const porDefecto = await agente.get('/reporte');
    expect(porDefecto.status).toBe(200);
    expect(porDefecto.text).toContain('name="desde"');
  });

  test('CA-07.2 · la cantidad rescatada cuenta solo lo entregado y va separada por unidad', async () => {
    const agente = await ingresar(marcela);
    const { text } = await agente.get(`/reporte?desde=${dia}&hasta=${dia}`);

    expect(text).toContain('data-unidad="kg">15,5 kg');
    expect(text).toContain('data-unidad="cajas">3 cajas');
    // La asignada de 100 kg no cuenta, y nunca se mezclan unidades (10 + 5,5 + 3 = 18,5).
    expect(text).not.toContain('115');
    expect(text).not.toContain('18,5');
  });

  test('CA-07.3 · entregas por organización y donaciones por tipo de alimento', async () => {
    const agente = await ingresar(marcela);
    const { text } = await agente.get(`/reporte?desde=${dia}&hasta=${dia}`);

    expect(text).toMatch(new RegExp(`data-organizacion="${comedorA.nombre}">2<`));
    expect(text).toMatch(new RegExp(`data-organizacion="${comedorB.nombre}">1<`));
    expect(text).toContain('data-tipo="Lácteos">2<');
    expect(text).toContain('data-tipo="Granos y secos">2<');
    expect(text).toContain('data-tipo="Panadería">4<');
    expect(text).not.toContain('data-tipo="Cárnicos"'); // las dos de los bordes quedaron fuera
  });

  test('CA-07.4 · fechas inválidas o «hasta» anterior a «desde»: se rechaza y no se muestran datos', async () => {
    const agente = await ingresar(marcela);

    for (const consulta of [
      `desde=2026-02-31&hasta=2026-03-05`,
      `desde=hola&hasta=2026-03-05`,
      `desde=2026-03-01&hasta=ayer`,
      `desde=2026-03-10&hasta=2026-03-01`,
    ]) {
      const respuesta = await agente.get(`/reporte?${consulta}`);
      expect(respuesta.status).toBe(400);
      expect(respuesta.text).toMatch(/La fecha «(desde|hasta)»/);
      expect(respuesta.text).not.toContain('data-dato=');
      expect((await agente.get(`/reporte.csv?${consulta}`)).status).toBe(400);
    }

    // Una fecha inventada tampoco produce un error interno.
    expect(leerPeriodo({ desde: '2026-02-30', hasta: '2026-03-01' }).error).toMatch(/desde/);
  });

  test('CA-07.5 · un periodo sin donaciones muestra «No hay donaciones en este periodo»', async () => {
    const agente = await ingresar(marcela);
    const vacio = await elegirDiaVacio();
    const respuesta = await agente.get(`/reporte?desde=${vacio}&hasta=${vacio}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('No hay donaciones en este periodo');
    expect(respuesta.text).not.toContain('data-dato=');
  });

  test('CA-07.6 · quien no es coordinadora no puede abrir ni descargar el reporte', async () => {
    for (const usuario of [donante, ana]) {
      const agente = await ingresar(usuario);
      expect((await agente.get(`/reporte?desde=${dia}&hasta=${dia}`)).status).toBe(403);
      expect((await agente.get(`/reporte.csv?desde=${dia}&hasta=${dia}`)).status).toBe(403);
    }
    const sinSesion = await request(app).get('/reporte');
    expect(sinSesion.status).toBe(302);
    expect(sinSesion.headers.location).toBe('/ingreso');
  });

  test('CA-07.7 · el CSV trae una fila por donación del periodo, con tildes y sin fórmulas peligrosas', async () => {
    const agente = await ingresar(marcela);
    const respuesta = await agente.get(`/reporte.csv?desde=${dia}&hasta=${dia}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toContain('text/csv');
    expect(respuesta.headers['content-disposition']).toContain(`reporte-${dia}_a_${dia}.csv`);

    const texto = respuesta.text;
    expect(texto.charCodeAt(0)).toBe(0xfeff); // la marca para que Excel lea las tildes
    const lineas = texto.slice(1).trim().split('\r\n');
    expect(lineas[0]).toContain('Código,Estado,Tipo de alimento');
    expect(lineas).toHaveLength(1 + 8); // encabezado + 8 donaciones

    expect(texto).toContain('Panadería');
    expect(texto).toContain('Entregada');
    expect(texto).toContain('Vencida (no recogida)');
    // Lo que empieza con «=» se vuelve texto: Excel no lo ejecuta como fórmula.
    expect(texto).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(texto).not.toMatch(/,=HYPERLINK/);
  });
});
