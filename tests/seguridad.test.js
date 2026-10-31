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

    const estilos = await request(app).get('/estilos.css');
    expect(estilos.headers['x-content-type-options']).toBe('nosniff');
  });
});
