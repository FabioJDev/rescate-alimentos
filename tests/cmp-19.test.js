// CMP-19 · Las organizaciones receptoras usan la aplicación (docs/spec/comportamientos.md).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { pedirDonacion } = require('../src/servicios/recepcion');
const { tomarDonacion } = require('../src/servicios/donaciones');

const marca = `CMP19-${Date.now()}`;
const zona = `Zona ${marca}`;
const TEL_ANA = '300 191 9191';
const TEL_COMEDOR = '602 191 0000';
let conFrio; // organización con refrigeración
let sinFrio; // organización sin refrigeración
const usuarios = {};

async function crearUsuario(clave, rol, extra = {}) {
  const nombre = `${clave} ${marca}`;
  const hash = await bcrypt.hash('1234', 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, telefono, organizacion_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [nombre, rol, hash, rol === 'coordinadora' || rol === 'organizacion' ? null : zona, extra.telefono || null, extra.organizacionId || null]
  );
  usuarios[clave] = { id: r.rows[0].id, nombre, rol, organizacionId: extra.organizacionId || null };
  return usuarios[clave];
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: '1234' });
  return agente;
}

async function crearDonacion({ tipo = 'Panadería', minutos = 120 } = {}) {
  const r = await consultar(
    `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id)
     VALUES ($1, 10, 'kg', 'Calle 19', $2, now() + make_interval(mins => $3), $4, $4) RETURNING id, codigo`,
    [tipo, zona, minutos, usuarios.donante.id]
  );
  return r.rows[0];
}

const leer = async (codigo) => (await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo])).rows[0];

beforeAll(async () => {
  await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [zona]);
  conFrio = (
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona, refrigeracion, telefono) VALUES ($1, 'Calle 1 # 2', $2, TRUE, $3) RETURNING *", [
      `Comedor ${marca}`,
      zona,
      TEL_COMEDOR,
    ])
  ).rows[0];
  sinFrio = (
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona, refrigeracion) VALUES ($1, 'Calle 3 # 4', $2, FALSE) RETURNING *", [
      `Hogar ${marca}`,
      zona,
    ])
  ).rows[0];
  await crearUsuario('Marcela', 'coordinadora');
  await crearUsuario('donante', 'donante');
  await crearUsuario('Ana', 'voluntario', { telefono: TEL_ANA });
  await crearUsuario('Comedor', 'organizacion', { organizacionId: conFrio.id, telefono: '3001110000' });
  await crearUsuario('Hogar', 'organizacion', { organizacionId: sinFrio.id, telefono: '3002220000' });
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-19 · Las organizaciones receptoras usan la aplicación', () => {
  test('CA-19.1 · la coordinadora crea un usuario de organización eligiendo la organización', async () => {
    const coordinadora = await ingresar(usuarios.Marcela);
    const sinOrg = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre: `Sin org ${marca}`, rol: 'organizacion', telefono: '3001234567' });
    expect(sinOrg.status).toBe(400);
    expect(sinOrg.text).toContain('Falta elegir la organización.');

    const nombre = `Encargada comedor ${marca}`;
    const res = await coordinadora
      .post('/usuarios')
      .type('form')
      .send({ nombre, rol: 'organizacion', telefono: '3001234567', organizacion_id: String(conFrio.id) });
    expect(res.status).toBe(201);
    expect(res.text).toMatch(/class="pin-temporal">\d{4}</);
    const guardado = (await consultar('SELECT * FROM usuarios WHERE nombre = $1', [nombre])).rows[0];
    expect(guardado.rol).toBe('organizacion');
    expect(guardado.organizacion_id).toBe(conFrio.id);
    expect(guardado.debe_cambiar_pin).toBe(true);
  });

  test('CA-19.2 · ve lo disponible o en camino sin pedir; sin refrigeración no ve lácteos ni cárnicos', async () => {
    const pan = await crearDonacion();
    const leche = await crearDonacion({ tipo: 'Lácteos' });
    const vencida = await crearDonacion({ minutos: -5 });
    const enCamino = await crearDonacion();
    await tomarDonacion(enCamino.codigo, usuarios.Ana.id);

    const comedor = await ingresar(usuarios.Comedor);
    const listaComedor = (await comedor.get('/para-recibir')).text;
    for (const d of [pan, leche, enCamino]) expect(listaComedor).toContain(d.codigo);
    expect(listaComedor).not.toContain(vencida.codigo);

    const hogar = await ingresar(usuarios.Hogar);
    const listaHogar = (await hogar.get('/para-recibir')).text;
    expect(listaHogar).toContain(pan.codigo);
    expect(listaHogar).not.toContain(leche.codigo);
    expect(listaHogar).toContain('sin refrigeración');
  });

  test('CA-19.3 · pedir deja la organización como destino, queda en el historial y sale de la lista de las demás', async () => {
    const d = await crearDonacion();
    const comedor = await ingresar(usuarios.Comedor);
    expect((await comedor.get(`/donaciones/${d.codigo}/pedir`)).text).toContain('Sí, la pedimos');
    const res = await comedor.post(`/donaciones/${d.codigo}/pedir`);
    expect(res.headers.location).toBe('/vienen');
    expect((await leer(d.codigo)).destino_organizacion_id).toBe(conFrio.id);

    const hogar = await ingresar(usuarios.Hogar);
    expect((await hogar.get('/para-recibir')).text).not.toContain(d.codigo);
    const otra = await hogar.post(`/donaciones/${d.codigo}/pedir`);
    expect(otra.status).toBe(409);
    expect(otra.text).toContain(`Esta donación ya la pidió ${conFrio.nombre}.`);

    const detalle = await comedor.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(`Pedida por ${conFrio.nombre}`);
  });

  test('CA-19.3 · una organización sin refrigeración no puede pedir lácteos', async () => {
    const leche = await crearDonacion({ tipo: 'Lácteos' });
    const hogar = await ingresar(usuarios.Hogar);
    const res = await hogar.post(`/donaciones/${leche.codigo}/pedir`);
    expect(res.status).toBe(409);
    expect(res.text).toContain('necesita refrigeración');
    expect((await leer(leche.codigo)).destino_organizacion_id).toBeNull();
  });

  test('CA-19.4 · dos organizaciones piden al mismo tiempo: exactamente una queda como destino', async () => {
    for (let i = 0; i < 8; i += 1) {
      const d = await crearDonacion();
      const resultados = await Promise.all([
        pedirDonacion(d.codigo, usuarios.Comedor),
        pedirDonacion(d.codigo, usuarios.Hogar),
      ]);
      const ganaron = resultados.filter((r) => r.motivo === 'hecho');
      expect(ganaron).toHaveLength(1);
      const perdio = resultados.find((r) => r.motivo !== 'hecho');
      expect(perdio.motivo).toBe('ya_pedida');
      const movimientos = await consultar("SELECT count(*)::int AS n FROM movimientos WHERE donacion_id = $1 AND tipo = 'solicitud'", [d.id]);
      expect(movimientos.rows[0].n).toBe(1);
    }
  });

  test('CA-19.5 · «Vienen para nosotros»: esperando voluntario o en camino con quién la trae y su teléfono', async () => {
    const espera = await crearDonacion();
    const camino = await crearDonacion();
    await pedirDonacion(espera.codigo, usuarios.Comedor);
    await pedirDonacion(camino.codigo, usuarios.Comedor);
    await tomarDonacion(camino.codigo, usuarios.Ana.id);

    const comedor = await ingresar(usuarios.Comedor);
    const texto = (await comedor.get('/vienen')).text;
    const tarjetaCamino = texto.slice(texto.indexOf(`/donaciones/${camino.codigo}`) - 600, texto.indexOf(`/donaciones/${camino.codigo}`));
    expect(tarjetaCamino).toContain('En camino');
    expect(tarjetaCamino).toContain(usuarios.Ana.nombre);
    expect(tarjetaCamino).toContain(TEL_ANA);
    const tarjetaEspera = texto.slice(texto.indexOf(`/donaciones/${espera.codigo}`) - 400, texto.indexOf(`/donaciones/${espera.codigo}`));
    expect(tarjetaEspera).toContain('Esperando voluntario');
  });

  test('CA-19.6 · «Ya no la necesitamos» le quita el destino y vuelve a estar para las demás', async () => {
    const d = await crearDonacion();
    await pedirDonacion(d.codigo, usuarios.Comedor);
    const comedor = await ingresar(usuarios.Comedor);
    expect((await comedor.get(`/donaciones/${d.codigo}/retirar-solicitud`)).text).toContain('Sí, ya no la necesitamos');
    const res = await comedor.post(`/donaciones/${d.codigo}/retirar-solicitud`);
    expect(res.headers.location).toBe('/vienen');
    expect((await leer(d.codigo)).destino_organizacion_id).toBeNull();

    const hogar = await ingresar(usuarios.Hogar);
    expect((await hogar.get('/para-recibir')).text).toContain(d.codigo);
    // El hogar no puede retirar una solicitud que no es suya.
    await pedirDonacion(d.codigo, usuarios.Comedor);
    expect((await hogar.post(`/donaciones/${d.codigo}/retirar-solicitud`)).status).toBe(409);
  });

  test('CA-19.7 · el voluntario ve a dónde llevarla y la entrega trae esa organización elegida', async () => {
    const d = await crearDonacion();
    await pedirDonacion(d.codigo, usuarios.Comedor);
    const ana = await ingresar(usuarios.Ana);
    const disponibles = (await ana.get('/disponibles')).text;
    expect(disponibles).toContain(`Llevar a: <strong>${conFrio.nombre}</strong>, Calle 1 # 2`);
    expect(disponibles).toContain(TEL_COMEDOR);

    await ana.post(`/donaciones/${d.codigo}/tomar`);
    expect((await ana.get('/mis-recogidas')).text).toContain(`Llevar a: <strong>${conFrio.nombre}</strong>`);
    const formulario = (await ana.get(`/donaciones/${d.codigo}/entregar`)).text;
    expect(formulario).toMatch(new RegExp(`value="${conFrio.id}" selected`));
  });

  test('CA-19.8 · «Recibidas» muestra lo entregado a su organización en los últimos 30 días', async () => {
    const d = await crearDonacion();
    await tomarDonacion(d.codigo, usuarios.Ana.id);
    const ana = await ingresar(usuarios.Ana);
    await ana.post(`/donaciones/${d.codigo}/entregar`).type('form').send({ organizacion_id: String(conFrio.id), recibido_por: 'Doña Rosa' });

    const comedor = await ingresar(usuarios.Comedor);
    const recibidas = (await comedor.get('/recibidas')).text;
    expect(recibidas).toContain(d.codigo);
    expect(recibidas).toContain('La recibió: Doña Rosa');
    const hogar = await ingresar(usuarios.Hogar);
    expect((await hogar.get('/recibidas')).text).not.toContain(d.codigo);
  });

  test('CA-19.9 · una organización no toma, entrega, publica ni administra; nadie más pide donaciones', async () => {
    const d = await crearDonacion();
    const comedor = await ingresar(usuarios.Comedor);
    expect((await comedor.post(`/donaciones/${d.codigo}/tomar`)).status).toBe(403);
    expect((await comedor.get('/donaciones/nueva')).status).toBe(403);
    expect((await comedor.get('/usuarios')).status).toBe(403);
    expect((await comedor.get(`/donaciones/${d.codigo}/entregar`)).status).toBe(403);

    const ana = await ingresar(usuarios.Ana);
    expect((await ana.post(`/donaciones/${d.codigo}/pedir`)).status).toBe(403);
    expect((await ana.get('/para-recibir')).status).toBe(403);
    expect((await leer(d.codigo)).destino_organizacion_id).toBeNull();
  });
});
