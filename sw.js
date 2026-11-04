// =====================================================================
//  SERVICE WORKER — guarda la app dentro de la tablet
//  La primera vez que se abre con internet, copia todos los archivos.
//  Después, la página abre aunque no haya conexión.
//  Si cambiáis archivos, subid el número de versión para que se actualicen.
// =====================================================================

const VERSION = "fotosintesis-v2";

const ARCHIVOS = [
  "./frontend/index.html",
  "./frontend/estilos.css",
  "./frontend/app.js",
  "./planificador/planificador.js",
  "./ia/ia.js",
  "./shared/red.js",
  "./shared/datos/escuela.json",
  "./shared/datos/tablets.json",
  "./shared/datos/horario.json",
  "./shared/datos/historial_uso.json"
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  // Borrar versiones antiguas
  evento.waitUntil(
    caches.keys().then(claves => Promise.all(claves.filter(c => c !== VERSION).map(c => caches.delete(c))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const url = new URL(evento.request.url);

  // Las APIs de fuera (Open-Meteo, Gemini) no se guardan aquí: de eso se encargan
  // el planificador y la IA con su propia caché.
  if (url.origin !== self.location.origin || evento.request.method !== "GET") return;

  // Primero intenta internet (para tener lo último); si no hay, usa lo guardado.
  evento.respondWith(
    fetch(evento.request)
      .then(respuesta => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then(cache => cache.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true }))
  );
});
