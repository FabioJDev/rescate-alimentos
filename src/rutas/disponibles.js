// CMP-02 · Hacer visible la donación para quien debe tomarla: la lista «Donaciones disponibles».
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { listarDisponibles } = require('../servicios/donaciones');
const { listarZonasActivas } = require('../servicios/zonas');
const { formatearFechaHora, tiempoRestante } = require('../utilidades/fechas');
const { vencePronto } = require('../servicios/por-vencer');

const router = express.Router();

router.get('/disponibles', requerirRol('voluntario'), async (req, res, next) => {
  try {
    const { zona } = req.session.usuario;
    const zonasActivas = (await listarZonasActivas()).map((z) => z.nombre);

    // CA-02.3 y CA-02.6: por defecto se ve la zona del voluntario; con ?zona=todas se ven todas; con
    // ?zona=<nombre> se ve esa zona en particular, aunque no sea la suya (por ejemplo, de paso).
    // Un voluntario sin zona asignada ve todas.
    const verTodas = req.query.zona === 'todas' || !zona;
    const zonaElegida = !verTodas && zonasActivas.includes(req.query.zona) ? req.query.zona : zona;
    const ahora = new Date();

    const donaciones = (await listarDisponibles({ zona: verTodas ? null : zonaElegida })).map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
      horaLimiteTexto: formatearFechaHora(d.hora_limite),
      restante: tiempoRestante(d.hora_limite, ahora),
      vencePronto: vencePronto(d.hora_limite, ahora), // CA-21.5
    }));

    res.render('disponibles', { donaciones, zonaVoluntario: zona, zonaElegida, zonasActivas, verTodas });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
