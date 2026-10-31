// Service worker del modo sin conexión (CMP-08, docs/decisiones/ADR-004-modo-sin-conexion.md).
// Guarda en el teléfono lo mínimo para abrir «Publicar donación» sin señal. Nada más: tomar y entregar
// necesitan al servidor (CMP-03), así que cualquier otra pantalla sin conexión muestra «Sin conexión».
//
// Si cambia algún archivo de la lista, se sube el número de la versión para que los teléfonos lo renueven.
const VERSION = 'v6';
const CACHE_PAGINAS = `rescate-paginas-${VERSION}`; // la pantalla «Publicar donación» (se borra al salir)
const CACHE_ESTATICOS = `rescate-estaticos-${VERSION}`;

const PANTALLA_GUARDADA = '/donaciones/nueva';
const PANTALLA_SIN_CONEXION = '/sin-conexion';
const ESTATICOS = [
  PANTALLA_SIN_CONEXION,
  '/estilos.css',
  '/interaccion.js',
  '/sin-conexion.js',
  '/canasta.svg',
  '/fondo-alimentos.svg',
  '/fuentes/bricolage-700.woff2',
  '/fuentes/atkinson-400.woff2',
  '/fuentes/atkinson-700.woff2',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ESTATICOS)
      .then((cache) => cache.addAll(ESTATICOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((n) => n.startsWith('rescate-') && n !== CACHE_PAGINAS && n !== CACHE_ESTATICOS)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return; // los envíos (POST) siempre van directo al servidor

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Pantallas: siempre se pide la versión nueva. Sin red, «Publicar donación» sale de lo guardado y
  // cualquier otra pantalla muestra «Sin conexión» (CA-08.6).
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          // Solo se guarda la pantalla del formulario, y solo si se abrió bien (no una redirección a «ingresar»).
          if (url.pathname === PANTALLA_GUARDADA && respuesta.ok && !respuesta.redirected) {
            const copia = respuesta.clone();
            caches.open(CACHE_PAGINAS).then((cache) => cache.put(PANTALLA_GUARDADA, copia));
          }
          return respuesta;
        })
        .catch(async () => {
          if (url.pathname === PANTALLA_GUARDADA) {
            const guardada = await caches.match(PANTALLA_GUARDADA, { cacheName: CACHE_PAGINAS });
            if (guardada) return guardada;
          }
          return caches.match(PANTALLA_SIN_CONEXION, { cacheName: CACHE_ESTATICOS });
        })
    );
    return;
  }

  // Estilos, scripts, fuentes e imágenes de la lista: se responde con lo guardado y se renueva en segundo plano.
  if (ESTATICOS.includes(url.pathname)) {
    evento.respondWith(
      caches.open(CACHE_ESTATICOS).then(async (cache) => {
        const guardado = await cache.match(peticion);
        const actualizando = fetch(peticion)
          .then((respuesta) => {
            if (respuesta.ok) cache.put(peticion, respuesta.clone());
            return respuesta;
          })
          .catch(() => guardado);
        return guardado || actualizando;
      })
    );
  }
});
