// CMP-23 · Foto opcional de la donación (ADR-007). El teléfono achica la foto antes de enviarla: máximo 1.024 px de
// lado y unos 300 KB, para no gastar los datos de nadie. La foto achicada viaja como texto en el campo oculto «foto».
(function () {
  var LADO_MAXIMO = 1024;
  var OBJETIVO_BYTES = 300 * 1024;

  // Tamaño aproximado en bytes de un texto «data:...;base64,...».
  function bytesDe(dataUrl) {
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Math.floor((base64.length * 3) / 4);
  }

  function achicar(imagen) {
    var escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
    var lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    // Se baja la calidad hasta que pese menos de unos 300 KB.
    var calidades = [0.7, 0.55, 0.4, 0.3];
    var resultado = '';
    for (var i = 0; i < calidades.length; i += 1) {
      resultado = lienzo.toDataURL('image/jpeg', calidades[i]);
      if (bytesDe(resultado) <= OBJETIVO_BYTES) break;
    }
    return resultado;
  }

  document.querySelectorAll('[data-foto]').forEach(function (bloque) {
    var elegir = bloque.querySelector('input[type="file"]');
    var oculto = bloque.querySelector('input[name="foto"]');
    var vista = bloque.querySelector('img');
    var estado = bloque.querySelector('[data-foto-estado]');
    var quitar = bloque.querySelector('[data-foto-quitar]');

    function limpiar() {
      oculto.value = '';
      elegir.value = '';
      vista.hidden = true;
      vista.removeAttribute('src');
      quitar.hidden = true;
      estado.textContent = '';
    }

    elegir.addEventListener('change', function () {
      var archivo = elegir.files && elegir.files[0];
      if (!archivo) return limpiar();
      estado.textContent = 'Preparando la foto…';
      var lector = new FileReader();
      lector.onload = function () {
        var imagen = new Image();
        imagen.onload = function () {
          var dataUrl = achicar(imagen);
          oculto.value = dataUrl;
          vista.src = dataUrl;
          vista.hidden = false;
          quitar.hidden = false;
          estado.textContent = 'Foto lista (≈ ' + Math.round(bytesDe(dataUrl) / 1024) + ' KB).';
        };
        imagen.onerror = function () {
          limpiar();
          estado.textContent = 'Ese archivo no es una imagen.';
        };
        imagen.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });

    quitar.addEventListener('click', limpiar);
  });
})();
