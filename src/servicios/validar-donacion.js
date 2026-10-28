// Validación de los datos del formulario «Publicar donación» (CA-01.2, CA-01.3 y CA-01.4).
// Devuelve los valores ya limpios y, si algo está mal, un mensaje por cada campo con problema.
const { TIPOS_ALIMENTO, UNIDADES } = require('./donaciones');
const { horaBogotaAIso } = require('../utilidades/fechas');

function validarDonacion(cuerpo, ahora = new Date()) {
  const errores = {};

  const tipoAlimento = (cuerpo.tipo_alimento || '').trim();
  const unidad = (cuerpo.unidad || '').trim();
  const puntoRecogida = (cuerpo.punto_recogida || '').trim();
  const cantidadTexto = (cuerpo.cantidad || '').trim();
  const horaLimiteTexto = (cuerpo.hora_limite || '').trim();

  // CA-01.2: cada campo obligatorio vacío se señala con su nombre.
  if (!tipoAlimento) errores.tipo_alimento = 'Falta elegir el tipo de alimento.';
  else if (!TIPOS_ALIMENTO.includes(tipoAlimento)) errores.tipo_alimento = 'Elige un tipo de alimento de la lista.';

  if (!unidad) errores.unidad = 'Falta elegir la unidad.';
  else if (!UNIDADES.includes(unidad)) errores.unidad = 'Elige una unidad de la lista.';

  if (!puntoRecogida) errores.punto_recogida = 'Falta el punto de recogida.';

  // CA-01.4: la cantidad no puede estar vacía, ser cero, negativa ni dejar de ser un número.
  let cantidad = null;
  if (!cantidadTexto) {
    errores.cantidad = 'Falta la cantidad aproximada.';
  } else {
    // En Colombia se escribe la coma decimal («5,5»): se acepta como punto.
    cantidad = Number(cantidadTexto.replace(',', '.'));
    if (!Number.isFinite(cantidad)) errores.cantidad = 'La cantidad debe ser un número.';
    else if (cantidad <= 0) errores.cantidad = 'La cantidad debe ser mayor que cero.';
  }

  // CA-01.3: la hora límite tiene que estar en el futuro.
  let horaLimite = null;
  if (!horaLimiteTexto) {
    errores.hora_limite = 'Falta la hora límite.';
  } else {
    horaLimite = horaBogotaAIso(horaLimiteTexto);
    if (!horaLimite || Number.isNaN(new Date(horaLimite).getTime())) {
      errores.hora_limite = 'La hora límite no es una fecha y hora válidas.';
    } else if (new Date(horaLimite) <= ahora) {
      errores.hora_limite = 'La hora límite debe ser posterior a la hora actual';
    }
  }

  return {
    errores,
    // Lo que escribió la persona, para devolvérselo al formulario sin que tenga que escribirlo otra vez.
    valores: {
      tipo_alimento: tipoAlimento,
      cantidad: cantidadTexto,
      unidad,
      punto_recogida: puntoRecogida,
      hora_limite: horaLimiteTexto,
    },
    // Lo que se guarda cuando no hay errores.
    datos: { tipoAlimento, cantidad, unidad, puntoRecogida, horaLimite },
  };
}

module.exports = { validarDonacion };
