// CMP-25 · Registro de las acciones de administración (docs/spec/comportamientos.md).
// Cada prueba empieza con su ID de CA. Los datos llevan una marca única por ejecución.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');

const marca = `CMP25-${Date.now()}`;
const zona = `Zona ${marca}`;
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };

async function crearUsuario(usuario, rol, zonaUsuario = null) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar('INSERT INTO usuarios (nombre, rol, pin_hash, zona, telefono) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
    usuario.nombre,
    rol,
    hash,
    zonaUsuario,
    '3001234567',
  ]);
  usuario.id = r.rows[0].id;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

// Las acciones de esta ejecución cuyo detalle menciona un texto (el registro lo comparten todas las pruebas).
async function registrosCon(texto) {
  const r = await consultar(
    `SELECT ra.accion, ra.detalle, u.nombre AS quien
       FROM registro_administracion ra JOIN usuarios u ON u.id = ra.usuario_id
      WHERE ra.detalle LIKE '%' || $1 || '%' AND ra.detalle LIKE '%' || $2 || '%'
      ORDER BY ra.id`,
    [texto, marca]
  );
  return r.rows;
}

let coordinadora;

beforeAll(async () => {
  await migrar();
  await consultar('INSERT INTO zonas (nombre) VALUES ($1)', [zona]);
  await crearUsuario(marcela, 'coordinadora');
  await crearUsuario(ana, 'voluntario', zona);
  coordinadora = await ingresar(marcela);
});

beforeEach(async () => {
  await consultar("DELETE FROM intentos_ingreso WHERE clave LIKE 'solicitud:%'");
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-25 · Registro de las acciones de administración', () => {
  test('CA-25.1 · crear, editar, desactivar, reactivar y restablecer el PIN de un usuario queda registrado', async () => {
    const nombre = `Bruno ${marca}`;
    const creado = await coordinadora.post('/usuarios').type('form').send({ nombre, rol: 'voluntario', telefono: '3005556666', zona });
    expect(creado.status).toBe(201);
    const pinTemporal = /class="pin-temporal">(\d{4})</.exec(creado.text)[1];
    const id = (await consultar('SELECT id FROM usuarios WHERE nombre = $1', [nombre])).rows[0].id;

    const nuevoNombre = `Bruno Pérez ${marca}`;
    await coordinadora.post(`/usuarios/${id}`).type('form').send({ nombre: nuevoNombre, rol: 'voluntario', telefono: '3005556666', zona });
    await coordinadora.post(`/usuarios/${id}/desactivar`);
    await coordinadora.post(`/usuarios/${id}/activar`);
    const restablecido = await coordinadora.post(`/usuarios/${id}/restablecer-pin`);
    const pinNuevo = /class="pin-temporal">(\d{4})</.exec(restablecido.text)[1];

    const deEstaPrueba = await registrosCon('Bruno');
    expect(deEstaPrueba.map((r) => r.accion)).toEqual([
      'Crear usuario',
      'Editar usuario',
      'Desactivar usuario',
      'Reactivar usuario',
      'Restablecer PIN',
    ]);
    expect(deEstaPrueba[0].detalle).toBe(`Creó el usuario «${nombre}» (Voluntario).`);
    expect(deEstaPrueba[1].detalle).toBe(`Editó los datos de «${nuevoNombre}» (antes «${nombre}»).`);
    for (const r of deEstaPrueba) {
      expect(r.quien).toBe(marcela.nombre);
      // El PIN nunca se guarda en el registro (se quita la marca, que tiene dígitos y podría contenerlo por azar).
      const sinMarca = r.detalle.split(marca).join('');
      expect(sinMarca).not.toContain(pinTemporal);
      expect(sinMarca).not.toContain(pinNuevo);
    }
  });

  test('CA-25.2 · crear, renombrar y desactivar una zona, y crear y desactivar una organización quedan registrados', async () => {
    const zonaNueva = `Ladera ${marca}`;
    await coordinadora.post('/zonas').type('form').send({ nombre: zonaNueva });
    const idZona = (await consultar('SELECT id FROM zonas WHERE nombre = $1', [zonaNueva])).rows[0].id;
    const renombrada = `Ladera Alta ${marca}`;
    await coordinadora.post(`/zonas/${idZona}`).type('form').send({ nombre: renombrada });
    await coordinadora.post(`/zonas/${idZona}/desactivar`);

    const organizacion = `Comedor ${marca}`;
    await coordinadora
      .post('/organizaciones')
      .type('form')
      .send({ nombre: organizacion, direccion: 'Calle 1', zona, refrigeracion: 'no', telefono: '' });
    const idOrg = (await consultar('SELECT id FROM organizaciones WHERE nombre = $1', [organizacion])).rows[0].id;
    await coordinadora.post(`/organizaciones/${idOrg}/desactivar`);

    const zonas = await registrosCon(`Ladera`);
    expect(zonas.map((r) => r.accion)).toEqual(['Crear zona', 'Renombrar zona', 'Desactivar zona']);
    expect(zonas[1].detalle).toBe(`Cambió el nombre de la zona «${zonaNueva}» a «${renombrada}».`);

    const organizaciones = await registrosCon(organizacion);
    expect(organizaciones.map((r) => r.accion)).toEqual(['Crear organización', 'Desactivar organización']);
  });

  test('CA-25.3 · aprobar y rechazar una solicitud de acceso queda registrado, con el motivo', async () => {
    const aprobada = `Solicitante aprobada ${marca}`;
    const rechazada = `Solicitante rechazada ${marca}`;
    for (const nombre of [aprobada, rechazada]) {
      await request(app).post('/solicitar-acceso').type('form').send({ nombre, telefono: '3007778888', rol: 'voluntario', zona });
    }
    const idDe = async (nombre) => (await consultar('SELECT id FROM solicitudes_acceso WHERE nombre = $1', [nombre])).rows[0].id;
    await coordinadora.post(`/solicitudes/${await idDe(aprobada)}/aprobar`);
    await coordinadora.post(`/solicitudes/${await idDe(rechazada)}/rechazar`).type('form').send({ motivo: 'No vive en una zona atendida' });

    const [aprobacion] = await registrosCon(aprobada);
    expect(aprobacion.accion).toBe('Aprobar solicitud');
    expect(aprobacion.detalle).toContain('creó su usuario (Voluntario)');
    const [rechazo] = await registrosCon(rechazada);
    expect(rechazo.accion).toBe('Rechazar solicitud');
    expect(rechazo.detalle).toContain('Motivo: No vive en una zona atendida');
  });

  test('CA-25.4 · una acción que no se completa no se registra', async () => {
    // Nombre repetido al crear, y desactivar a un voluntario con una donación asignada.
    await coordinadora.post('/usuarios').type('form').send({ nombre: ana.nombre, rol: 'voluntario', telefono: '3001112222', zona });
    const donante = (await consultar("INSERT INTO usuarios (nombre, rol, pin_hash) VALUES ($1, 'donante', 'x') RETURNING id", [`Donante ${marca}`])).rows[0].id;
    await consultar(
      `INSERT INTO donaciones (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, estado, donante_id,
                               registrada_por_id, voluntario_id, tomada_en)
       VALUES ('Panadería', 1, 'kg', 'Calle 1', $1, now() + interval '2 hours', 'asignada', $2, $2, $3, now())`,
      [zona, donante, ana.id]
    );
    const desactivar = await coordinadora.post(`/usuarios/${ana.id}/desactivar`);
    expect(desactivar.status).toBe(409);

    expect(await registrosCon(ana.nombre)).toEqual([]);
  });

  test('CA-25.5 · «Registro de cambios» muestra las acciones, la más reciente primero, con quién y cuándo', async () => {
    const primera = `Zona primera ${marca}`;
    const segunda = `Zona segunda ${marca}`;
    await coordinadora.post('/zonas').type('form').send({ nombre: primera });
    await coordinadora.post('/zonas').type('form').send({ nombre: segunda });

    const pagina = await coordinadora.get('/registro-cambios');
    expect(pagina.status).toBe(200);
    expect(pagina.text).toContain(`Creó la zona «${segunda}».`);
    expect(pagina.text).toContain(`Por ${marcela.nombre}, el`);
    expect(pagina.text.indexOf(segunda)).toBeLessThan(pagina.text.indexOf(primera));

    const inicio = await coordinadora.get('/');
    expect(inicio.text).toContain('href="/registro-cambios"');
  });

  test('CA-25.6 · quien no es coordinadora no puede abrir «Registro de cambios»', async () => {
    const agenteAna = await ingresar(ana);
    expect((await agenteAna.get('/registro-cambios')).status).toBe(403);
    expect((await request(app).get('/registro-cambios')).headers.location).toBe('/ingreso');
  });
});
