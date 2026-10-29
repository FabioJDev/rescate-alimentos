// Mejoras visuales y de uso que se agregan encima de las páginas del servidor.
// Regla: si este archivo no carga, la aplicación funciona igual (solo se ve menos pulida).
// No cambia ningún dato ni ninguna ruta: solo la apariencia y la comodidad.
(function () {
  'use strict';

  // 1. La barra de arriba gana una sombra cuando la página se desplaza, para que se note que flota.
  var barra = document.querySelector('.barra');
  if (barra) {
    var alDesplazar = function () {
      barra.classList.toggle('con-sombra', window.scrollY > 4);
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    alDesplazar();
  }

  // 2. Al enviar un formulario, el botón muestra «Enviando…» y se bloquea un instante.
  //    Evita que alguien toque dos veces con mala señal y piense que no pasó nada.
  document.querySelectorAll('form').forEach(function (formulario) {
    formulario.addEventListener('submit', function (evento) {
      var boton = evento.submitter || formulario.querySelector('button[type="submit"]');
      if (!boton || boton.classList.contains('cargando')) return;
      boton.dataset.textoOriginal = boton.textContent;
      boton.classList.add('cargando');
      boton.setAttribute('aria-busy', 'true');
      boton.textContent = 'Enviando…';
      // Se bloquea después del envío: un botón deshabilitado en el mismo instante podría no enviarse.
      setTimeout(function () { boton.disabled = true; }, 0);
    });
  });

  // Si la persona vuelve con la flecha del navegador, los botones tienen que quedar como antes.
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button.cargando').forEach(function (boton) {
      boton.classList.remove('cargando');
      boton.removeAttribute('aria-busy');
      boton.disabled = false;
      if (boton.dataset.textoOriginal) boton.textContent = boton.dataset.textoOriginal;
    });
  });

  // 3. El PIN se puede mostrar para comprobar que se escribió bien (útil en el celular).
  var campoPin = document.getElementById('pin');
  if (campoPin) {
    var envoltorio = document.createElement('div');
    envoltorio.className = 'campo-clave';
    campoPin.parentNode.insertBefore(envoltorio, campoPin);
    envoltorio.appendChild(campoPin);

    var ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'ver-clave';
    ver.textContent = 'Mostrar';
    ver.setAttribute('aria-pressed', 'false');
    ver.addEventListener('click', function () {
      var oculto = campoPin.type === 'password';
      campoPin.type = oculto ? 'text' : 'password';
      ver.textContent = oculto ? 'Ocultar' : 'Mostrar';
      ver.setAttribute('aria-pressed', String(oculto));
    });
    envoltorio.appendChild(ver);
  }

  // 4. Si a una donación le queda menos de una hora, el aviso «Quedan…» late para llamar la atención.
  document.querySelectorAll('.restante').forEach(function (aviso) {
    var horas = /(\d+)\s*h/.exec(aviso.textContent);
    var minutos = /(\d+)\s*min/.exec(aviso.textContent);
    if (!horas && !minutos) return;
    var total = (horas ? Number(horas[1]) * 60 : 0) + (minutos ? Number(minutos[1]) : 0);
    if (total < 60) aviso.classList.add('urgente');
  });

  // 5. En «Donación registrada», un botón para copiar el código y mandarlo por WhatsApp.
  var mensajeExito = document.querySelector('.exito');
  var codigos = mensajeExito ? mensajeExito.querySelectorAll('strong') : [];
  if (codigos.length > 0 && navigator.clipboard) {
    var codigo = codigos[codigos.length - 1].textContent;
    var copiar = document.createElement('button');
    copiar.type = 'button';
    copiar.className = 'secundario copiar';
    copiar.textContent = 'Copiar código ' + codigo;
    copiar.addEventListener('click', function () {
      navigator.clipboard.writeText(codigo).then(function () {
        copiar.textContent = 'Código copiado ✓';
        copiar.classList.add('copiado');
        setTimeout(function () {
          copiar.textContent = 'Copiar código ' + codigo;
          copiar.classList.remove('copiado');
        }, 2000);
      });
    });
    mensajeExito.insertAdjacentElement('afterend', copiar);
  }

  // 6. Modo sin conexión (CMP-08): se carga aparte para que, si falla, lo demás siga funcionando igual.
  var scriptSinConexion = document.createElement('script');
  scriptSinConexion.src = '/sin-conexion.js';
  scriptSinConexion.defer = true;
  document.head.appendChild(scriptSinConexion);
})();
