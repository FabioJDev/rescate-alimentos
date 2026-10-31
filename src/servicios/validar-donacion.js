// Validación de los datos del formulario «Publicar donación» (CA-01.2, CA-01.3 y CA-01.4).
// Devuelve los valores ya limpios y, si algo está mal, un mensaje por cada campo con problema.
const { TIPOS_ALIMENTO, UNIDADES } = require('./donaciones');
const { horaBogotaAIso } = require('../utilidades/fechas');

// Cuando la coordinadora registra a nombre de un comercio (CA-01.5), se pasa la lista de `comercios` y se
// exige elegir uno. Si no se pasa (el donante registra lo suyo), no hay nada que elegir.
function validarDonacion(cuerpo, ahora = new Date(), { comercios = null } = {}) {
  const errores = {};

  const tipoAlimento = (cuerpo.tipo_alimento || '').trim();
  const unidad = (cuerpo.unidad || '').trim();
  const puntoEscrito = (cuerpo.punto_recogida || '').trim();
  const comercioTexto = (cuerpo.donante_id || '').trim();
  const cantidadTexto = (cuerpo.cantidad || '').trim();
  const horaLimiteTexto = (cuerpo.hora_limite || '').trim();
  const kgTexto = (cuerpo.kg_aproximados || '').trim();

  // CA-01.2: cada campo obligatorio vacío se señala con su nombre.
  if (!tipoAlimento) errores.tipo_alimento = 'Falta elegir el tipo de alimento.';
  else if (!TIPOS_ALIMENTO.includes(tipoAlimento)) errores.tipo_alimento = 'Elige un tipo de alimento de la lista.';

  if (!unidad) errores.unidad = 'Falta elegir la unidad.';
  else if (!UNIDADES.includes(unidad)) errores.unidad = 'Elige una unidad de la lista.';

  // CA-01.5: la coordinadora elige el comercio de la lista.
  let comercio = null;
  if (comercios) {
    if (!comercioTexto) {
      errores.donante_id = 'Falta elegir el comercio que dona.';
    } else {
      comercio = comercios.find((c) => String(c.id) === comercioTexto) || null;
      if (!comercio) errores.donante_id = 'Elige un comercio de la lista.';
    }
  }

  // Por defecto el punto de recogida es la dirección del comercio: si la coordinadora lo deja vacío, se usa esa.
  let puntoRecogida = puntoEscrito;
  if (!puntoRecogida && comercio && comercio.direccion) puntoRecogida = comercio.direccion;
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

  // CA-22.1 y CA-22.2: el peso aproximado es opcional y solo tiene sentido si la unidad no es kg (con kg, el peso
  // es la cantidad). Si se escribe, tiene que ser un número mayor que cero.
  let kgAproximados = null;
  if (unidad !== 'kg' && kgTexto) {
    kgAproximados = Number(kgTexto.replace(',', '.'));
    if (!Number.isFinite(kgAproximados) || kgAproximados <= 0) {
      errores.kg_aproximados = 'El peso aproximado debe ser un número mayor que cero (o déjalo vacío).';
    }
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
      punto_recogida: puntoEscrito,
      hora_limite: horaLimiteTexto,
      donante_id: comercioTexto,
      kg_aproximados: kgTexto,
    },
    // Lo que se guarda cuando no hay errores.
    datos: { tipoAlimento, cantidad, unidad, puntoRecogida, horaLimite, comercio, kgAproximados },
  };
}

module.exports = { validarDonacion };
