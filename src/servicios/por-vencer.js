// CMP-21 · Donaciones por vencer y recordatorio por WhatsApp (RF-10). Sin SMS ni notificaciones pagadas (RNF-06):
// la aplicación arma el mensaje y la coordinadora lo envía con un toque desde su WhatsApp.
const { consultar } = require('../db/conexion');
const { formatearHora } = require('../utilidades/fechas');

const VENTANA_MINUTOS = 60;

// Por vencer = disponible o asignada, con la hora límite dentro de los próximos 60 minutos.
const CONDICION = `d.estado IN ('disponible', 'asignada')
   AND d.hora_limite > now() AND d.hora_limite <= now() + make_interval(mins => ${VENTANA_MINUTOS})`;

// CA-21.5: para marcar «Vence pronto» en las listas de los voluntarios.
function vencePronto(horaLimite, ahora = new Date()) {
  const minutos = (new Date(horaLimite) - ahora) / 60000;
  return minutos > 0 && minutos <= VENTANA_MINUTOS;
}

// CA-21.1.
async function contarPorVencer() {
  const r = await consultar(`SELECT count(*)::int AS total FROM donaciones d WHERE ${CONDICION}`);
  return r.rows[0].total;
}

// CA-21.2: de la más urgente a la menos urgente.
async function listarPorVencer() {
  const r = await consultar(
    `SELECT d.codigo, d.tipo_alimento, d.cantidad, d.unidad, d.zona, d.estado, d.hora_limite, d.punto_recogida,
            v.nombre AS voluntario_nombre
       FROM donaciones d
       LEFT JOIN usuarios v ON v.id = d.voluntario_id
      WHERE ${CONDICION}
      ORDER BY d.hora_limite ASC, d.id ASC`
  );
  return r.rows;
}

async function buscarParaAvisar(codigo) {
  const r = await consultar(
    `SELECT d.*, donante.nombre AS donante_nombre, donante.telefono AS donante_telefono,
            v.nombre AS voluntario_nombre, v.telefono AS voluntario_telefono
       FROM donaciones d
       JOIN usuarios donante ON donante.id = d.donante_id
       LEFT JOIN usuarios v ON v.id = d.voluntario_id
      WHERE d.codigo = $1`,
    [codigo]
  );
  return r.rows[0] || null;
}

// CA-21.3: los voluntarios activos de la zona de la donación.
async function voluntariosDeZona(zona) {
  const r = await consultar(
    "SELECT nombre, telefono FROM usuarios WHERE rol = 'voluntario' AND activo AND zona = $1 ORDER BY nombre",
    [zona]
  );
  return r.rows;
}

// Número para WhatsApp: solo dígitos y con el indicativo de Colombia (57) si es un número nacional de 10 dígitos.
function numeroWhatsApp(telefono) {
  const digitos = (telefono || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.length === 10 ? `57${digitos}` : digitos;
}

// Enlace que abre WhatsApp con el mensaje ya escrito. CA-21.6: sin teléfono, no hay enlace.
function enlaceWhatsApp(telefono, mensaje) {
  const numero = numeroWhatsApp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null;
}

function describir(d) {
  return `${d.tipo_alimento}, ${Number(d.cantidad)} ${d.unidad}`;
}

// CA-21.3 y CA-21.4: a quién avisar y con qué mensaje, según el estado de la donación.
async function avisosPara(donacion, urlBase) {
  const hora = formatearHora(donacion.hora_limite);
  if (donacion.estado === 'disponible') {
    const enlaceTomar = `${urlBase}/donaciones/${donacion.codigo}/tomar`;
    return (await voluntariosDeZona(donacion.zona)).map((v) => ({
      nombre: v.nombre,
      papel: 'Voluntario de la zona',
      enlace: enlaceWhatsApp(
        v.telefono,
        `Hola ${v.nombre}, hay una donación por vencer en la zona ${donacion.zona}: ${describir(donacion)}. ` +
          `Recógela en ${donacion.punto_recogida} antes de las ${hora}. Código ${donacion.codigo}. Tómala aquí: ${enlaceTomar}`
      ),
    }));
  }
  return [
    {
      nombre: donacion.voluntario_nombre,
      papel: 'Voluntario que la tomó',
      enlace: enlaceWhatsApp(
        donacion.voluntario_telefono,
        `Hola ${donacion.voluntario_nombre}, te recordamos la donación ${donacion.codigo} que tomaste (${describir(donacion)}): ` +
          `recógela en ${donacion.punto_recogida} antes de las ${hora}.`
      ),
    },
    {
      nombre: donacion.donante_nombre,
      papel: 'Comercio',
      enlace: enlaceWhatsApp(
        donacion.donante_telefono,
        `Hola, ${donacion.voluntario_nombre} va a recoger la donación ${donacion.codigo} (${describir(donacion)}) antes de las ${hora}. ¡Gracias!`
      ),
    },
  ];
}

module.exports = {
  VENTANA_MINUTOS,
  vencePronto,
  contarPorVencer,
  listarPorVencer,
  buscarParaAvisar,
  numeroWhatsApp,
  avisosPara,
};
