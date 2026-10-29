// CMP-06 · Soltar una donación tomada (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { soltarDonacion } = require('../src/servicios/liberaciones');
const { registrarEntrega } = require('../src/servicios/entregas');

const marca = `CMP06-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1111' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const bruno = { nombre: `Bruno ${marca}`, pin: '3333' };
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
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

// Crea una donación en el estado pedido. Si está «asignada» o «entregada», la tomó `voluntario` (Ana por defecto).
// Deja también sus movimientos de registro y toma, con horas distintas, para probar el orden del historial.
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
  const donacion = r.rows[0];
  await consultar("INSERT INTO movimientos (donacion_id, tipo, usuario_id, ocurrido_en) VALUES ($1, 'registro', $2, $3)", [
    donacion.id,
    donante.id,
    new Date(Date.now() - 90 * 60000),
  ]);
  if (estado !== 'disponible') {
    await consultar("INSERT INTO movimientos (donacion_id, tipo, usuario_id, ocurrido_en) VALUES ($1, 'toma', $2, $3)", [
      donacion.id,
      voluntario.id,
      new Date(Date.now() - 60 * 60000),
    ]);
  }
  return donacion;
}

const leer = async (id) => (await consultar('SELECT * FROM donaciones WHERE id = $1', [id])).rows[0];
const liberaciones = async (id) =>
  (await consultar("SELECT usuario_id FROM movimientos WHERE donacion_id = $1 AND tipo = 'liberacion'", [id])).rows;

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(bruno, 'voluntario');
  await crearUsuario(marcela, 'coordinadora');
  const nombre = `Comedor ${marca}`;
  const r = await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 5', $2) RETURNING id", [nombre, zona]);
  organizacion = { id: r.rows[0].id, nombre };
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-06 · Soltar una donación tomada', () => {
  test('CA-06.1 · el voluntario que la tomó la suelta: vuelve a «disponible», sale de «Mis recogidas» y queda el movimiento', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    // Antes de soltarla, está en «Mis recogidas».
    expect((await agente.get('/mis-recogidas')).text).toContain(donacion.codigo);

    // La pantalla de confirmación no cambia nada todavía.
    const confirmar = await agente.get(`/donaciones/${donacion.codigo}/soltar`);
    expect(confirmar.status).toBe(200);
    expect(confirmar.text).toContain('¿Soltar esta donación?');
    expect((await leer(donacion.id)).estado).toBe('asignada');

    const respuesta = await agente.post(`/donaciones/${donacion.codigo}/soltar`);
    expect(respuesta.status).toBe(302);
    expect(respuesta.headers.location).toBe(`/donaciones/${donacion.codigo}`);

    const fila = await leer(donacion.id);
    expect(fila.estado).toBe('disponible');
    expect(fila.voluntario_id).toBeNull();
    expect(fila.tomada_en).toBeNull();

    // El movimiento dice quién la soltó.
    expect(await liberaciones(donacion.id)).toEqual([{ usuario_id: ana.id }]);

    // Ya no está en «Mis recogidas» y, con hora límite vigente, vuelve a la lista de disponibles.
    expect((await agente.get('/mis-recogidas')).text).not.toContain(donacion.codigo);
    expect((await agente.get('/disponibles')).text).toContain(donacion.codigo);
  });

  test('CA-06.2 · otro voluntario no puede soltarla: se rechaza y la donación no cambia', async () => {
    const donacion = await crearDonacion();
    const agenteBruno = await ingresar(bruno);

    const respuesta = await agenteBruno.post(`/donaciones/${donacion.codigo}/soltar`);
    expect(respuesta.status).toBe(409);
    expect(respuesta.text).toContain('Solo quien la tomó puede soltarla');

    expect((await agenteBruno.get(`/donaciones/${donacion.codigo}/soltar`)).status).toBe(409);

    const fila = await leer(donacion.id);
    expect(fila.estado).toBe('asignada');
    expect(fila.voluntario_id).toBe(ana.id);
    expect(await liberaciones(donacion.id)).toEqual([]);
  });

  test('CA-06.3 · si no está asignada se rechaza: disponible, entregada o inexistente', async () => {
    const agente = await ingresar(ana);

    const disponible = await crearDonacion({ estado: 'disponible' });
    const a = await agente.post(`/donaciones/${disponible.codigo}/soltar`);
    expect(a.status).toBe(409);
    expect(a.text).toContain('Esta donación no está asignada a nadie');
    expect(await liberaciones(disponible.id)).toEqual([]);

    const entregada = await crearDonacion({ estado: 'entregada' });
    const b = await agente.post(`/donaciones/${entregada.codigo}/soltar`);
    expect(b.status).toBe(409);
    expect(b.text).toContain('ya fue entregada el');
    expect(b.text).toContain(organizacion.nombre);
    expect(b.text).toContain('no se puede soltar');
    expect((await leer(entregada.id)).estado).toBe('entregada');

    const c = await agente.post('/donaciones/D-9999999/soltar');
    expect(c.status).toBe(404);
    expect(c.text).toContain('No existe una donación con ese código');
  });

  test('CA-06.4 · un reintento tras soltarla no duplica el movimiento y dice que ya no está asignada', async () => {
    const donacion = await crearDonacion();
    const agente = await ingresar(ana);

    expect((await agente.post(`/donaciones/${donacion.codigo}/soltar`)).status).toBe(302);
    const reintento = await agente.post(`/donaciones/${donacion.codigo}/soltar`);
    expect(reintento.status).toBe(409);
    expect(reintento.text).toContain('Esta donación no está asignada a nadie');

    expect(await liberaciones(donacion.id)).toHaveLength(1);
  });

  test('CA-06.5 · con la hora límite ya pasada se acepta y queda «Vencida (no recogida)», fuera de la lista', async () => {
    const donacion = await crearDonacion({ minutosLimite: -30 });
    const agente = await ingresar(ana);

    expect((await agente.post(`/donaciones/${donacion.codigo}/soltar`)).status).toBe(302);
    expect((await leer(donacion.id)).estado).toBe('disponible');

    expect((await agente.get(`/donaciones/${donacion.codigo}`)).text).toContain('Vencida (no recogida)');
    expect((await agente.get('/disponibles')).text).not.toContain(donacion.codigo);
  });

  test('CA-06.6 · el historial muestra «Soltada por…» en orden y otro voluntario puede tomarla después', async () => {
    const donacion = await crearDonacion();
    const agenteAna = await ingresar(ana);
    await agenteAna.post(`/donaciones/${donacion.codigo}/soltar`);

    const detalle = (await agenteAna.get(`/donaciones/${donacion.codigo}`)).text;
    expect(detalle).toContain(`Soltada por ${ana.nombre}`);
    // Orden cronológico: registrada, tomada, soltada.
    const posiciones = [`Registrada por ${donante.nombre}`, `Tomada por ${ana.nombre}`, `Soltada por ${ana.nombre}`].map((t) =>
      detalle.indexOf(t)
    );
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((x, y) => x - y)).toEqual(posiciones);

    // Bruno la toma como cualquier donación disponible (CA-03.1) y ya no puede tomarla nadie más (CA-03.2).
    const agenteBruno = await ingresar(bruno);
    expect((await agenteBruno.post(`/donaciones/${donacion.codigo}/tomar`)).status).toBe(302);
    expect((await leer(donacion.id)).voluntario_id).toBe(bruno.id);
    const segunda = await agenteAna.post(`/donaciones/${donacion.codigo}/tomar`);
    expect(segunda.status).toBe(409);
    expect(segunda.text).toContain(`ya fue tomada por ${bruno.nombre}`);
  });

  test('CA-06.7 · soltar y entregar al mismo tiempo: gana exactamente una y no queda un estado inconsistente', async () => {
    for (let ronda = 0; ronda < 10; ronda++) {
      const donacion = await crearDonacion();
      const [soltar, entregar] = await Promise.all([
        soltarDonacion(donacion.codigo, ana.id),
        registrarEntrega({ codigo: donacion.codigo, voluntarioId: ana.id, organizacionId: organizacion.id, recibidoPor: 'Doña Rosa' }),
      ]);

      // Exactamente una de las dos acciones ganó.
      expect([soltar.soltada, entregar.entregada].filter(Boolean)).toHaveLength(1);

      const fila = await leer(donacion.id);
      const movimientos = (
        await consultar("SELECT tipo FROM movimientos WHERE donacion_id = $1 AND tipo IN ('liberacion', 'entrega')", [donacion.id])
      ).rows.map((m) => m.tipo);

      if (soltar.soltada) {
        expect(fila.estado).toBe('disponible');
        expect(fila.voluntario_id).toBeNull();
        expect(fila.entregada_en).toBeNull();
        expect(movimientos).toEqual(['liberacion']);
      } else {
        expect(fila.estado).toBe('entregada');
        expect(movimientos).toEqual(['entrega']);
      }
    }
  });

  test('CA-06.8 · quien no es voluntario no puede soltar una donación', async () => {
    const donacion = await crearDonacion();

    for (const usuario of [donante, marcela]) {
      const agente = await ingresar(usuario);
      expect((await agente.post(`/donaciones/${donacion.codigo}/soltar`)).status).toBe(403);
      expect((await agente.get(`/donaciones/${donacion.codigo}/soltar`)).status).toBe(403);
    }

    // Sin sesión se manda a ingresar.
    const sinSesion = await request(app).post(`/donaciones/${donacion.codigo}/soltar`);
    expect(sinSesion.status).toBe(302);
    expect(sinSesion.headers.location).toBe('/ingreso');

    expect((await leer(donacion.id)).estado).toBe('asignada');
    expect(await liberaciones(donacion.id)).toEqual([]);
  });
});
