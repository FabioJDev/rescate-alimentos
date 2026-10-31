// CMP-08 · Registrar una donación sin conexión (docs/spec/comportamientos.md, ADR-004).
// Cada prueba empieza con su ID de CA. Dos partes: el servidor (Supertest) y la cola que vive en el teléfono
// (src/publico/sin-conexion.js), que se prueba con un almacén y un «servidor» simulados y también contra el real.
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool, consultar } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { crearCola, CLAVE } = require('../src/publico/sin-conexion');

const marca = `CMP08-${Date.now()}`;
const zona = `Zona-${marca}`;

const donante = { nombre: `Donante ${marca}`, pin: '1111', direccion: `Calle ${marca}` };
const otroDonante = { nombre: `Otro ${marca}`, pin: '5555', direccion: `Carrera ${marca}` };
const ana = { nombre: `Ana ${marca}`, pin: '2222' };
const marcela = { nombre: `Marcela ${marca}`, pin: '4444' };

async function crearUsuario(usuario, rol) {
  const hash = await bcrypt.hash(usuario.pin, 4);
  const r = await consultar(
    'INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [usuario.nombre, rol, hash, zona, usuario.direccion || null]
  );
  usuario.id = r.rows[0].id;
}

async function ingresar(usuario) {
  const agente = request.agent(app);
  await agente.post('/ingreso').type('form').send({ nombre: usuario.nombre, pin: usuario.pin });
  return agente;
}

// Hora límite dentro de `horas` horas, como la manda el formulario («AAAA-MM-DDTHH:mm», hora de Colombia).
function horaLimite(horas) {
  return new Date(Date.now() + horas * 3600000 - 5 * 3600000).toISOString().slice(0, 16);
}

let contador = 0;
function pendiente(cambios = {}) {
  contador++;
  return {
    id_local: `${marca}-${contador}-${Math.random().toString(16).slice(2, 10)}`,
    usuario_id: donante.id,
    capturada_en: new Date().toISOString(),
    tipo_alimento: 'Panadería',
    cantidad: '12',
    unidad: 'unidades',
    punto_recogida: donante.direccion,
    hora_limite: horaLimite(3),
    ...cambios,
  };
}

const filasDe = async (idLocal) =>
  (await consultar('SELECT * FROM donaciones WHERE id_local = $1', [idLocal])).rows;

// Almacén que se comporta como localStorage, para probar la cola sin navegador.
function almacenFalso() {
  const datos = {};
  return {
    getItem: (clave) => (clave in datos ? datos[clave] : null),
    setItem: (clave, valor) => {
      datos[clave] = String(valor);
    },
  };
}

const campos = (extra = {}) => ({
  tipo_alimento: 'Lácteos',
  cantidad: '8',
  unidad: 'cajas',
  punto_recogida: 'Calle 1',
  hora_limite: horaLimite(2),
  donante_id: '',
  ...extra,
});

beforeAll(async () => {
  await migrar();
  await crearUsuario(donante, 'donante');
  await crearUsuario(otroDonante, 'donante');
  await crearUsuario(ana, 'voluntario');
  await crearUsuario(marcela, 'coordinadora');
});

afterAll(async () => {
  await pool.end();
});

describe('CMP-08 · Registrar una donación sin conexión · servidor', () => {
  test('CA-08.2 · la donación pendiente se registra «disponible» a nombre de su autor, con código y fecha del servidor', async () => {
    const agente = await ingresar(donante);
    const datos = pendiente({ capturada_en: new Date(Date.now() - 20 * 60000).toISOString() });

    const respuesta = await agente.post('/api/donaciones/sincronizar').send(datos);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ estado: 'registrada', repetida: false });
    expect(respuesta.body.codigo).toMatch(/^D-\d{4,}$/);

    const [fila] = await filasDe(datos.id_local);
    expect(fila.codigo).toBe(respuesta.body.codigo);
    expect(fila.estado).toBe('disponible');
    expect(fila.donante_id).toBe(donante.id);
    expect(fila.registrada_por_id).toBe(donante.id);
    // La fecha de registro la pone el servidor al sincronizar, no el reloj del teléfono.
    expect(Date.now() - new Date(fila.creada_en).getTime()).toBeLessThan(60000);

    // El historial deja anotado que se guardó sin conexión.
    const movimiento = (await consultar("SELECT detalle FROM movimientos WHERE donacion_id = $1 AND tipo = 'registro'", [fila.id])).rows[0];
    expect(movimiento.detalle).toContain('Guardada sin conexión');

    // Se ve en la lista de disponibles y en su detalle (CA-02.1, CA-05.1).
    const detalle = await agente.get(`/donaciones/${fila.codigo}`);
    expect(detalle.status).toBe(200);
    expect(detalle.text).toContain(`Registrada por ${donante.nombre}`);

    // La coordinadora también puede: queda a nombre del comercio y registrada por ella (CA-01.5).
    const agenteMarcela = await ingresar(marcela);
    const porComercio = pendiente({ usuario_id: marcela.id, donante_id: String(otroDonante.id), punto_recogida: '' });
    const r2 = await agenteMarcela.post('/api/donaciones/sincronizar').send(porComercio);
    expect(r2.status).toBe(201);
    const [fila2] = await filasDe(porComercio.id_local);
    expect(fila2.donante_id).toBe(otroDonante.id);
    expect(fila2.registrada_por_id).toBe(marcela.id);
    expect(fila2.punto_recogida).toBe(otroDonante.direccion);
  });

  test('CA-08.3 · enviar la misma donación varias veces, incluso a la vez, la registra una sola vez', async () => {
    const agente = await ingresar(donante);
    const datos = pendiente();

    const primera = await agente.post('/api/donaciones/sincronizar').send(datos);
    const segunda = await agente.post('/api/donaciones/sincronizar').send(datos);
    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toMatchObject({ estado: 'registrada', repetida: true, codigo: primera.body.codigo });

    // Cinco envíos simultáneos (dos pestañas, mala señal): una sola fila.
    const otra = pendiente();
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => agente.post('/api/donaciones/sincronizar').send(otra)));
    expect(respuestas.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(respuestas.map((r) => r.body.codigo)).size).toBe(1);
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await filasDe(otra.id_local)).toHaveLength(1);

    // Aunque hayan pasado las horas, un reenvío de algo ya registrado no se rechaza como vencido.
    await consultar('UPDATE donaciones SET hora_limite = now() - interval \'1 hour\' WHERE id_local = $1', [datos.id_local]);
    const tarde = await agente.post('/api/donaciones/sincronizar').send(datos);
    expect(tarde.status).toBe(200);
    expect(tarde.body.repetida).toBe(true);
  });

  test('CA-08.4 · una pendiente inválida al sincronizar no se registra y dice cuál es el problema', async () => {
    const agente = await ingresar(donante);

    const vencida = pendiente({ hora_limite: horaLimite(-2) });
    const a = await agente.post('/api/donaciones/sincronizar').send(vencida);
    expect(a.status).toBe(422);
    expect(a.body.estado).toBe('invalida');
    expect(a.body.errores.hora_limite).toBe('La hora límite debe ser posterior a la hora actual');
    expect(await filasDe(vencida.id_local)).toHaveLength(0);

    const sinCantidad = pendiente({ cantidad: '0', tipo_alimento: '' });
    const b = await agente.post('/api/donaciones/sincronizar').send(sinCantidad);
    expect(b.status).toBe(422);
    expect(b.body.errores.cantidad).toBe('La cantidad debe ser mayor que cero.');
    expect(b.body.errores.tipo_alimento).toBe('Falta elegir el tipo de alimento.');
    expect(await filasDe(sinCantidad.id_local)).toHaveLength(0);

    // Un identificador mal formado tampoco entra.
    const c = await agente.post('/api/donaciones/sincronizar').send(pendiente({ id_local: 'x' }));
    expect(c.status).toBe(422);

    // Los números llegan como texto desde el teléfono; si llegan como número, no se rompe nada.
    const numerica = pendiente({ cantidad: 7 });
    expect((await agente.post('/api/donaciones/sincronizar').send(numerica)).status).toBe(201);
  });

  test('CA-08.5 · sin sesión o de otro usuario: no se registra y el teléfono la conserva', async () => {
    const datos = pendiente();

    const sinSesion = await request(app).post('/api/donaciones/sincronizar').send(datos);
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body.estado).toBe('sin_sesion');

    // Entró otra persona en ese teléfono: la donación del primero no se registra a nombre del segundo.
    const agenteOtro = await ingresar(otroDonante);
    const deOtro = await agenteOtro.post('/api/donaciones/sincronizar').send(datos);
    expect(deOtro.status).toBe(409);
    expect(deOtro.body.estado).toBe('otro_usuario');
    expect(await filasDe(datos.id_local)).toHaveLength(0);

    // /api/yo permite al teléfono saber con quién enviar.
    expect((await request(app).get('/api/yo')).status).toBe(401);
    expect((await agenteOtro.get('/api/yo')).body).toEqual({ id: otroDonante.id, rol: 'donante' });
  });

  test('CA-08.6 · sin conexión, las demás pantallas muestran «Sin conexión» y el service worker la guarda de antemano', async () => {
    const pantalla = await request(app).get('/sin-conexion');
    expect(pantalla.status).toBe(200);
    expect(pantalla.text).toContain('Sin conexión');
    expect(pantalla.text).toContain('publicar una donación');
    expect(pantalla.text).toContain('necesitan conexión');

    const sw = await request(app).get('/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers['content-type']).toContain('javascript');
    expect(sw.text).toContain("'/sin-conexion'");
    expect(sw.text).toContain("'/donaciones/nueva'");
    // Solo se interceptan lecturas: los envíos (POST) van siempre al servidor.
    expect(sw.text).toContain("peticion.method !== 'GET'");

    // La pantalla del formulario lleva lo que necesita el script del teléfono.
    const agente = await ingresar(donante);
    const formulario = await agente.get('/donaciones/nueva');
    expect(formulario.text).toContain('data-sin-conexion');
    expect(formulario.text).toContain(`data-usuario="${donante.id}"`);
  });

  test('CA-08.7 · quien no es donante ni coordinadora no puede sincronizar donaciones', async () => {
    const agente = await ingresar(ana);
    const datos = pendiente({ usuario_id: ana.id });
    const respuesta = await agente.post('/api/donaciones/sincronizar').send(datos);
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.estado).toBe('prohibido');
    expect(await filasDe(datos.id_local)).toHaveLength(0);
  });
});

describe('CMP-08 · Registrar una donación sin conexión · cola en el teléfono', () => {
  // Un «servidor» simulado: se le dice qué responder (o que no hay red).
  function servidor(respuestas) {
    const enviados = [];
    const enviar = (payload) => {
      enviados.push(payload);
      const siguiente = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
      if (siguiente === 'sin_red') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(siguiente);
    };
    return { enviar, enviados };
  }

  test('CA-08.1 · sin conexión la donación se guarda en el teléfono como pendiente y sigue ahí al cerrar y abrir', () => {
    const almacen = almacenFalso();
    const cola = crearCola({ almacen, enviar: () => Promise.reject(new Error('no se usa')) });

    const item = cola.guardar(donante.id, campos());
    expect(item.estado).toBe('pendiente');
    expect(item.id_local).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(cola.deUsuario(donante.id)).toHaveLength(1);

    // «Cerrar y abrir el navegador»: otra cola sobre el mismo almacén ve lo mismo.
    const alReabrir = crearCola({ almacen, enviar: () => Promise.reject(new Error('no se usa')) });
    expect(alReabrir.deUsuario(donante.id).map((i) => i.campos.cantidad)).toEqual(['8']);
    // Dos donaciones guardadas no comparten identificador.
    const otra = alReabrir.guardar(donante.id, campos());
    expect(otra.id_local).not.toBe(item.id_local);
    // Lo guardado se lee como lista aunque el almacén tenga basura.
    almacen.setItem(CLAVE, 'no es json');
    expect(crearCola({ almacen, enviar: () => null }).todas()).toEqual([]);
  });

  test('CA-08.2 · al volver la conexión se envía sola y el aviso de pendiente desaparece', async () => {
    const { enviar, enviados } = servidor([{ status: 201, cuerpo: { estado: 'registrada', codigo: 'D-0042' } }]);
    const cola = crearCola({ almacen: almacenFalso(), enviar });
    cola.guardar(donante.id, campos());

    const resultado = await cola.sincronizar(donante.id);
    expect(resultado.registradas).toEqual(['D-0042']);
    expect(cola.deUsuario(donante.id)).toHaveLength(0);
    // Mandó lo guardado, con su identificador, su usuario y la hora en que se guardó.
    expect(enviados[0]).toMatchObject({ tipo_alimento: 'Lácteos', cantidad: '8', usuario_id: donante.id });
    expect(enviados[0].id_local).toBeTruthy();
    expect(enviados[0].capturada_en).toBeTruthy();
  });

  test('CA-08.3 · un reintento por mala señal reenvía lo mismo con el mismo identificador y una sola vez en la cola', async () => {
    const { enviar, enviados } = servidor(['sin_red', { status: 200, cuerpo: { estado: 'registrada', codigo: 'D-0043', repetida: true } }]);
    const cola = crearCola({ almacen: almacenFalso(), enviar });
    cola.guardar(donante.id, campos());

    const primero = await cola.sincronizar(donante.id);
    expect(primero.sinRed).toBe(true);
    expect(cola.deUsuario(donante.id)).toHaveLength(1); // no se pierde

    const segundo = await cola.sincronizar(donante.id);
    expect(segundo.registradas).toEqual(['D-0043']);
    expect(cola.deUsuario(donante.id)).toHaveLength(0);
    expect(enviados[0].id_local).toBe(enviados[1].id_local);

    // Dos envíos a la vez en la misma pestaña comparten el mismo intento.
    const { enviar: enviar2, enviados: enviados2 } = servidor([{ status: 201, cuerpo: { codigo: 'D-0044' } }]);
    const cola2 = crearCola({ almacen: almacenFalso(), enviar: enviar2 });
    cola2.guardar(donante.id, campos());
    const [x, y] = await Promise.all([cola2.sincronizar(donante.id), cola2.sincronizar(donante.id)]);
    expect(enviados2).toHaveLength(1);
    expect(x).toBe(y);
  });

  test('CA-08.4 · una pendiente rechazada queda visible con su motivo hasta que se descarta', async () => {
    const errores = { hora_limite: 'La hora límite debe ser posterior a la hora actual' };
    const { enviar } = servidor([{ status: 422, cuerpo: { estado: 'invalida', errores } }]);
    const cola = crearCola({ almacen: almacenFalso(), enviar });
    const item = cola.guardar(donante.id, campos());

    const resultado = await cola.sincronizar(donante.id);
    expect(resultado.rechazadas).toBe(1);
    expect(resultado.registradas).toEqual([]);
    const [guardada] = cola.deUsuario(donante.id);
    expect(guardada.estado).toBe('rechazada');
    expect(guardada.errores).toEqual(errores);

    // No se vuelve a enviar sola mientras está rechazada.
    const otraVez = await cola.sincronizar(donante.id);
    expect(otraVez.registradas).toEqual([]);

    cola.descartar(item.id_local);
    expect(cola.deUsuario(donante.id)).toHaveLength(0);
  });

  test('CA-08.5 · sin sesión o de otro usuario, la pendiente se conserva y no se envía lo de otra persona', async () => {
    const { enviar: sinSesion } = servidor([{ status: 401, cuerpo: { estado: 'sin_sesion' } }]);
    const cola = crearCola({ almacen: almacenFalso(), enviar: sinSesion });
    cola.guardar(donante.id, campos());
    const a = await cola.sincronizar(donante.id);
    expect(a.sinSesion).toBe(true);
    expect(cola.deUsuario(donante.id)).toHaveLength(1);

    const { enviar: deOtro } = servidor([{ status: 409, cuerpo: { estado: 'otro_usuario' } }]);
    const cola2 = crearCola({ almacen: almacenFalso(), enviar: deOtro });
    cola2.guardar(donante.id, campos());
    const b = await cola2.sincronizar(donante.id);
    expect(b.otroUsuario).toBe(true);
    expect(cola2.deUsuario(donante.id)).toHaveLength(1);

    // La cola de otra persona ni siquiera se intenta enviar.
    const { enviar: espia, enviados } = servidor([{ status: 201, cuerpo: { codigo: 'D-0045' } }]);
    const cola3 = crearCola({ almacen: almacenFalso(), enviar: espia });
    cola3.guardar(donante.id, campos());
    await cola3.sincronizar(otroDonante.id);
    expect(enviados).toHaveLength(0);
    expect(cola3.deUsuario(donante.id)).toHaveLength(1);
  });

  test('CA-08.1 y CA-08.2 · de punta a punta contra el servidor real: tres guardadas sin conexión se registran una sola vez', async () => {
    const agente = await ingresar(donante);
    const enviar = (payload) => agente.post('/api/donaciones/sincronizar').send(payload).then((r) => ({ status: r.status, cuerpo: r.body }));

    const almacen = almacenFalso();
    const cola = crearCola({ almacen, enviar });
    const guardadas = [
      cola.guardar(donante.id, campos({ cantidad: '1', punto_recogida: donante.direccion })),
      cola.guardar(donante.id, campos({ cantidad: '2', punto_recogida: donante.direccion })),
      cola.guardar(donante.id, campos({ cantidad: '3', punto_recogida: donante.direccion, hora_limite: horaLimite(-1) })), // se vence antes de enviar
    ];

    const resultado = await cola.sincronizar(donante.id);
    expect(resultado.registradas).toHaveLength(2);
    expect(resultado.rechazadas).toBe(1);
    expect((await filasDe(guardadas[0].id_local))[0].estado).toBe('disponible');
    expect(await filasDe(guardadas[2].id_local)).toHaveLength(0);

    // Una segunda pestaña que todavía tenía las mismas pendientes las reenvía: no se duplica nada.
    const segundaPestana = crearCola({ almacen: almacenFalso(), enviar });
    segundaPestana.guardar(donante.id, campos());
    const reenvio = segundaPestana.deUsuario(donante.id)[0];
    await segundaPestana.sincronizar(donante.id);
    await agente.post('/api/donaciones/sincronizar').send({ ...campos(), id_local: reenvio.id_local, usuario_id: donante.id });
    expect(await filasDe(reenvio.id_local)).toHaveLength(1);
  });
});

describe('CMP-08 · Pantalla guardada al salir (ADR-004)', () => {
  test('ADR-004 · al salir se borra la pantalla guardada de cualquier versión del service worker', () => {
    const fs = require('fs');
    const path = require('path');
    const script = fs.readFileSync(path.join(__dirname, '../src/publico/sin-conexion.js'), 'utf8');
    // Si el nombre llevara la versión fija («rescate-paginas-v1»), dejaría de borrarse al subir la VERSION de sw.js
    // y en un celular compartido la siguiente persona vería la pantalla de la anterior.
    expect(script).not.toMatch(/rescate-paginas-v\d/);
    expect(script).toContain("indexOf('rescate-paginas-') === 0");
  });
});
