// CMP-13 · Corregir o cancelar una donación (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { tomarDonacion } = require('../src/servicios/donaciones');
const { cancelarDonacion } = require('../src/servicios/correcciones');
const { fechaParaCampo } = require('../src/utilidades/fechas');

const marca = `CMP13-${Date.now()}`;
const zona = `Zona ${marca}`;
const donante = { nombre: `Donante ${marca}`, pin: '1111' };
const otroDonante = { nombre: `Otro donante ${marca}`, pin: '5555' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
let organizacion;

async function crearUsuario(usuario, rol) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, $2, $3, $4) RETURNING id', [
    usuario.nombre,
    rol,
    hash,
    zona,
  ]);
  usuario.id = r.rows[0].id;
  usuario.rol = rol;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

// Crea una donación de `donante` en el estado pedido, con su movimiento de registro.
async function crearDonacion({ estado = 'disponible', minutosLimite = 120 } = {}) {
  const r = await consultar(
    `INSERT INTO donaciones
       (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id, registrada_por_id,
        voluntario_id, tomada_en, organizacion_id, recibido_por, entregada_en)
     VALUES ('Panadería', 20, 'unidades', 'Calle 10', $1, $2, $3, $4, $4, $5, $6, $7, $8, $9)
     RETURNING id, codigo`,
    [
      zona,
      new Date(Date.now() + minutosLimite * 60000),
      estado,
      donante.id,
      estado === 'disponible' ? null : ana.id,
      estado === 'disponible' ? null : new Date(),
      estado === 'entregada' ? organizacion.id : null,
      estado === 'entregada' ? 'Rosa' : null,
      estado === 'entregada' ? new Date() : null,
    ]
  );
  await consultar("INSERT INTO movimientos (donacion_id, tipo, usuario_id) VALUES ($1, 'registro', $2)", [r.rows[0].id, donante.id]);
  return r.rows[0];
}

async function leer(codigo) {
  return (await consultar('SELECT * FROM donaciones WHERE codigo = $1', [codigo])).rows[0];
}

async function movimientos(codigo, tipo) {
  const r = await consultar(
    'SELECT m.* FROM movimientos m JOIN donaciones d ON d.id = m.donacion_id WHERE d.codigo = $1 AND m.tipo = $2',
    [codigo, tipo]
  );
  return r.rows;
}

function enHoras(horas) {
  return fechaParaCampo(new Date(Date.now() + horas * 3600000));
}

let agenteDonante;
let agenteCoordinadora;

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(otroDonante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(marcela, 'coordinadora');
  organizacion = (
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 1', $2) RETURNING id, nombre", [
      `Comedor ${marca}`,
      zona,
    ])
  ).rows[0];
  agenteDonante = await ingresar(donante);
  agenteCoordinadora = await ingresar(marcela);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-13 · Corregir o cancelar una donación', () => {
  test('CA-13.1 · el donante corrige su donación disponible: mismo código y la corrección queda en el historial', async () => {
    const d = await crearDonacion();
    const formulario = await agenteDonante.get(`/donaciones/${d.codigo}/corregir`);
    expect(formulario.status).toBe(200);
    expect(formulario.text).toContain('value="20"');

    const res = await agenteDonante
      .post(`/donaciones/${d.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '15', unidad: 'unidades', punto_recogida: 'Calle 11', hora_limite: enHoras(3) });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/donaciones/${d.codigo}`);

    const guardada = await leer(d.codigo);
    expect(Number(guardada.cantidad)).toBe(15);
    expect(guardada.punto_recogida).toBe('Calle 11');
    const [correccion] = await movimientos(d.codigo, 'correccion');
    expect(correccion.usuario_id).toBe(donante.id);
    expect(correccion.detalle).toContain('Cantidad: 20 unidades → 15 unidades');
    expect(correccion.detalle).toContain('Punto de recogida: Calle 10 → Calle 11');

    const detalle = await agenteDonante.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain(`Corregida por ${donante.nombre}`);
  });

  test('CA-13.2 · aplican las reglas de registro y una vencida con hora nueva vuelve a disponibles', async () => {
    const d = await crearDonacion();
    const mala = await agenteDonante
      .post(`/donaciones/${d.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '0', unidad: 'unidades', punto_recogida: 'Calle 10', hora_limite: enHoras(-1) });
    expect(mala.status).toBe(400);
    expect(mala.text).toContain('La cantidad debe ser mayor que cero.');
    expect(mala.text).toContain('La hora límite debe ser posterior a la hora actual');
    expect(Number((await leer(d.codigo)).cantidad)).toBe(20);

    const vencida = await crearDonacion({ minutosLimite: -30 });
    await agenteDonante
      .post(`/donaciones/${vencida.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '20', unidad: 'unidades', punto_recogida: 'Calle 10', hora_limite: enHoras(2) });
    const agenteAna = await ingresar(ana);
    const disponibles = await agenteAna.get('/disponibles?zona=todas');
    expect(disponibles.text).toContain(vencida.codigo);
  });

  test('CA-13.3 · la coordinadora corrige una asignada o entregada, sin cambiar la hora límite', async () => {
    const asignada = await crearDonacion({ estado: 'asignada' });
    const antes = await leer(asignada.codigo);
    const formulario = await agenteCoordinadora.get(`/donaciones/${asignada.codigo}/corregir`);
    expect(formulario.text).toContain('Ya no se cambia porque la donación ya fue tomada.');
    expect(formulario.text).not.toContain('name="hora_limite"');

    const res = await agenteCoordinadora
      .post(`/donaciones/${asignada.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Lácteos', cantidad: '20', unidad: 'unidades', punto_recogida: 'Calle 10', hora_limite: enHoras(9) });
    expect(res.status).toBe(302);
    const despues = await leer(asignada.codigo);
    expect(despues.tipo_alimento).toBe('Lácteos');
    expect(despues.estado).toBe('asignada');
    expect(despues.hora_limite.getTime()).toBe(antes.hora_limite.getTime());

    const entregada = await crearDonacion({ estado: 'entregada' });
    const r2 = await agenteCoordinadora
      .post(`/donaciones/${entregada.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '18', unidad: 'unidades', punto_recogida: 'Calle 10' });
    expect(r2.status).toBe(302);
    expect(Number((await leer(entregada.codigo)).cantidad)).toBe(18);
  });

  test('CA-13.4 · un donante no cambia donaciones ajenas ni las suyas ya tomadas', async () => {
    const d = await crearDonacion();
    const agenteOtro = await ingresar(otroDonante);
    const ajena = await agenteOtro.get(`/donaciones/${d.codigo}/corregir`);
    expect(ajena.status).toBe(404);
    expect(ajena.text).toContain('Esta donación no es tuya.');
    expect((await agenteOtro.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'x' })).status).toBe(404);
    expect((await leer(d.codigo)).estado).toBe('disponible');

    const tomada = await crearDonacion({ estado: 'asignada' });
    const res = await agenteDonante
      .post(`/donaciones/${tomada.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '5', unidad: 'unidades', punto_recogida: 'Calle 10', hora_limite: enHoras(2) });
    expect(res.status).toBe(409);
    expect(res.text).toContain('Esta donación ya fue tomada; para cambiarla habla con la coordinadora.');
    const cancelar = await agenteDonante.post(`/donaciones/${tomada.codigo}/cancelar`).type('form').send({ motivo: 'Se dañó' });
    expect(cancelar.status).toBe(409);
    expect((await leer(tomada.codigo)).estado).toBe('asignada');
  });

  test('CA-13.5 · una corrección sin cambios no registra nada', async () => {
    const d = await crearDonacion();
    const formulario = await agenteDonante.get(`/donaciones/${d.codigo}/corregir`);
    const hora = /name="hora_limite" type="datetime-local" value="([^"]+)"/.exec(formulario.text)[1];
    const res = await agenteDonante
      .post(`/donaciones/${d.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '20', unidad: 'unidades', punto_recogida: 'Calle 10', hora_limite: hora });
    expect(res.status).toBe(400);
    expect(res.text).toContain('No cambiaste ningún dato.');
    expect(await movimientos(d.codigo, 'correccion')).toHaveLength(0);
  });

  test('CA-13.6 · el donante cancela su donación disponible y sale de la lista de disponibles', async () => {
    const d = await crearDonacion();
    const confirmar = await agenteDonante.get(`/donaciones/${d.codigo}/cancelar`);
    expect(confirmar.text).toContain('No se puede deshacer.');

    const res = await agenteDonante.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'Ya no hay pan' });
    expect(res.status).toBe(302);
    const guardada = await leer(d.codigo);
    expect(guardada.estado).toBe('cancelada');
    expect(guardada.motivo_cancelacion).toBe('Ya no hay pan');
    const [cancelacion] = await movimientos(d.codigo, 'cancelacion');
    expect(cancelacion.usuario_id).toBe(donante.id);

    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/disponibles?zona=todas')).text).not.toContain(d.codigo);
  });

  test('CA-13.6 · la coordinadora cancela una asignada y sale de «Mis recogidas»', async () => {
    const d = await crearDonacion({ estado: 'asignada' });
    const res = await agenteCoordinadora.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'El comercio cerró' });
    expect(res.status).toBe(302);
    expect((await leer(d.codigo)).estado).toBe('cancelada');

    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/mis-recogidas')).text).not.toContain(d.codigo);
    const entregar = await agenteAna.post(`/donaciones/${d.codigo}/entregar`).type('form').send({ organizacion_id: String(organizacion.id), recibido_por: 'Rosa' });
    expect(entregar.status).toBe(409);
    expect(entregar.text).toContain('Esta donación ya fue cancelada.');
  });

  test('CA-13.7 · motivo vacío, donación entregada o ya cancelada se rechazan', async () => {
    const d = await crearDonacion();
    const sinMotivo = await agenteDonante.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: '  ' });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.text).toContain('Falta el motivo de la cancelación.');
    expect((await leer(d.codigo)).estado).toBe('disponible');

    const entregada = await crearDonacion({ estado: 'entregada' });
    const cancelarEntregada = await agenteCoordinadora.post(`/donaciones/${entregada.codigo}/cancelar`).type('form').send({ motivo: 'x' });
    expect(cancelarEntregada.status).toBe(409);
    expect(cancelarEntregada.text).toContain(`a ${organizacion.nombre}.`);
    expect(cancelarEntregada.text).toContain('Esta donación ya fue entregada el');
    const corregirEntregada = await agenteDonante.get(`/donaciones/${entregada.codigo}/corregir`);
    expect(corregirEntregada.text).toContain('Esta donación ya fue entregada el');

    await agenteDonante.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'Se dañó' });
    const otraVez = await agenteDonante.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'Se dañó' });
    expect(otraVez.status).toBe(409);
    expect(otraVez.text).toContain('Esta donación ya fue cancelada.');
    expect(await movimientos(d.codigo, 'cancelacion')).toHaveLength(1);
  });

  test('CA-13.8 · cancelar y tomar al mismo tiempo: exactamente una gana', async () => {
    for (let i = 0; i < 8; i += 1) {
      const d = await crearDonacion();
      const [cancelacion, toma] = await Promise.all([
        cancelarDonacion(d.codigo, donante, 'Ya no hay'),
        tomarDonacion(d.codigo, ana.id),
      ]);
      const ganaron = [Boolean(cancelacion.cancelada), toma.tomada].filter(Boolean);
      expect(ganaron).toHaveLength(1);

      const final = await leer(d.codigo);
      if (toma.tomada) {
        expect(final.estado).toBe('asignada');
        expect(cancelacion.rechazo.motivo).toBe('ya_tomada');
      } else {
        expect(final.estado).toBe('cancelada');
        expect(toma.motivo).toBe('cancelada');
      }
    }
  });

  test('CA-13.8 · si la toma llegó primero, la corrección del donante se rechaza', async () => {
    const d = await crearDonacion();
    await tomarDonacion(d.codigo, ana.id);
    const res = await agenteDonante
      .post(`/donaciones/${d.codigo}/corregir`)
      .type('form')
      .send({ tipo_alimento: 'Panadería', cantidad: '1', unidad: 'unidades', punto_recogida: 'Calle 10', hora_limite: enHoras(2) });
    expect(res.status).toBe(409);
    expect(Number((await leer(d.codigo)).cantidad)).toBe(20);

    const agenteAna = await ingresar(ana);
    const cancelada = await crearDonacion();
    await cancelarDonacion(cancelada.codigo, donante, 'Ya no hay');
    const tomar = await agenteAna.post(`/donaciones/${cancelada.codigo}/tomar`);
    expect(tomar.text).toContain('Esta donación fue cancelada. No vayas al punto de recogida.');
  });

  test('CA-13.9 · la cancelada se ve en el detalle, se filtra en «Todas» y el reporte la cuenta aparte', async () => {
    const d = await crearDonacion();
    await agenteDonante.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'Registro duplicado' });

    const detalle = await agenteCoordinadora.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).toContain('Cancelada');
    expect(detalle.text).toContain('Motivo de la cancelación: Registro duplicado');
    expect(detalle.text).toContain(`Cancelada por ${donante.nombre}. Motivo: Registro duplicado`);

    const canceladas = await agenteCoordinadora.get('/todas?estado=cancelada');
    expect(canceladas.text).toContain(d.codigo);
    expect((await agenteCoordinadora.get('/todas?estado=disponible')).text).not.toContain(d.codigo);

    const reporte = await agenteCoordinadora.get('/reporte');
    const canceladasEnReporte = Number(/data-dato="canceladas">(\d+)</.exec(reporte.text)[1]);
    expect(canceladasEnReporte).toBeGreaterThanOrEqual(1);
  });

  test('CA-13.10 · un voluntario no puede corregir ni cancelar', async () => {
    const d = await crearDonacion();
    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get(`/donaciones/${d.codigo}/corregir`)).status).toBe(403);
    expect((await agenteAna.post(`/donaciones/${d.codigo}/cancelar`).type('form').send({ motivo: 'x' })).status).toBe(403);
    expect((await leer(d.codigo)).estado).toBe('disponible');
    const detalle = await agenteAna.get(`/donaciones/${d.codigo}`);
    expect(detalle.text).not.toContain('Cancelar donación');
    expect(detalle.text).not.toContain('Corregir datos');
  });
});
