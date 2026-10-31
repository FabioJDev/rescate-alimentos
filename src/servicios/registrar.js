// Registro de una donación a partir de los datos de un formulario. Lo usan el formulario normal (CMP-01)
// y la sincronización de lo guardado sin conexión (CMP-08), para que las reglas sean exactamente las mismas.
const { consultar } = require('../db/conexion');
const { validarDonacion } = require('./validar-donacion');
const { registrarDonacion } = require('./donaciones');

// Los comercios entre los que puede elegir la coordinadora. Los desactivados no aparecen (CA-10.6).
async function listarComercios() {
  const r = await consultar("SELECT id, nombre, zona, direccion FROM usuarios WHERE rol = 'donante' AND activo ORDER BY nombre");
  return r.rows;
}

// CA-01.1 a CA-01.5: valida y registra. Devuelve { errores, valores } si algo está mal (no se guarda nada)
// o { donacion } si quedó registrada. `opciones.idLocal` y `opciones.detalle` son de CMP-08.
async function registrarDesdeFormulario(usuario, cuerpo, opciones = {}) {
  const esCoordinadora = usuario.rol === 'coordinadora';
  const comercios = esCoordinadora ? await listarComercios() : null;

  // Si quien registra es un donante, se ignora cualquier `donante_id` que venga en el formulario:
  // un donante solo puede registrar donaciones a su propio nombre.
  const { errores, valores, datos } = validarDonacion(cuerpo, new Date(), { comercios });
  if (Object.keys(errores).length > 0) return { errores, valores, comercios };

  const donanteId = esCoordinadora ? datos.comercio.id : usuario.id;
  const zona = esCoordinadora
    ? datos.comercio.zona
    : (await consultar('SELECT zona FROM usuarios WHERE id = $1', [usuario.id])).rows[0].zona;

  const donacion = await registrarDonacion({
    donanteId,
    registradaPorId: usuario.id,
    tipoAlimento: datos.tipoAlimento,
    cantidad: datos.cantidad,
    unidad: datos.unidad,
    puntoRecogida: datos.puntoRecogida,
    zona,
    horaLimite: datos.horaLimite,
    idLocal: opciones.idLocal,
    detalle: opciones.detalle,
  });
  return { donacion, comercios };
}

module.exports = { listarComercios, registrarDesdeFormulario };
