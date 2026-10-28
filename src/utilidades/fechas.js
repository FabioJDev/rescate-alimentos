// Fechas en hora de Colombia. Colombia no tiene horario de verano: siempre es UTC-5.
const ZONA = 'America/Bogota';

// Convierte el valor de un <input type="datetime-local"> (ej. "2026-10-29T18:30") a un texto con
// la zona horaria, para que PostgreSQL no lo interprete en la hora del servidor.
// Devuelve null si no tiene el formato esperado.
function horaBogotaAIso(valor) {
  if (typeof valor !== 'string') return null;
  const coincide = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(valor.trim());
  if (!coincide) return null;
  return `${coincide[1]}${coincide[2] || ':00'}-05:00`;
}

// Muestra una fecha como «28 oct 2026, 2:30 p. m.» en hora de Colombia.
function formatearFechaHora(fecha) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(fecha);
}

module.exports = { ZONA, horaBogotaAIso, formatearFechaHora };
