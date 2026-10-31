// Arma la aplicación Express. Se exporta sin arrancar el servidor para poder probarla con Supertest.
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const { pool } = require('./db/conexion');
const { requerirSesion } = require('./middleware/autenticacion');
const { cabeceras, verificarOrigen } = require('./middleware/seguridad');
const { manejarError } = require('./middleware/errores');
const rutasAutenticacion = require('./rutas/autenticacion');
const rutasDonaciones = require('./rutas/donaciones');
const rutasDisponibles = require('./rutas/disponibles');
const rutasTomar = require('./rutas/tomar');
const rutasConsulta = require('./rutas/consulta');
const rutasListas = require('./rutas/listas');
const rutasEntregar = require('./rutas/entregar');
const rutasSincronizar = require('./rutas/sincronizar');
const rutasReporte = require('./rutas/reporte');
const rutasSoltar = require('./rutas/soltar');
const rutasZonas = require('./rutas/zonas');
const rutasUsuarios = require('./rutas/usuarios');
const rutasPin = require('./rutas/pin');
const rutasOrganizaciones = require('./rutas/organizaciones');
const rutasCorrecciones = require('./rutas/correcciones');
const rutasIntervenciones = require('./rutas/intervenciones');
const rutasPrivacidad = require('./rutas/privacidad');
const rutasRecepcion = require('./rutas/recepcion');
const rutasAtenciones = require('./rutas/atenciones');

const app = express();
const enProduccion = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  throw new Error('Falta la variable de entorno SESSION_SECRET (ver .env.example).');
}

// Render pone un proxy delante: hay que confiar en él para que la cookie «secure» funcione y para saber la dirección
// real de quien entra (CMP-16 cuenta los intentos por origen). Se confía solo en el primer proxy.
app.set('trust proxy', 1);

// Las páginas se generan en el servidor con EJS (alternativa B: liviano para redes 3G).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));

// T-SEG.1: cabeceras de seguridad en todas las respuestas, también en estilos y scripts.
app.use(cabeceras({ enProduccion }));

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

// Las vistas saben quién está dentro (el formulario de donaciones guarda su id para el modo sin conexión).
app.use((req, res, next) => {
  res.locals.usuarioActual = (req.session && req.session.usuario) || null;
  next();
});

// T-SEG.1: ningún formulario enviado desde otra página web cambia nada (ADR-006).
app.use(verificarOrigen);

// CA-18.2 y CA-18.4: quien no ha aceptado el aviso de privacidad solo puede leerlo, aceptarlo o salir. Va antes que el
// PIN temporal: primero se acepta el aviso y después se cambia el PIN. El teléfono recibe 401 («falta ingresar»).
const PERMITIDAS_SIN_PRIVACIDAD = ['/privacidad', '/privacidad/aceptar', '/salir', '/salud', '/sin-conexion'];
app.use((req, res, next) => {
  const usuario = req.session && req.session.usuario;
  if (!usuario || usuario.privacidadAceptada || PERMITIDAS_SIN_PRIVACIDAD.includes(req.path)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ estado: 'sin_sesion' });
  res.redirect('/privacidad');
});

// CA-11.4 y CA-11.5: con un PIN temporal pendiente solo se puede cambiar el PIN o salir. El JavaScript del
// teléfono recibe 401 («falta ingresar»), así lo guardado sin conexión sigue pendiente y no se pierde.
const PERMITIDAS_CON_PIN_TEMPORAL = ['/mi-pin', '/salir', '/salud', '/sin-conexion', '/privacidad', '/privacidad/aceptar'];
app.use((req, res, next) => {
  const usuario = req.session && req.session.usuario;
  if (!usuario || !usuario.debeCambiarPin || PERMITIDAS_CON_PIN_TEMPORAL.includes(req.path)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ estado: 'sin_sesion' });
  res.redirect('/mi-pin');
});

// Ruta de salud: sirve para comprobar que el servidor está arriba (también en Render).
app.get('/salud', (req, res) => {
  res.json({ estado: 'ok' });
});

app.use(rutasAutenticacion);
app.use(rutasDonaciones);
app.use(rutasDisponibles);
app.use(rutasTomar);
app.use(rutasConsulta);
app.use(rutasListas);
app.use(rutasEntregar);
app.use(rutasSincronizar);
app.use(rutasReporte);
app.use(rutasSoltar);
app.use(rutasZonas);
app.use(rutasUsuarios);
app.use(rutasPin);
app.use(rutasOrganizaciones);
app.use(rutasCorrecciones);
app.use(rutasIntervenciones);
app.use(rutasPrivacidad);
app.use(rutasRecepcion);
app.use(rutasAtenciones);

// Pantalla de inicio: los accesos de cada rol. Muestra una vez el aviso de la última acción (por ejemplo, PIN cambiado).
app.get('/', requerirSesion, (req, res) => {
  const aviso = req.session.aviso || null;
  delete req.session.aviso;
  res.render('inicio', { usuario: req.session.usuario, aviso });
});

// Errores no previstos: el usuario ve un código y el registro guarda el detalle (T-SEG.2).
app.use(manejarError);

module.exports = app;
