// CMP-03 · Prueba de concurrencia (T-03.3, ADR-001): varios voluntarios toman la MISMA donación AL MISMO TIEMPO.
// Es la prueba que demuestra el corazón del caso: nunca dos voluntarios en el mismo punto de recogida.
// Necesita PostgreSQL real: la garantía vive en la base de datos, no en la aplicación.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { tomarDonacion } = require('../src/servicios/donaciones');

const marca = `CONC-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1212' };
const ana = { nombre: `Ana ${marca}`, pin: '2323' };
const bruno = { nombre: `Bruno ${marca}`, pin: '3434' };
const muchos = []; // más voluntarios que conexiones del pool (el pool tiene 10 por defecto)

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

async function crearDonacion() {
  const r = await consultar(
    `INSERT INTO donaciones
       (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id)
     VALUES ('Panadería', 12, 'kg', 'Punto de la prueba de concurrencia', $1, now() + interval '2 hours', $2, $2)
     RETURNING id, codigo`,
    [zona, donante.id]
  );
  return r.rows[0];
}

async function movimientosDeToma(donacionId) {
  const r = await consultar("SELECT usuario_id FROM movimientos WHERE donacion_id = $1 AND tipo = 'toma'", [donacionId]);
  return r.rows;
}

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(bruno, 'voluntario');
  for (let i = 1; i <= 15; i += 1) {
    const voluntario = { nombre: `Voluntario ${i} ${marca}`, pin: '5656' };
    await crearUsuario(voluntario, 'voluntario');
    muchos.push(voluntario);
  }
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-03 · Concurrencia', () => {
  test('CA-03.2 · dos voluntarios pulsan «Tomar» al mismo tiempo: exactamente uno queda asignado y el otro ve el aviso', async () => {
    const agenteAna = await ingresar(ana);
    const agenteBruno = await ingresar(bruno);

    // Se repite varias veces: una carrera de dos peticiones no siempre se «cruza» en cada intento.
    for (let ronda = 1; ronda <= 10; ronda += 1) {
      const donacion = await crearDonacion();

      const [respuestaAna, respuestaBruno] = await Promise.all([
        agenteAna.post(`/donaciones/${donacion.codigo}/tomar`),
        agenteBruno.post(`/donaciones/${donacion.codigo}/tomar`),
      ]);

      const estados = [respuestaAna.status, respuestaBruno.status].sort();
      expect(estados).toEqual([302, 409]); // uno gana (redirige) y el otro es rechazado

      const ganador = respuestaAna.status === 302 ? ana : bruno;
      const perdedor = respuestaAna.status === 302 ? bruno : ana;
      const respuestaPerdedor = respuestaAna.status === 302 ? respuestaBruno : respuestaAna;

      // El perdedor ve quién la tomó y que no vaya al punto de recogida.
      expect(respuestaPerdedor.text).toContain(`Esta donación ya fue tomada por ${ganador.nombre} a las`);
      expect(respuestaPerdedor.text).toContain('No vayas al punto de recogida.');

      // En la base de datos: un solo voluntario asignado y un solo movimiento de toma, el del ganador.
      const guardada = (await consultar('SELECT estado, voluntario_id FROM donaciones WHERE id = $1', [donacion.id])).rows[0];
      expect(guardada.estado).toBe('asignada');
      expect(guardada.voluntario_id).toBe(ganador.id);
      expect(guardada.voluntario_id).not.toBe(perdedor.id);
      expect(await movimientosDeToma(donacion.id)).toEqual([{ usuario_id: ganador.id }]);
    }
  });

  test('CA-03.2 · con 15 tomas simultáneas (más que las conexiones del pool) solo una gana y ninguna se queda esperando', async () => {
    const donacion = await crearDonacion();

    const resultados = await Promise.all(muchos.map((v) => tomarDonacion(donacion.codigo, v.id)));

    const ganadores = resultados.filter((r) => r.tomada);
    const rechazadas = resultados.filter((r) => !r.tomada);
    expect(ganadores).toHaveLength(1);
    expect(rechazadas).toHaveLength(14);
    rechazadas.forEach((r) => expect(r.motivo).toBe('ya_tomada'));

    const idGanador = ganadores[0].donacion.voluntario_id;
    const guardada = (await consultar('SELECT estado, voluntario_id FROM donaciones WHERE id = $1', [donacion.id])).rows[0];
    expect(guardada).toEqual({ estado: 'asignada', voluntario_id: idGanador });
    expect(await movimientosDeToma(donacion.id)).toEqual([{ usuario_id: idGanador }]);
  }, 30000);
});
