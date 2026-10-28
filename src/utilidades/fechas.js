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

// Muestra solo la hora en formato de 24 horas, en hora de Colombia: «14:35».
function formatearHora(fecha) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA }).format(fecha);
}

// Texto del tiempo que falta hasta una hora límite: «35 min», «1 h 25 min», «27 h».
function tiempoRestante(horaLimite, ahora = new Date()) {
  const minutos = Math.max(0, Math.floor((new Date(horaLimite) - ahora) / 60000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

module.exports = { ZONA, horaBogotaAIso, formatearFechaHora, formatearHora, tiempoRestante };
