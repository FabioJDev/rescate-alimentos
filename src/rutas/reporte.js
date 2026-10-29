// CMP-07 · Reporte del periodo (solo la coordinadora).
const express = require('express');
const { requerirRol } = require('../middleware/autenticacion');
const { leerPeriodo, obtenerReporte, listarParaCsv, aCsv } = require('../servicios/reporte');

const router = express.Router();

// Solo la coordinadora ve el reporte y lo descarga (CA-07.6, RNF-04).
const soloCoordinadora = requerirRol('coordinadora');

// CA-07.1 a CA-07.5: el reporte en pantalla. Con fechas inválidas no se muestra ningún dato (CA-07.4).
router.get('/reporte', soloCoordinadora, async (req, res, next) => {
  try {
    const periodo = leerPeriodo(req.query);
    if (periodo.error) {
      return res.status(400).render('reporte', { periodo, error: periodo.error, reporte: null });
    }
    const reporte = await obtenerReporte(periodo.desde, periodo.hasta);
    res.render('reporte', { periodo, error: null, reporte });
  } catch (error) {
    next(error);
  }
});

// CA-07.7: el mismo periodo como archivo CSV, una fila por donación.
router.get('/reporte.csv', soloCoordinadora, async (req, res, next) => {
  try {
    const periodo = leerPeriodo(req.query);
    if (periodo.error) {
      return res.status(400).render('reporte', { periodo, error: periodo.error, reporte: null });
    }
    const filas = await listarParaCsv(periodo.desde, periodo.hasta);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="reporte-${periodo.desde}_a_${periodo.hasta}.csv"`);
    res.send(aCsv(filas));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
