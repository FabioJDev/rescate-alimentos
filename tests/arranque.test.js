// T-ADM.3 · Arranque seguro en producción (docs/spec/plan-tecnico.md, sección 5).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/conexion');
const { migrar } = require('../src/db/migrar');
const { crearPrimeraCoordinadora } = require('../src/db/primera-coordinadora');
const { sembrar } = require('../src/db/semilla');

const marca = `ARRANQUE-${Date.now()}`;

beforeAll(async () => {
  await migrar();
});

afterAll(async () => {
  await pool.end();
});

// Las pruebas que necesitan «ninguna coordinadora activa» desactivan todas dentro de una transacción que se deshace.
async function sinCoordinadoras(prueba) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("UPDATE usuarios SET activo = FALSE WHERE rol = 'coordinadora'");
    await prueba(cliente);
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
}

describe('T-ADM.3 · Arranque seguro en producción', () => {
  test('sin coordinadora activa, crea la primera con PIN temporal que debe cambiar', async () => {
    await sinCoordinadoras(async (cliente) => {
      const nombre = `Primera ${marca}`;
      const r = await crearPrimeraCoordinadora({ nombre, pin: '8642', cliente });
      expect(r.creada).toBe(true);

      const u = (await cliente.query('SELECT * FROM usuarios WHERE nombre = $1', [nombre])).rows[0];
      expect(u.rol).toBe('coordinadora');
      expect(u.activo).toBe(true);
      expect(u.debe_cambiar_pin).toBe(true);
      expect(await bcrypt.compare('8642', u.pin_hash)).toBe(true);
    });
  });

  test('sin las variables, no crea nada y explica qué falta', async () => {
    await sinCoordinadoras(async (cliente) => {
      const r = await crearPrimeraCoordinadora({ nombre: '', pin: '12', cliente });
      expect(r.creada).toBe(false);
      expect(r.motivo).toContain('PRIMERA_COORDINADORA_NOMBRE');
    });
  });

  test('si ya hay una coordinadora activa, no cambia nada', async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const hash = await bcrypt.hash('1111', 4);
      await cliente.query("INSERT INTO usuarios (nombre, rol, pin_hash) VALUES ($1, 'coordinadora', $2)", [`Existente ${marca}`, hash]);
      const r = await crearPrimeraCoordinadora({ nombre: `Otra ${marca}`, pin: '2468', cliente });
      expect(r.creada).toBe(false);
      const otra = await cliente.query('SELECT 1 FROM usuarios WHERE nombre = $1', [`Otra ${marca}`]);
      expect(otra.rows).toHaveLength(0);
    } finally {
      await cliente.query('ROLLBACK');
      cliente.release();
    }
  });

  test('la semilla de demostración se niega a correr en producción', async () => {
    const antes = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(sembrar({ reiniciar: true })).rejects.toThrow('no se carga en producción');
    } finally {
      process.env.NODE_ENV = antes;
    }
  });

  test('Render ya no carga la semilla al arrancar', () => {
    const render = fs.readFileSync(path.join(__dirname, '../render.yaml'), 'utf8');
    const arranque = /startCommand: (.+)/.exec(render)[1];
    expect(arranque).not.toContain('db:semilla');
    expect(arranque).toContain('db:primera-coordinadora');
  });
});
