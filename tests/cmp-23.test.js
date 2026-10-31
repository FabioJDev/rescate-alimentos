// CMP-23 · Foto opcional de la donación (docs/spec/comportamientos.md, ADR-007).
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { fechaParaCampo } = require('../src/utilidades/fechas');
const { crearCola } = require('../src/publico/sin-conexion');

const marca = `CMP23-${Date.now()}`;
const zona = `Zona ${marca}`;
const u = {};

// Imágenes mínimas: lo que importa para la validación son los primeros bytes de cada formato.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]);
const comoDataUrl = (buffer, tipo = 'jpeg') => `data:image/${tipo};base64,${buffer.toString('base64')}`;

async function crearUsuario(clave, rol) {
  const nombre = `${clave} ${marca}`;
  const hash = await bcrypt.hash('1234', 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
    nombre,
    rol,
    hash,
    zona,
    'Calle 23',
  ]);
  u[clave] = { id: r.rows[0].id, nombre };
}

async function ingresar(clave) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: u[clave].nombre, pin: '1234' });
  return agente;
}

function publicar(agente, datos) {
  return agente.post('/donaciones').type('form').send({
    tipo_alimento: 'Frutas y verduras',
    cantidad: '7',
    unidad: 'kg',
    punto_recogida: 'Calle 23',
    hora_limite: fechaParaCampo(new Date(Date.now() + 2 * 3600000)),
    ...datos,
  });
}

const codigoDe = (res) => /\/donaciones\/(D-\d+)\/registrada/.exec(res.headers.location)[1];
const fotoDe = async (codigo) =>
  (await consultar('SELECT f.* FROM fotos_donacion f JOIN donaciones d ON d.id = f.donacion_id WHERE d.codigo = $1', [codigo])).rows[0];

beforeAll(async () => {
  await crearUsuario('Comercio', 'donante');
  await crearUsuario('Ana', 'voluntario');
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-23 · Foto opcional de la donación', () => {
  test('CA-23.1 · con foto se guarda con la donación; sin foto se registra igual', async () => {
    const agente = await ingresar('Comercio');
    const formulario = await agente.get('/donaciones/nueva');
    expect(formulario.text).toContain('Foto (opcional)');
    expect(formulario.text).toContain('src="/foto.js"');

    const conJpeg = await publicar(agente, { foto: comoDataUrl(JPEG) });
    expect(conJpeg.status).toBe(302);
    const foto = await fotoDe(codigoDe(conJpeg));
    expect(foto.tipo).toBe('image/jpeg');
    expect(foto.bytes).toBe(JPEG.length);

    const conPng = await publicar(agente, { foto: comoDataUrl(PNG, 'png') });
    expect((await fotoDe(codigoDe(conPng))).tipo).toBe('image/png');

    const sinFoto = await publicar(agente, { foto: '' });
    expect(sinFoto.status).toBe(302);
    expect(await fotoDe(codigoDe(sinFoto))).toBeUndefined();
  });

  test('CA-23.2 · algo que no es imagen o pesa más de 400 KB no registra nada y conserva lo escrito', async () => {
    const agente = await ingresar('Comercio');
    const disfrazada = comoDataUrl(Buffer.from('<script>no soy una imagen</script>'));
    const punto = `Punto disfrazada ${marca}`;
    const res = await publicar(agente, { foto: disfrazada, punto_recogida: punto, cantidad: '11' });
    expect(res.status).toBe(400);
    expect(res.text).toContain('La foto debe ser una imagen JPEG, PNG o WebP.');
    expect(res.text).toContain('value="11"');
    expect((await consultar('SELECT 1 FROM donaciones WHERE punto_recogida = $1', [punto])).rows).toHaveLength(0);

    const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(401 * 1024)]);
    const pesada = await publicar(agente, { foto: comoDataUrl(grande), punto_recogida: `Punto pesada ${marca}` });
    expect(pesada.status).toBe(400);
    expect(pesada.text).toContain('La foto pesa más de 400 KB.');

    const enorme = await publicar(agente, { foto: comoDataUrl(Buffer.alloc(900 * 1024)) });
    expect(enorme.status).toBe(413);
    expect(enorme.text).toContain('La foto pesa demasiado.');
  });

  test('CA-23.3 · el detalle ofrece «Ver foto (≈ N KB)», la lista marca «Tiene foto» y la foto se descarga al pedirla', async () => {
    const comercio = await ingresar('Comercio');
    const codigo = codigoDe(await publicar(comercio, { foto: comoDataUrl(JPEG) }));

    const ana = await ingresar('Ana');
    const detalle = await ana.get(`/donaciones/${codigo}`);
    expect(detalle.text).toContain(`href="/donaciones/${codigo}/foto">Ver foto (≈ 2 KB)`);
    expect(detalle.text).not.toContain('<img');

    const disponibles = (await ana.get('/disponibles')).text;
    const tarjeta = disponibles.slice(disponibles.lastIndexOf('<li', disponibles.indexOf(`/donaciones/${codigo}/tomar`)), disponibles.indexOf(`/donaciones/${codigo}/tomar`));
    expect(tarjeta).toContain('Tiene foto');

    const foto = await ana.get(`/donaciones/${codigo}/foto`);
    expect(foto.status).toBe(200);
    expect(foto.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(foto.body, JPEG)).toBe(0);
  });

  test('CA-23.4 · sin sesión no se puede ver la foto', async () => {
    const comercio = await ingresar('Comercio');
    const codigo = codigoDe(await publicar(comercio, { foto: comoDataUrl(JPEG) }));
    const res = await request(app).get(`/donaciones/${codigo}/foto`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/ingreso');
  });

  test('CA-23.5 · sin conexión la donación se guarda en el teléfono sin la foto, y se avisa', async () => {
    const guardado = {};
    const almacen = { getItem: (k) => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; } };
    const cola = crearCola({ almacen, enviar: () => Promise.reject(new Error('sin red')) });
    cola.guardar(u.Comercio.id, { tipo_alimento: 'Panadería', cantidad: '3', unidad: 'kg', foto: comoDataUrl(JPEG) });
    const [pendiente] = cola.todas();
    expect(pendiente.campos.foto).toBeUndefined();
    expect(JSON.stringify(guardado)).not.toContain('base64');

    const script = fs.readFileSync(path.join(__dirname, '../src/publico/sin-conexion.js'), 'utf8');
    expect(script).toContain('Guardada en tu teléfono sin la foto');
  });
});
