// CMP-02 · Hacer visible la donación para quien debe tomarla (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos de prueba llevan una marca única por ejecución,
// porque la base de datos la comparten otras pruebas.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP02-${Date.now()}`;
const zonaPropia = `Zona-${marca}`; // zona exclusiva de esta ejecución: no se mezcla con otras pruebas
const zonaOtra = `Otra-${marca}`;
const zonaVacia = `Vacia-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1357' };
const voluntario = { nombre: `Voluntario ${marca}`, pin: '2468' };
const voluntarioSinDonaciones = { nombre: `Voluntario vacío ${marca}`, pin: '2469' };

const puntos = {
  urgente: `Punto urgente ${marca}`,
  tranquila: `Punto tranquilo ${marca}`,
  otraZona: `Punto otra zona ${marca}`,
  asignada: `Punto asignada ${marca}`,
  entregada: `Punto entregada ${marca}`,
  vencida: `Punto vencida ${marca}`,
};

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

async function crearUsuario({ nombre, pin }, rol, zona) {
  const hash = await bcrypt.hash(pin, 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, $2, $3, $4) RETURNING id', [
    nombre,
    rol,
    hash,
    zona,
  ]);
  return r.rows[0].id;
}

// Inserta una donación con la hora límite a `minutos` de ahora (puede ser negativo: ya vencida).
async function crearDonacion({ punto, zona, minutos, estado = 'disponible', tipo = 'Panadería', cantidad = 10, unidad = 'kg', extra = {} }) {
  const campos = ['tipo_alimento', 'cantidad', 'unidad', 'punto_recogida', 'zona', 'hora_limite', 'estado', 'donante_id', 'registrada_por_id'];
  const valores = [tipo, cantidad, unidad, punto, zona, new Date(Date.now() + minutos * 60000), estado, donante.id, donante.id];
  for (const [campo, valor] of Object.entries(extra)) {
    campos.push(campo);
    valores.push(valor);
  }
  const marcadores = valores.map((_, i) => `$${i + 1}`).join(', ');
  await consultar(`INSERT INTO donaciones (${campos.join(', ')}) VALUES (${marcadores})`, valores);
}

beforeAll(async () => {
  await migrar();
  donante.id = await crearUsuario(donante, 'donante', zonaPropia);
  voluntario.id = await crearUsuario(voluntario, 'voluntario', zonaPropia);
  voluntarioSinDonaciones.id = await crearUsuario(voluntarioSinDonaciones, 'voluntario', zonaVacia);

  const org = await consultar(
    "INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 1', $2) RETURNING id",
    [`Organización ${marca}`, zonaPropia]
  );

  // Disponibles de la zona del voluntario: la «urgente» vence antes que la «tranquila».
  await crearDonacion({ punto: puntos.tranquila, zona: zonaPropia, minutos: 180, tipo: 'Lácteos', cantidad: 4, unidad: 'cajas' });
  await crearDonacion({ punto: puntos.urgente, zona: zonaPropia, minutos: 90, tipo: 'Panadería', cantidad: 20, unidad: 'unidades' });
  // Disponible, pero de otra zona.
  await crearDonacion({ punto: puntos.otraZona, zona: zonaOtra, minutos: 120 });
  // No deben aparecer: asignada, entregada y vencida.
  await crearDonacion({
    punto: puntos.asignada, zona: zonaPropia, minutos: 120, estado: 'asignada',
    extra: { voluntario_id: voluntario.id, tomada_en: new Date() },
  });
  await crearDonacion({
    punto: puntos.entregada, zona: zonaPropia, minutos: 120, estado: 'entregada',
    extra: { voluntario_id: voluntario.id, tomada_en: new Date(), organizacion_id: org.rows[0].id, recibido_por: 'Alguien', entregada_en: new Date() },
  });
  await crearDonacion({ punto: puntos.vencida, zona: zonaPropia, minutos: -30 });
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-02 · Donaciones disponibles', () => {
  test('CA-02.1 · el voluntario ve las disponibles con tipo, cantidad, punto de recogida, zona, hora límite y tiempo restante', async () => {
    const agente = await ingresar(voluntario);
    const lista = await agente.get('/disponibles');

    expect(lista.status).toBe(200);
    expect(lista.text).toContain('Panadería · 20 unidades');
    expect(lista.text).toContain(puntos.urgente);
    expect(lista.text).toContain(`zona ${zonaPropia}`);
    expect(lista.text).toContain('Hora límite:');
    // Quedan ~90 min: se muestra como «1 h 30 min» (o «1 h 29 min» si pasó un instante).
    expect(lista.text).toMatch(/Quedan 1 h (29|30) min/);
  });

  test('CA-02.1 · están ordenadas de la más urgente a la menos urgente', async () => {
    const agente = await ingresar(voluntario);
    const lista = await agente.get('/disponibles');

    const posicionUrgente = lista.text.indexOf(puntos.urgente);
    const posicionTranquila = lista.text.indexOf(puntos.tranquila);
    expect(posicionUrgente).toBeGreaterThan(-1);
    expect(posicionTranquila).toBeGreaterThan(posicionUrgente);
  });

  test('CA-02.2 · una donación asignada, entregada o vencida no aparece en la lista', async () => {
    const agente = await ingresar(voluntario);
    const lista = await agente.get('/disponibles?zona=todas');

    expect(lista.text).not.toContain(puntos.asignada);
    expect(lista.text).not.toContain(puntos.entregada);
    expect(lista.text).not.toContain(puntos.vencida);
  });

  test('CA-02.3 · por defecto se muestran las donaciones de la zona del voluntario', async () => {
    const agente = await ingresar(voluntario);
    const lista = await agente.get('/disponibles');

    expect(lista.text).toContain(puntos.urgente);
    expect(lista.text).not.toContain(puntos.otraZona);
    expect(lista.text).toContain('Ver todas las zonas');
  });

  test('CA-02.3 · el voluntario puede cambiar a «Todas las zonas»', async () => {
    const agente = await ingresar(voluntario);
    const lista = await agente.get('/disponibles?zona=todas');

    expect(lista.text).toContain(puntos.urgente);
    expect(lista.text).toContain(puntos.otraZona);
    expect(lista.text).toContain('Ver solo mi zona');
  });

  test('CA-02.5 · si no hay donaciones disponibles se muestra «No hay donaciones disponibles en este momento»', async () => {
    const agente = await ingresar(voluntarioSinDonaciones);
    const lista = await agente.get('/disponibles');

    expect(lista.status).toBe(200);
    expect(lista.text).toContain('No hay donaciones disponibles en este momento');
  });

  test('Acceso · un donante no puede abrir la lista de donaciones disponibles', async () => {
    const agente = await ingresar(donante);
    const lista = await agente.get('/disponibles');
    expect(lista.status).toBe(403);
  });

  test('Acceso · sin sesión, la lista lleva a la pantalla de ingreso', async () => {
    const lista = await request(app).get('/disponibles');
    expect(lista.status).toBe(302);
    expect(lista.headers.location).toBe('/ingreso');
  });
});
