// CMP-21 · Donaciones por vencer y recordatorio por WhatsApp (docs/spec/comportamientos.md).
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { numeroWhatsApp } = require('../src/servicios/por-vencer');

const marca = `CMP21-${Date.now()}`;
const zona = `Zona ${marca}`;
const u = {};

async function crearUsuario(clave, rol, telefono = null, zonaUsuario = zona) {
  const nombre = `${clave} ${marca}`;
  const hash = await bcrypt.hash('1234', 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
    nombre,
    rol,
    hash,
    zonaUsuario,
    telefono,
  ]);
  u[clave] = { id: r.rows[0].id, nombre };
}

async function ingresar(clave) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: u[clave].nombre, pin: '1234' });
  return agente;
}

async function crearDonacion(minutos, voluntario = null) {
  const r = await consultar(
    `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                             registrada_por_id, voluntario_id, tomada_en)
     VALUES ('Panadería', 20, 'unidades', 'Calle 21', $1, now() + make_interval(mins => $2), $3, $4, $4, $5, $6) RETURNING codigo`,
    [zona, minutos, voluntario ? 'asignada' : 'disponible', u.Panaderia.id, voluntario ? voluntario.id : null, voluntario ? new Date() : null]
  );
  return r.rows[0].codigo;
}

beforeAll(async () => {
  await crearUsuario('Marcela', 'coordinadora', null, null);
  await crearUsuario('Panaderia', 'donante', '601 444 2121');
  await crearUsuario('Ana', 'voluntario', '300 121 2121');
  await crearUsuario('SinTelefono', 'voluntario', null);
  await crearUsuario('OtraZona', 'voluntario', '300 999 9999', `Otra ${marca}`);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-21 · Donaciones por vencer y recordatorio por WhatsApp', () => {
  test('CA-21.1 · el inicio de la coordinadora muestra cuántas están por vencer', async () => {
    await crearDonacion(30);
    const agente = await ingresar('Marcela');
    const inicio = await agente.get('/');
    const total = Number(/data-por-vencer>(\d+)</.exec(inicio.text)[1]);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(inicio.text).toContain('href="/por-vencer"');
  });

  test('CA-21.2 · «Por vencer» lista disponibles y asignadas con 60 minutos o menos, de la más urgente a la menos', async () => {
    const pronto = await crearDonacion(15);
    const asignada = await crearDonacion(45, u.Ana);
    const lejos = await crearDonacion(180);
    const vencida = await crearDonacion(-10);
    const agente = await ingresar('Marcela');
    const texto = (await agente.get('/por-vencer')).text;
    expect(texto).toContain(pronto);
    expect(texto).toContain(asignada);
    expect(texto).not.toContain(lejos);
    expect(texto).not.toContain(vencida);
    expect(texto.indexOf(pronto)).toBeLessThan(texto.indexOf(asignada));
    expect(texto).toContain(`La tomó ${u.Ana.nombre}`);
  });

  test('CA-21.3 · una disponible por vencer: WhatsApp a los voluntarios de su zona con el mensaje y el enlace para tomarla', async () => {
    const codigo = await crearDonacion(20);
    const agente = await ingresar('Marcela');
    const texto = (await agente.get(`/donaciones/${codigo}/avisar`)).text;
    expect(texto).toContain(u.Ana.nombre);
    expect(texto).not.toContain(u.OtraZona.nombre);
    const enlace = /href="(https:\/\/wa\.me\/573001212121\?text=[^"]+)"/.exec(texto)[1];
    const mensaje = decodeURIComponent(enlace.split('?text=')[1]);
    expect(mensaje).toContain(codigo);
    expect(mensaje).toContain('Panadería, 20 unidades');
    expect(mensaje).toContain('Calle 21');
    expect(mensaje).toContain(`/donaciones/${codigo}/tomar`);
  });

  test('CA-21.4 · una asignada por vencer: WhatsApp al voluntario que la tomó y al comercio', async () => {
    const codigo = await crearDonacion(40, u.Ana);
    const agente = await ingresar('Marcela');
    const texto = (await agente.get(`/donaciones/${codigo}/avisar`)).text;
    expect(texto).toContain('Voluntario que la tomó');
    expect(texto).toContain('https://wa.me/573001212121?text=');
    expect(texto).toContain('Comercio');
    expect(texto).toContain('https://wa.me/576014442121?text=');
  });

  test('CA-21.5 · el voluntario ve «Vence pronto» en disponibles y en «Mis recogidas»', async () => {
    const pronto = await crearDonacion(25);
    const lejos = await crearDonacion(200);
    await crearDonacion(30, u.Ana);
    const agente = await ingresar('Ana');
    const disponibles = (await agente.get('/disponibles')).text;
    const tarjeta = (codigo) => disponibles.slice(disponibles.lastIndexOf('<li', disponibles.indexOf(`/donaciones/${codigo}/tomar`)), disponibles.indexOf(`/donaciones/${codigo}/tomar`));
    expect(tarjeta(pronto)).toContain('Vence pronto');
    expect(tarjeta(lejos)).not.toContain('Vence pronto');
    expect((await agente.get('/mis-recogidas')).text).toContain('Vence pronto');
  });

  test('CA-21.6 · sin teléfono registrado no hay botón, se dice', async () => {
    const codigo = await crearDonacion(20);
    const agente = await ingresar('Marcela');
    const texto = (await agente.get(`/donaciones/${codigo}/avisar`)).text;
    const tarjeta = texto.slice(texto.indexOf(u.SinTelefono.nombre));
    expect(tarjeta.slice(0, 300)).toContain('Sin teléfono registrado');
    expect(numeroWhatsApp('')).toBeNull();
    expect(numeroWhatsApp('+57 300 123 4567')).toBe('573001234567');
  });

  test('CA-21.7 · quien no es coordinadora no abre «Por vencer» ni «Avisar»', async () => {
    const codigo = await crearDonacion(20);
    const agente = await ingresar('Ana');
    expect((await agente.get('/por-vencer')).status).toBe(403);
    expect((await agente.get(`/donaciones/${codigo}/avisar`)).status).toBe(403);
  });
});
