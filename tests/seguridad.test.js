// T-SEG.1 y T-SEG.2 · Seguridad (docs/spec/comportamientos.md, ADR-006).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `SEG-${Date.now()}`;
const ana = { nombre: `Ana ${marca}`, pin: '2222' };

async function pinSigueSiendo(usuario, pin) {
  const r = await consultar('SELECT pin_hash FROM usuarios WHERE id = $1', [usuario.id]);
  return bcrypt.compare(pin, r.rows[0].pin_hash);
}

beforeAll(async () => {
  await migrar();
  const hash = await bcrypt.hash(ana.pin, 4);
  ana.id = (await consultar("INSERT INTO usuarios (nombre, rol, pin_hash) VALUES ($1, 'voluntario', $2) RETURNING id", [ana.nombre, hash])).rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

async function ingresar() {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: ana.nombre, pin: ana.pin });
  return agente;
}

describe('T-SEG.1 · Formularios de otros sitios y cabeceras de seguridad', () => {
  test('CA-SEG.1 · un formulario enviado desde otro sitio se rechaza y no cambia nada', async () => {
    const agente = await ingresar();
    const res = await agente
      .post('/mi-pin')
      .set('Origin', 'https://sitio-malicioso.example')
      .type('form')
      .send({ pin_actual: ana.pin, pin_nuevo: '1357', pin_repetido: '1357' });
    expect(res.status).toBe(403);
    expect(res.text).toContain('Esta acción no viene de la página de Rescate de Alimentos.');
    expect(await pinSigueSiendo(ana, ana.pin)).toBe(true);
  });

  test('CA-SEG.1 · también se rechaza si solo trae Referer de otro sitio, u Origin «null»', async () => {
    const agente = await ingresar();
    const conReferer = await agente.post('/salir').set('Referer', 'https://otro.example/pagina');
    expect(conReferer.status).toBe(403);
    const conNull = await agente.post('/salir').set('Origin', 'null');
    expect(conNull.status).toBe(403);
    expect((await agente.get('/')).status).toBe(200); // la sesión sigue abierta: no se salió
  });

  test('CA-SEG.1 · la sincronización sin conexión desde otro sitio responde 403 en JSON', async () => {
    const res = await request(app).post('/api/donaciones/sincronizar').set('Origin', 'https://otro.example').send({});
    expect(res.status).toBe(403);
    expect(res.body.estado).toBe('origen_no_permitido');
  });

  test('CA-SEG.2 · un envío desde la propia aplicación funciona', async () => {
    const agente = await ingresar();
    const res = await agente
      .post('/mi-pin')
      .set('Host', 'rescate.example')
      .set('Origin', 'https://rescate.example')
      .type('form')
      .send({ pin_actual: ana.pin, pin_nuevo: '2468', pin_repetido: '2468' });
    expect(res.status).toBe(302);
    expect(await pinSigueSiendo(ana, '2468')).toBe(true);
    ana.pin = '2468';
  });

  test('CA-SEG.3 · las páginas llevan cabeceras de seguridad', async () => {
    const res = await request(app).get('/ingreso');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    // Con «no-referrer» el navegador mandaría «Origin: null» y CA-SEG.1 rechazaría los formularios propios.
    expect(res.headers['referrer-policy']).toBe('same-origin');

    const estilos = await request(app).get('/estilos.css');
    expect(estilos.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('T-SEG.2 · Registro de errores con código', () => {
  // Se provoca un error inesperado haciendo fallar solo la consulta de la lista de zonas.
  let llamadas = 0;
  async function provocarError() {
    llamadas += 1;
    const nombre = `Marcela ${llamadas} ${marca}`;
    const hash = await bcrypt.hash('4444', 4);
    const marcela = (
      await consultar("INSERT INTO usuarios (nombre, rol, pin_hash) VALUES ($1, 'coordinadora', $2) RETURNING id", [nombre, hash])
    ).rows[0];
    const agente = request.agent(app);
    await agente.post('/ingreso').type('form').send({ nombre, pin: '4444' });

    const original = pool.query.bind(pool);
    const espiaConsulta = jest.spyOn(pool, 'query').mockImplementation((texto, ...resto) => {
      if (typeof texto === 'string' && texto.includes('FROM zonas z')) return Promise.reject(new Error('falla interna de prueba'));
      return original(texto, ...resto);
    });
    const espiaRegistro = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await agente.get('/zonas');
      return { res, lineas: espiaRegistro.mock.calls.map((c) => String(c[0])), marcela };
    } finally {
      espiaConsulta.mockRestore();
      espiaRegistro.mockRestore();
    }
  }

  test('CA-SEG.4 · el usuario ve un código y ningún detalle interno', async () => {
    const { res } = await provocarError();
    expect(res.status).toBe(500);
    expect(res.text).toMatch(/avisa a la coordinadora con este código: [0-9A-F]{6}/);
    expect(res.text).not.toContain('falla interna de prueba');
    expect(res.text).not.toContain('at ');
  });

  test('CA-SEG.5 · el registro guarda el mismo código con fecha, ruta, usuario y error', async () => {
    const { res, lineas, marcela } = await provocarError();
    const codigo = /este código: ([0-9A-F]{6})/.exec(res.text)[1];
    const linea = lineas.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((l) => l && l.codigo === codigo);
    expect(linea).toBeDefined();
    expect(linea.ruta).toBe('/zonas');
    expect(linea.usuario_id).toBe(marcela.id);
    expect(linea.mensaje).toBe('falla interna de prueba');
    expect(new Date(linea.fecha).getTime()).not.toBeNaN();
  });
});
