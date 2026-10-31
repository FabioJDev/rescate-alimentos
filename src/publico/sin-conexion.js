// CMP-08 · Registrar una donación sin conexión (docs/decisiones/ADR-004-modo-sin-conexion.md).
//
// Dos partes en este archivo:
//   1. La COLA de pendientes (`crearCola`): guarda en el teléfono las donaciones que no se pudieron enviar y las
//      manda cuando hay señal. No toca la pantalla, así que se prueba con Jest (tests/cmp-08.test.js).
//   2. La INTERFAZ (`iniciarInterfaz`): aviso de pendientes, interceptar el formulario y registrar el service worker.
//
// Regla: si este archivo no carga o falla, la aplicación funciona igual que antes (solo sin el modo sin conexión).
(function (raiz) {
  'use strict';

  var CLAVE = 'rescate-donaciones-pendientes';
  var CAMPOS = ['tipo_alimento', 'cantidad', 'unidad', 'punto_recogida', 'hora_limite', 'donante_id', 'kg_aproximados'];

  // Identificador único de cada donación guardada. Con él, enviarla dos veces no la duplica (CA-08.3).
  function idAleatorio() {
    var c = raiz.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var bytes = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map
      .call(bytes, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      })
      .join('');
  }

  // opciones.almacen: algo con getItem/setItem (localStorage). opciones.enviar(payload): promesa de
  // { status, cuerpo }; se rechaza si no hay red.
  function crearCola(opciones) {
    var almacen = opciones.almacen;
    var enviar = opciones.enviar;
    var generarId = opciones.generarId || idAleatorio;
    var ahora = opciones.ahora || function () { return new Date(); };
    var enCurso = null;

    function leer() {
      try {
        var lista = JSON.parse(almacen.getItem(CLAVE) || '[]');
        return Array.isArray(lista) ? lista : [];
      } catch (e) {
        return [];
      }
    }
    function escribir(lista) {
      almacen.setItem(CLAVE, JSON.stringify(lista));
    }
    // Cambios por identificador sobre la lista recién leída, para no pisar lo que otra pestaña haya guardado.
    function cambiar(idLocal, accion) {
      var lista = leer();
      var resultado = [];
      lista.forEach(function (item) {
        if (item.id_local !== idLocal) return resultado.push(item);
        var nuevo = accion(item);
        if (nuevo) resultado.push(nuevo);
      });
      escribir(resultado);
    }

    // CA-08.1: guarda la donación en el teléfono como pendiente.
    function guardar(usuarioId, campos) {
      var datos = {};
      CAMPOS.forEach(function (nombre) {
        datos[nombre] = campos[nombre] === undefined || campos[nombre] === null ? '' : String(campos[nombre]);
      });
      var item = {
        id_local: generarId(),
        usuario_id: Number(usuarioId),
        capturada_en: ahora().toISOString(),
        estado: 'pendiente',
        campos: datos,
      };
      var lista = leer();
      lista.push(item);
      escribir(lista);
      return item;
    }

    function todas() {
      return leer();
    }
    function deUsuario(usuarioId) {
      return leer().filter(function (item) { return item.usuario_id === Number(usuarioId); });
    }
    function descartar(idLocal) {
      cambiar(idLocal, function () { return null; });
    }

    function payloadDe(item) {
      var payload = {};
      CAMPOS.forEach(function (nombre) { payload[nombre] = item.campos[nombre]; });
      payload.id_local = item.id_local;
      payload.usuario_id = item.usuario_id;
      payload.capturada_en = item.capturada_en;
      return payload;
    }

    // CA-08.2 a CA-08.5: envía en orden las pendientes de este usuario. Nunca borra algo que no se registró.
    //   201/200 → se quita (registrada)         422 → queda como «rechazada», visible hasta descartarla (CA-08.4)
    //   401 → sigue pendiente, falta ingresar    409 → sigue pendiente, es de otro usuario (CA-08.5)
    //   sin red o error del servidor → sigue pendiente, se reintenta más tarde
    function enviarPendientes(usuarioId) {
      var resultado = { registradas: [], rechazadas: 0, sinRed: false, sinSesion: false, otroUsuario: false, errorServidor: false };
      var pendientes = deUsuario(usuarioId).filter(function (item) { return item.estado === 'pendiente'; });

      return pendientes
        .reduce(function (cadena, item) {
          return cadena.then(function (seguir) {
            if (!seguir) return false;
            return enviar(payloadDe(item)).then(
              function (respuesta) {
                var estado = respuesta.status;
                var cuerpo = respuesta.cuerpo || {};
                if (estado === 200 || estado === 201) {
                  cambiar(item.id_local, function () { return null; });
                  resultado.registradas.push(cuerpo.codigo);
                  return true;
                }
                if (estado === 422 || estado === 403) {
                  var errores = cuerpo.errores || { general: 'El sistema no pudo registrar esta donación.' };
                  cambiar(item.id_local, function (actual) {
                    actual.estado = 'rechazada';
                    actual.errores = errores;
                    return actual;
                  });
                  resultado.rechazadas++;
                  return true;
                }
                if (estado === 401) resultado.sinSesion = true;
                else if (estado === 409) resultado.otroUsuario = true;
                else resultado.errorServidor = true;
                return false;
              },
              function () {
                resultado.sinRed = true;
                return false;
              }
            );
          });
        }, Promise.resolve(true))
        .then(function () { return resultado; });
    }

    // Si ya hay un envío en marcha en esta pestaña, se espera ese en vez de empezar otro.
    // (Entre pestañas no hace falta coordinarse: el servidor no duplica un envío repetido.)
    function sincronizar(usuarioId) {
      if (enCurso) return enCurso;
      enCurso = enviarPendientes(usuarioId).then(
        function (resultado) { enCurso = null; return resultado; },
        function (error) { enCurso = null; throw error; }
      );
      return enCurso;
    }

    return { guardar: guardar, todas: todas, deUsuario: deUsuario, descartar: descartar, sincronizar: sincronizar };
  }

  // --------------------------------------------------------------------------------------------
  // Interfaz (solo en el navegador)
  // --------------------------------------------------------------------------------------------
  function iniciarInterfaz() {
    var doc = raiz.document;
    var cola;
    try {
      cola = crearCola({ almacen: raiz.localStorage, enviar: enviarAlServidor });
    } catch (e) {
      return; // sin almacenamiento (modo privado estricto): no hay modo sin conexión, pero todo lo demás funciona
    }

    var usuarioActual = null; // se pregunta al servidor solo cuando hace falta
    var aviso = null;
    var mensajeExito = '';

    function enviarAlServidor(payload) {
      return raiz
        .fetch('/api/donaciones/sincronizar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        })
        .then(function (r) {
          return r.json().then(
            function (cuerpo) { return { status: r.status, cuerpo: cuerpo }; },
            function () { return { status: r.status, cuerpo: {} }; }
          );
        });
    }

    function preguntarUsuario() {
      return raiz.fetch('/api/yo', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
        return r.status === 200 ? r.json() : null;
      });
    }

    function elemento(etiqueta, clase, texto) {
      var e = doc.createElement(etiqueta);
      if (clase) e.className = clase;
      if (texto) e.textContent = texto;
      return e;
    }

    // Aviso de pendientes y rechazadas, arriba de la pantalla. Todo con textContent: nada de lo escrito se interpreta como HTML.
    function dibujarAviso() {
      var lista = usuarioActual ? cola.deUsuario(usuarioActual) : cola.todas();
      var pendientes = lista.filter(function (i) { return i.estado === 'pendiente'; });
      var rechazadas = lista.filter(function (i) { return i.estado === 'rechazada'; });

      if (aviso) { aviso.remove(); aviso = null; }
      if (pendientes.length === 0 && rechazadas.length === 0 && !mensajeExito) return;

      aviso = elemento('div', 'aviso-sin-conexion');
      aviso.setAttribute('role', 'status');

      if (mensajeExito) aviso.appendChild(elemento('p', 'exito', mensajeExito));
      if (pendientes.length > 0) {
        aviso.appendChild(
          elemento('p', 'aviso', pendientes.length === 1
            ? 'Tienes 1 donación guardada en tu teléfono. Se enviará cuando haya señal.'
            : 'Tienes ' + pendientes.length + ' donaciones guardadas en tu teléfono. Se enviarán cuando haya señal.')
        );
      }
      rechazadas.forEach(function (item) {
        var caja = elemento('div', 'error');
        caja.setAttribute('role', 'alert');
        caja.appendChild(
          elemento('p', '', 'No se pudo registrar la donación de ' + (item.campos.tipo_alimento || 'alimento') + ' (' + item.campos.cantidad + ' ' + item.campos.unidad + '):')
        );
        Object.keys(item.errores || {}).forEach(function (campo) {
          caja.appendChild(elemento('p', '', item.errores[campo]));
        });
        var boton = elemento('button', 'secundario', 'Descartar');
        boton.type = 'button';
        boton.addEventListener('click', function () { cola.descartar(item.id_local); dibujarAviso(); });
        caja.appendChild(boton);
        aviso.appendChild(caja);
      });

      var barra = doc.querySelector('.barra');
      if (barra && barra.parentNode) barra.parentNode.insertBefore(aviso, barra.nextSibling);
      else doc.body.insertBefore(aviso, doc.body.firstChild);
    }

    // CA-08.2: intenta enviar lo pendiente. Se llama al abrir una pantalla, al volver la señal y cada 30 segundos.
    function intentarSincronizar() {
      if (raiz.navigator.onLine === false) return;
      if (cola.todas().every(function (i) { return i.estado !== 'pendiente'; })) return;

      preguntarUsuario()
        .then(function (yo) {
          if (!yo) { dibujarAviso(); return null; } // CA-08.5: sin sesión, siguen pendientes
          usuarioActual = yo.id;
          return cola.sincronizar(yo.id);
        })
        .then(function (resultado) {
          if (resultado && resultado.registradas.length > 0) {
            mensajeExito = resultado.registradas.length === 1
              ? 'Se envió la donación que tenías guardada. Su código es ' + resultado.registradas[0] + '.'
              : 'Se enviaron ' + resultado.registradas.length + ' donaciones que tenías guardadas: ' + resultado.registradas.join(', ') + '.';
          }
          dibujarAviso();
        })
        .catch(function () { dibujarAviso(); }); // sin red: se reintenta después
    }

    // --- Formulario «Publicar donación» ---
    function textoDe(formulario, nombre) {
      var campo = formulario.elements[nombre];
      return campo ? campo.value : '';
    }

    // CA-08.1: guarda en el teléfono lo escrito y deja el formulario listo para otra donación.
    function guardarSinConexion(formulario) {
      var campos = {};
      CAMPOS.forEach(function (nombre) { campos[nombre] = textoDe(formulario, nombre); });
      cola.guardar(formulario.getAttribute('data-usuario'), campos);

      ['tipo_alimento', 'cantidad', 'hora_limite', 'donante_id', 'kg_aproximados'].forEach(function (nombre) {
        if (formulario.elements[nombre]) formulario.elements[nombre].value = '';
      });
      var boton = formulario.querySelector('button[type="submit"]');
      if (boton) {
        boton.disabled = false;
        boton.classList.remove('cargando');
        boton.removeAttribute('aria-busy');
        if (boton.dataset.textoOriginal) boton.textContent = boton.dataset.textoOriginal;
      }
      mensajeExito = 'Guardada en tu teléfono. Se enviará cuando haya señal.';
      usuarioActual = Number(formulario.getAttribute('data-usuario')) || usuarioActual;
      dibujarAviso();
      raiz.scrollTo(0, 0);
    }

    // Comprueba en pocos segundos si de verdad hay servidor al otro lado (la señal débil engaña a `onLine`).
    function hayConexion() {
      if (raiz.navigator.onLine === false) return Promise.resolve(false);
      var control = typeof raiz.AbortController === 'function' ? new raiz.AbortController() : null;
      var plazo = raiz.setTimeout(function () { if (control) control.abort(); }, 6000);
      return raiz
        .fetch('/salud', { cache: 'no-store', signal: control ? control.signal : undefined })
        .then(function (r) { raiz.clearTimeout(plazo); return r.ok; })
        .catch(function () { raiz.clearTimeout(plazo); return false; });
    }

    // En fase de captura, para actuar antes que el «Enviando…» de interaccion.js.
    doc.addEventListener(
      'submit',
      function (evento) {
        var formulario = evento.target;
        if (!formulario || !formulario.hasAttribute || !formulario.hasAttribute('data-sin-conexion')) return;
        if (formulario.getAttribute('data-verificado') === '1') {
          formulario.removeAttribute('data-verificado');
          return; // ya se comprobó que hay conexión: se envía normal (CMP-01)
        }
        evento.preventDefault();
        evento.stopImmediatePropagation();
        // Un segundo toque mientras se comprueba no debe guardar la donación dos veces.
        if (formulario.getAttribute('data-comprobando') === '1') return;
        formulario.setAttribute('data-comprobando', '1');
        hayConexion().then(function (hay) {
          formulario.removeAttribute('data-comprobando');
          if (hay) {
            formulario.setAttribute('data-verificado', '1');
            formulario.requestSubmit();
          } else {
            guardarSinConexion(formulario);
          }
        });
      },
      true
    );

    // Al salir, se borra la pantalla guardada para que la siguiente persona no vea datos de la anterior.
    doc.addEventListener(
      'submit',
      function (evento) {
        var formulario = evento.target;
        if (formulario && formulario.getAttribute && formulario.getAttribute('action') === '/salir' && raiz.caches) {
          raiz.caches.delete('rescate-paginas-v1');
        }
      },
      true
    );

    if ('serviceWorker' in raiz.navigator) {
      raiz.navigator.serviceWorker.register('/sw.js').catch(function () { /* sin service worker: todo sigue igual */ });
    }

    raiz.addEventListener('online', intentarSincronizar);
    raiz.setInterval(intentarSincronizar, 30000);
    dibujarAviso();
    intentarSincronizar();
  }

  var api = { crearCola: crearCola, CLAVE: CLAVE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (raiz.document) iniciarInterfaz();
})(typeof window !== 'undefined' ? window : globalThis);
