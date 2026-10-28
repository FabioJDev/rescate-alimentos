// Arma la aplicación Express. Se exporta sin arrancar el servidor para poder probarla con Supertest.
const path = require('path');
const express = require('express');

const app = express();

// Las páginas se generan en el servidor con EJS (alternativa B: liviano para redes 3G).
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'publico')));

// Ruta de salud: sirve para comprobar que el servidor está arriba (también en Render).
app.get('/salud', (req, res) => {
  res.json({ estado: 'ok' });
});

module.exports = app;
