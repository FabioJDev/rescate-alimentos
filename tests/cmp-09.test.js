// CMP-09 · Administrar las zonas (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { listarZonasActivas } = require('../src/servicios/zonas');

const marca = `CMP09-${Date.now()}`;
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };

async function crearUsuario(usuario, rol, zona = null) {
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

async function zonaPorNombre(nombre) {
  const r = await consultar('SELECT * FROM zonas WHERE nombre = $1', [nombre]);
  return r.rows[0] || null;
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await crearUsuario(marcela, 'coordinadora');
  await crearUsuario(ana, 'voluntario', `Zona ${marca}`);
  coordinadora = await ingresar(marcela);
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-09 · Administrar las zonas', () => {
  test('CA-09.1 · la coordinadora ve cada zona con cuántos usuarios y organizaciones la usan', async () => {
    const nombre = `Zona uso ${marca}`;
    await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [nombre]);
    await crearUsuario({ nombre: `Usuario uso ${marca}`, pin: '1111' }, 'voluntario', nombre);
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 1', $2)", [`Org uso ${marca}`, nombre]);

    const res = await coordinadora.get('/zonas');
    expect(res.status).toBe(200);
    expect(res.text).toContain(nombre);
    const tarjeta = res.text.slice(res.text.indexOf(nombre));
    expect(tarjeta).toMatch(/Usuarios: 1 · Organizaciones: 1/);
  });

  test('CA-09.2 · al crear una zona queda activa y se puede elegir', async () => {
    const nombre = `Zona nueva ${marca}`;
    const res = await coordinadora.post('/zonas').type('form').send({ nombre: `  ${nombre}  ` });
    expect(res.status).toBe(302);

    const zona = await zonaPorNombre(nombre);
    expect(zona).not.toBeNull();
    expect(zona.activa).toBe(true);
    expect((await listarZonasActivas()).map((z) => z.nombre)).toContain(nombre);

    const lista = await coordinadora.get('/zonas');
    expect(lista.text).toContain(`Zona «${nombre}» creada.`);
  });

  test('CA-09.3 · nombre vacío o repetido (sin importar mayúsculas) se rechaza y no se crea nada', async () => {
    const vacio = await coordinadora.post('/zonas').type('form').send({ nombre: '   ' });
    expect(vacio.status).toBe(400);
    expect(vacio.text).toContain('Falta el nombre de la zona');

    const nombre = `Zona repetida ${marca}`;
    await coordinadora.post('/zonas').type('form').send({ nombre });
    const repetida = await coordinadora.post('/zonas').type('form').send({ nombre: nombre.toUpperCase() });
    expect(repetida.status).toBe(400);
    expect(repetida.text).toContain('Ya existe una zona con ese nombre');

    const r = await consultar('SELECT count(*)::int AS total FROM zonas WHERE lower(nombre) = lower($1)', [nombre]);
    expect(r.rows[0].total).toBe(1);
  });

  test('CA-09.4 · renombrar aplica el nombre nuevo a usuarios, organizaciones y donaciones', async () => {
    const viejo = `Zona vieja ${marca}`;
    const nuevo = `Zona renombrada ${marca}`;
    const zona = (await consultar('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [viejo])).rows[0];
    const beto = { nombre: `Beto ${marca}`, pin: '3333' };
    await crearUsuario(beto, 'voluntario', viejo);
    const donante = { nombre: `Donante ${marca}`, pin: '5555' };
    await crearUsuario(donante, 'donante', viejo);
    await consultar("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 2', $2)", [`Org vieja ${marca}`, viejo]);
    const donacion = (
      await consultar(
        `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id)
         VALUES ('Panadería', 5, 'kg', 'Calle 3', $1, now() + interval '2 hours', $2, $2) RETURNING codigo`,
        [viejo, donante.id]
      )
    ).rows[0];

    const res = await coordinadora.post(`/zonas/${zona.id}`).type('form').send({ nombre: nuevo });
    expect(res.status).toBe(302);

    expect((await consultar('SELECT zona FROM usuarios WHERE id = $1', [beto.id])).rows[0].zona).toBe(nuevo);
    expect((await consultar('SELECT zona FROM organizaciones WHERE nombre = $1', [`Org vieja ${marca}`])).rows[0].zona).toBe(nuevo);
    expect((await consultar('SELECT zona FROM donaciones WHERE codigo = $1', [donacion.codigo])).rows[0].zona).toBe(nuevo);

    // El voluntario sigue viendo por defecto las donaciones de su zona.
    const agenteBeto = await ingresar(beto);
    const disponibles = await agenteBeto.get('/disponibles');
    expect(disponibles.text).toContain(donacion.codigo);
  });

  test('CA-09.4 · renombrar con el nombre de otra zona se rechaza', async () => {
    const a = (await consultar('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [`Zona A ${marca}`])).rows[0];
    await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [`Zona B ${marca}`]);
    const res = await coordinadora.post(`/zonas/${a.id}`).type('form').send({ nombre: `zona b ${marca}` });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Ya existe una zona con ese nombre');
    expect((await consultar('SELECT nombre FROM zonas WHERE id = $1', [a.id])).rows[0].nombre).toBe(`Zona A ${marca}`);
  });

  test('CA-09.5 · una zona sin uso se desactiva, deja de elegirse y se puede reactivar', async () => {
    const nombre = `Zona libre ${marca}`;
    const zona = (await consultar('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [nombre])).rows[0];

    const res = await coordinadora.post(`/zonas/${zona.id}/desactivar`);
    expect(res.status).toBe(302);
    expect((await zonaPorNombre(nombre)).activa).toBe(false);
    expect((await listarZonasActivas()).map((z) => z.nombre)).not.toContain(nombre);

    await coordinadora.post(`/zonas/${zona.id}/activar`);
    expect((await zonaPorNombre(nombre)).activa).toBe(true);
  });

  test('CA-09.5 · una zona que alguien usa no se desactiva y se dice cuántos la usan', async () => {
    const nombre = `Zona ${marca}`; // la usa Ana
    const zona = (await consultar('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [nombre])).rows[0];

    const res = await coordinadora.post(`/zonas/${zona.id}/desactivar`);
    expect(res.status).toBe(409);
    expect(res.text).toContain('la usan 1 usuario(s) y 0 organización(es)');
    expect((await zonaPorNombre(nombre)).activa).toBe(true);
  });

  test('CA-09.6 · quien no es coordinadora no puede ver ni cambiar las zonas', async () => {
    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/zonas')).status).toBe(403);
    const nombre = `Zona prohibida ${marca}`;
    expect((await agenteAna.post('/zonas').type('form').send({ nombre })).status).toBe(403);
    expect(await zonaPorNombre(nombre)).toBeNull();

    const sinSesion = await request(app).get('/zonas');
    expect(sinSesion.status).toBe(302);
    expect(sinSesion.headers.location).toBe('/ingreso');
  });

  test('CA-09.7 · la migración pone en la lista las zonas ya escritas, sin cambiar los datos', async () => {
    // Se vuelve a ejecutar la parte de la migración que copia las zonas, dentro de una transacción que se deshace.
    const sql = fs.readFileSync(path.join(__dirname, '../src/db/migraciones/005_zonas.sql'), 'utf8');
    const copiarZonas = sql.slice(sql.indexOf('INSERT INTO zonas'));

    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const hash = await bcrypt.hash('1111', 4);
      await cliente.query("INSERT INTO usuarios (nombre, rol, pin_hash, zona) VALUES ($1, 'voluntario', $2, $3)", [
        `Migrado ${marca}`,
        hash,
        `  Zona migrada ${marca} `,
      ]);
      await cliente.query("INSERT INTO organizaciones (nombre, direccion, zona) VALUES ($1, 'Calle 9', $2)", [
        `Org migrada ${marca}`,
        `Zona org migrada ${marca}`,
      ]);
      await cliente.query(copiarZonas);

      const zonas = (await cliente.query('SELECT nombre FROM zonas')).rows.map((z) => z.nombre);
      expect(zonas).toContain(`Zona migrada ${marca}`);
      expect(zonas).toContain(`Zona org migrada ${marca}`);
      const usuario = (await cliente.query('SELECT zona FROM usuarios WHERE nombre = $1', [`Migrado ${marca}`])).rows[0];
      expect(usuario.zona).toBe(`  Zona migrada ${marca} `);
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });
});
