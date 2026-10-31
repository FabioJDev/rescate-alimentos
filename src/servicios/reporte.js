// CMP-07 · Reporte del periodo (solo coordinadora). Todo el cálculo lo hace la base de datos.
// El periodo se elige por fecha de REGISTRO de la donación, en hora de Colombia, con «desde» y «hasta» incluidos.
const { consultar } = require('../db/conexion');
const { ZONA } = require('../utilidades/fechas');
const { etiquetaDeEstado } = require('../utilidades/estados');

const DIAS_POR_DEFECTO = 30;

// Fecha de hoy en Colombia como «2026-10-28».
function hoyEnColombia(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
}

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Una fecha «AAAA-MM-DD» es válida solo si existe en el calendario (no «2026-02-31»).
function esFechaValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// CA-07.4: lee el periodo de la dirección (?desde=...&hasta=...). Si no viene, son los últimos 30 días.
// Devuelve el periodo y, si algo está mal, un mensaje claro (y entonces no se consultan datos).
function leerPeriodo(consulta, ahora = new Date()) {
  const hoy = hoyEnColombia(ahora);
  const desdeTexto = typeof consulta.desde === 'string' ? consulta.desde.trim() : '';
  const hastaTexto = typeof consulta.hasta === 'string' ? consulta.hasta.trim() : '';

  const hasta = hastaTexto || hoy;
  const desde = desdeTexto || sumarDias(hasta, -(DIAS_POR_DEFECTO - 1));

  let error = null;
  if (!esFechaValida(desde)) error = 'La fecha «desde» no es válida. Usa el formato día/mes/año.';
  else if (!esFechaValida(hasta)) error = 'La fecha «hasta» no es válida. Usa el formato día/mes/año.';
  else if (hasta < desde) error = 'La fecha «hasta» no puede ser anterior a la fecha «desde».';

  return { desde, hasta, error };
}

// Condición SQL del periodo: de las 00:00 de «desde» a las 23:59 de «hasta», hora de Colombia.
const EN_PERIODO = `d.creada_en >= (($1::date)::timestamp AT TIME ZONE '${ZONA}')
                    AND d.creada_en < ((($2::date + 1))::timestamp AT TIME ZONE '${ZONA}')`;

// CA-07.1 a CA-07.3: los números del periodo.
async function obtenerReporte(desde, hasta) {
  const parametros = [desde, hasta];

  const conteos = (
    await consultar(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE d.estado = 'disponible' AND d.hora_limite > now())::int AS disponibles,
              count(*) FILTER (WHERE d.estado = 'asignada')::int AS asignadas,
              count(*) FILTER (WHERE d.estado = 'entregada')::int AS entregadas,
              count(*) FILTER (WHERE d.estado = 'disponible' AND d.hora_limite <= now())::int AS vencidas,
              count(*) FILTER (WHERE d.estado = 'cancelada')::int AS canceladas
         FROM donaciones d
        WHERE ${EN_PERIODO}`,
      parametros
    )
  ).rows[0];

  // CA-07.2: solo lo entregado, separado por unidad (nunca se suman kg con cajas). La cantidad es declarada.
  const porUnidad = (
    await consultar(
      `SELECT d.unidad, sum(d.cantidad) AS cantidad
         FROM donaciones d
        WHERE d.estado = 'entregada' AND ${EN_PERIODO}
        GROUP BY d.unidad
        ORDER BY d.unidad`,
      parametros
    )
  ).rows.map((f) => ({ unidad: f.unidad, cantidad: Number(f.cantidad) }));

  // CA-22.3: kilos aproximados entregados = kg declarados + pesos aproximados de lo que vino en otras unidades.
  // Se cuenta aparte cuántas entregas no tienen peso aproximado, para no presentar el total como completo.
  const kilos = (
    await consultar(
      `SELECT coalesce(sum(CASE WHEN d.unidad = 'kg' THEN d.cantidad ELSE d.kg_aproximados END), 0) AS kilos,
              count(*) FILTER (WHERE d.unidad <> 'kg' AND d.kg_aproximados IS NULL)::int AS sin_peso
         FROM donaciones d
        WHERE d.estado = 'entregada' AND ${EN_PERIODO}`,
      parametros
    )
  ).rows[0];
  const kilosAproximados = { kilos: Number(kilos.kilos), sinPeso: kilos.sin_peso };

  // CA-07.3: entregas por organización y donaciones por tipo de alimento.
  const porOrganizacion = (
    await consultar(
      `SELECT org.nombre, count(*)::int AS entregas
         FROM donaciones d
         JOIN organizaciones org ON org.id = d.organizacion_id
        WHERE d.estado = 'entregada' AND ${EN_PERIODO}
        GROUP BY org.nombre
        ORDER BY entregas DESC, org.nombre`,
      parametros
    )
  ).rows;

  // Las canceladas no cuentan: no hubo alimento que rescatar (cambio de CA-07.1 con CMP-13).
  const porTipo = (
    await consultar(
      `SELECT d.tipo_alimento AS tipo, count(*)::int AS donaciones
         FROM donaciones d
        WHERE d.estado <> 'cancelada' AND ${EN_PERIODO}
        GROUP BY d.tipo_alimento
        ORDER BY donaciones DESC, d.tipo_alimento`,
      parametros
    )
  ).rows;

  return { conteos, porUnidad, kilosAproximados, porOrganizacion, porTipo };
}

// CA-07.7: una fila por donación del periodo, para el archivo CSV.
async function listarParaCsv(desde, hasta) {
  const r = await consultar(
    `SELECT d.codigo, d.estado, d.tipo_alimento, d.cantidad, d.unidad, d.zona, d.hora_limite,
            (d.estado = 'disponible' AND d.hora_limite <= now()) AS vencida,
            donante.nombre AS donante, voluntario.nombre AS voluntario, org.nombre AS organizacion,
            d.recibido_por, d.creada_en, d.tomada_en, d.entregada_en, d.kg_aproximados
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       LEFT JOIN usuarios voluntario ON voluntario.id = d.voluntario_id
       LEFT JOIN organizaciones org ON org.id = d.organizacion_id
      WHERE ${EN_PERIODO}
      ORDER BY d.creada_en ASC, d.id ASC`,
    [desde, hasta]
  );
  return r.rows;
}

// Fecha y hora de Colombia para el CSV: «2026-10-28 14:30».
function fechaParaCsv(fecha) {
  if (!fecha) return '';
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', timeZone: ZONA }).format(fecha);
}

// Una celda del CSV. Entre comillas si hace falta. Si empieza con = + - @, Excel la leería como fórmula:
// se le antepone un apóstrofo para que se muestre como texto (los nombres los escriben los usuarios).
function celda(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const ENCABEZADOS = [
  'Código',
  'Estado',
  'Tipo de alimento',
  'Cantidad declarada',
  'Unidad',
  'Kg aproximados',
  'Zona',
  'Donante',
  'Voluntario',
  'Organización que recibió',
  'Quién recibió',
  'Hora límite',
  'Registrada',
  'Tomada',
  'Entregada',
];

// El archivo empieza con la marca BOM para que Excel lea bien las tildes y la ñ.
function aCsv(filas) {
  const lineas = [ENCABEZADOS.map(celda).join(',')];
  for (const f of filas) {
    lineas.push(
      [
        f.codigo,
        etiquetaDeEstado(f),
        f.tipo_alimento,
        Number(f.cantidad),
        f.unidad,
        f.unidad === 'kg' ? Number(f.cantidad) : f.kg_aproximados === null ? '' : Number(f.kg_aproximados),
        f.zona,
        f.donante,
        f.voluntario,
        f.organizacion,
        f.recibido_por,
        fechaParaCsv(f.hora_limite),
        fechaParaCsv(f.creada_en),
        fechaParaCsv(f.tomada_en),
        fechaParaCsv(f.entregada_en),
      ]
        .map(celda)
        .join(',')
    );
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}

// CA-20.5: el CSV de atenciones (personas por día), con las mismas reglas de celdas y la marca BOM para Excel.
function atencionesACsv(filas) {
  const lineas = [['Fecha', 'Organización', 'Personas atendidas', 'Registró', 'Corrigió'].map(celda).join(',')];
  for (const f of filas) {
    lineas.push([f.fecha, f.organizacion, f.personas, f.registrada_por, f.corregida_por].map(celda).join(','));
  }
  return `﻿${lineas.join('\r\n')}\r\n`;
}

module.exports = { leerPeriodo, obtenerReporte, listarParaCsv, aCsv, atencionesACsv, hoyEnColombia };
