// Cómo se muestra el estado de una donación. «Vencida» no se guarda: una donación «disponible» cuya hora
// límite ya se cumplió se muestra como «Vencida (no recogida)» (CA-05.3). `donacion.vencida` lo calcula la
// consulta SQL con la hora de la base de datos.
function etiquetaDeEstado(donacion) {
  if (donacion.vencida) return 'Vencida (no recogida)';
  return { disponible: 'Disponible', asignada: 'Asignada', entregada: 'Entregada', cancelada: 'Cancelada' }[donacion.estado];
}

// Clase de CSS para colorear el estado.
function claseDeEstado(donacion) {
  return donacion.vencida ? 'estado-vencida' : `estado-${donacion.estado}`;
}

module.exports = { etiquetaDeEstado, claseDeEstado };
