// Arma la aplicación Express. Se exporta sin arrancar el servidor para poder probarla con Supertest.
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { pool } = require('./db/conexion');
const { requerirSesion } = require('./middleware/autenticacion');
const rutasAutenticacion = require('./rutas/autenticacion');
const rutasDonaciones = require('./rutas/donaciones');
const rutasDisponibles = require('./rutas/disponibles');
const rutasTomar = require('./rutas/tomar');
const rutasConsulta = require('./rutas/consulta');

const app = express();
const enProduccion = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('Falta la variable de entorno SESSION_SECRET (ver .env.example).');
}

// Render pone un proxy delante: hay que confiar en él para que la cookie «secure» funcione.
if (enProduccion) app.set('trust proxy', 1);

// Las páginas se generan en el servidor con EJS (alternativa B: liviano para redes 3G).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'publico')));

// Sesión guardada en la base de datos (ADR-003): un reinicio del servidor no saca a nadie.
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: 'session',
      // En las pruebas se apaga la limpieza automática para que Jest pueda terminar.
      pruneSessionInterval: process.env.NODE_ENV === 'test' ? false : 60 * 15,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: enProduccion,
      maxAge: 1000 * 60 * 60 * 12, // 12 horas: cubre un turno de voluntariado
    },
  })
);

// Ruta de salud: sirve para comprobar que el servidor está arriba (también en Render).
app.get('/salud', (req, res) => {
  res.json({ estado: 'ok' });
});

app.use(rutasAutenticacion);
app.use(rutasDonaciones);
app.use(rutasDisponibles);
app.use(rutasTomar);
app.use(rutasConsulta);

// Pantalla de inicio: por ahora solo saluda; cada comportamiento agrega aquí su enlace.
app.get('/', requerirSesion, (req, res) => {
  res.render('inicio', { usuario: req.session.usuario });
});

// Errores no previstos: se muestran en español y no se filtra información interna.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', {
    titulo: 'Algo salió mal',
    mensaje: 'Intenta de nuevo en un momento.',
  });
});

module.exports = app;
