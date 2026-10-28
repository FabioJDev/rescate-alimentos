// Control de acceso: quién está dentro y qué rol tiene (RNF-04: solo roles autorizados).

// Deja pasar solo a quien tiene sesión iniciada; si no, lo manda a ingresar.
function requerirSesion(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.redirect('/ingreso');
  }
  next();
}

// Deja pasar solo a los roles indicados. Ejemplo: requerirRol('voluntario').
// Sin sesión lo manda a ingresar; con sesión pero rol incorrecto responde 403.
function requerirRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session || !req.session.usuario) {
      return res.redirect('/ingreso');
    }
    if (!rolesPermitidos.includes(req.session.usuario.rol)) {
      return res.status(403).render('error', {
        titulo: 'No tienes permiso',
        mensaje: 'Tu usuario no puede hacer esto.',
      });
    }
    next();
  };
}

module.exports = { requerirSesion, requerirRol };
