const request = require('supertest');
const app = require('../src/app');

// Prueba de humo del proyecto base (T-00.1): no corresponde a un criterio de aceptación de un CMP.
test('Salud · la ruta /salud responde que el servidor está arriba', async () => {
  const respuesta = await request(app).get('/salud');

  expect(respuesta.status).toBe(200);
  expect(respuesta.body).toEqual({ estado: 'ok' });
});
