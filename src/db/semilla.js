// Carga los datos de prueba para la demostración (ver README: los PIN son solo para demostración).
//   npm run db:semilla                 → carga los datos; se niega si ya hay usuarios (protege datos reales)
//   npm run db:semilla -- --reiniciar  → BORRA todo y vuelve a cargar (para repetir la demostración)
const bcrypt = require('bcryptjs');
const { pool } = require('./conexion');

// Los teléfonos son inventados (CMP-15): sirven para ver en la demostración el enlace para llamar.
const usuarios = [
  { nombre: 'Marcela', rol: 'coordinadora', pin: '0000', zona: null, direccion: null, telefono: '300 000 0000' },
  { nombre: 'Ana', rol: 'voluntario', pin: '1111', zona: 'Norte', direccion: null, telefono: '300 000 0001' },
  { nombre: 'Bruno', rol: 'voluntario', pin: '2222', zona: 'Norte', direccion: null, telefono: '300 000 0002' },
  { nombre: 'Carlos', rol: 'voluntario', pin: '3333', zona: 'Sur', direccion: null, telefono: '300 000 0003' },
  { nombre: 'Panadería La Espiga', rol: 'donante', pin: '4444', zona: 'Norte', direccion: 'Calle 10 # 5-20, Norte', telefono: '600 000 0004' },
  { nombre: 'Plaza de Mercado Puesto 12', rol: 'donante', pin: '5555', zona: 'Sur', direccion: 'Plaza de Mercado, puesto 12, Sur', telefono: '600 000 0005' },
];

const organizaciones = [
  { nombre: 'Comedor Esperanza', direccion: 'Carrera 8 # 12-30, Norte', zona: 'Norte', refrigeracion: true },
  { nombre: 'Hogar de Paso San José', direccion: 'Calle 40 # 20-15, Sur', zona: 'Sur', refrigeracion: false },
  { nombre: 'Fundación Techo Amigo', direccion: 'Avenida 3 # 25-10, Norte', zona: 'Norte', refrigeracion: true },
];

// Tres donaciones disponibles, con horas límite futuras respecto al momento de cargar la semilla.
const donaciones = [
  { donante: 'Panadería La Espiga', tipo: 'Panadería', cantidad: 20, unidad: 'unidades', horas: 2 },
  { donante: 'Plaza de Mercado Puesto 12', tipo: 'Frutas y verduras', cantidad: 40, unidad: 'kg', horas: 3 },
  { donante: 'Panadería La Espiga', tipo: 'Comida preparada', cantidad: 15, unidad: 'cajas', horas: 4 },
];

async function sembrar({ reiniciar = false } = {}) {
  // T-ADM.3: los PIN de la semilla son públicos (están en el README). En producción nunca se cargan.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La semilla de demostración no se carga en producción: sus PIN son públicos. Usa la primera coordinadora (README).');
  }
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows } = await cliente.query('SELECT count(*)::int AS total FROM usuarios');
    if (rows[0].total > 0 && !reiniciar) {
      throw new Error('Ya hay usuarios en la base de datos. Usa --reiniciar si de verdad quieres borrar todo y cargar la semilla.');
    }
    if (reiniciar) {
      await cliente.query('TRUNCATE movimientos, donaciones, organizaciones, usuarios, zonas RESTART IDENTITY CASCADE');
      await cliente.query('ALTER SEQUENCE secuencia_codigo_donacion RESTART WITH 1');
    }

    // CMP-09: las zonas de la demostración tienen que estar en la lista para poder elegirlas en los formularios.
    const zonas = [...new Set([...usuarios, ...organizaciones].map((x) => x.zona).filter(Boolean))];
    for (const zona of zonas) {
      await cliente.query('INSERT INTO zonas (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [zona]);
    }

    const idUsuario = {};
    for (const u of usuarios) {
      const pinHash = await bcrypt.hash(u.pin, 10);
      const r = await cliente.query(
        'INSERT INTO usuarios (nombre, rol, pin_hash, zona, direccion, telefono) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [u.nombre, u.rol, pinHash, u.zona, u.direccion, u.telefono]
      );
      idUsuario[u.nombre] = r.rows[0].id;
    }

    for (const o of organizaciones) {
      await cliente.query(
        'INSERT INTO organizaciones (nombre, direccion, zona, refrigeracion) VALUES ($1, $2, $3, $4)',
        [o.nombre, o.direccion, o.zona, o.refrigeracion]
      );
    }

    for (const d of donaciones) {
      const donante = usuarios.find((u) => u.nombre === d.donante);
      const r = await cliente.query(
        `INSERT INTO donaciones
           (tipo_alimento, cantidad, unidad, punto_recogida, zona, hora_limite, donante_id, registrada_por_id)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6), $7, $7)
         RETURNING id`,
        [d.tipo, d.cantidad, d.unidad, donante.direccion, donante.zona, d.horas, idUsuario[d.donante]]
      );
      // Cada donación nace con su movimiento de registro (trazabilidad, RNF-05).
      await cliente.query(
        "INSERT INTO movimientos (donacion_id, tipo, usuario_id, detalle) VALUES ($1, 'registro', $2, 'Donación de la semilla de demostración')",
        [r.rows[0].id, idUsuario[d.donante]]
      );
    }

    await cliente.query('COMMIT');
    return { usuarios: usuarios.length, organizaciones: organizaciones.length, donaciones: donaciones.length };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { sembrar };

if (require.main === module) {
  sembrar({ reiniciar: process.argv.includes('--reiniciar') })
    .then((r) => {
      console.log(`Semilla cargada: ${r.usuarios} usuarios, ${r.organizaciones} organizaciones, ${r.donaciones} donaciones.`);
      return pool.end();
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
