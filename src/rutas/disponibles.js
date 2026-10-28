// CMP-02 · Hacer visible la donación para quien debe tomarla: la lista «Donaciones disponibles».
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { listarDisponibles } = require('../servicios/donaciones');
const { formatearFechaHora, tiempoRestante } = require('../utilidades/fechas');

const router = express.Router();

router.get('/disponibles', requerirRol('voluntario'), async (req, res, next) => {
  try {
    const { zona } = req.session.usuario;

    // CA-02.3: por defecto se ve la zona del voluntario; con ?zona=todas se ven todas.
    // Un voluntario sin zona asignada ve todas.
    const verTodas = req.query.zona === 'todas' || !zona;
    const ahora = new Date();

    const donaciones = (await listarDisponibles({ zona: verTodas ? null : zona })).map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
      horaLimiteTexto: formatearFechaHora(d.hora_limite),
      restante: tiempoRestante(d.hora_limite, ahora),
    }));

    res.render('disponibles', { donaciones, zonaVoluntario: zona, verTodas });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
