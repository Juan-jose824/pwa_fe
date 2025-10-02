const APP_SHELL_CACHE = "appShell_v1.0";
const DYNAMIC_CACHE = "dynamic_v1.0";

const APP_SHELL = [
  "/",
  "/index.html",
  "offline.html",
  "/src/index.css",
  "/src/App.js",
  "/src/App.css"
];


self.addEventListener("install", (event) => {
  console.log("[SW] Instalando Service Worker...");
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      console.log("[SW] Cacheando App Shell 🚀");
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});


self.addEventListener("activate", (event) => {
  console.log("[SW] Activando nuevo Service Worker...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => {
            console.log("[SW] Borrando cache vieja:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
  console.log("[SW] Service Worker listo y activo");
});


self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  console.log("[SW] Fetch detectado:", event.request.url);

  event.respondWith(
    caches.match(event.request).then((cacheResp) => {
      if (cacheResp) {
        console.log("[SW] Respondiendo desde cache:", event.request.url);
        return cacheResp;
      }

      console.log("[SW] No está en cache, buscando en red:", event.request.url);
      return fetch(event.request)
        .then((networkResp) => {
          console.log("[SW] Guardando en cache dinámico:", event.request.url);
          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request, networkResp.clone());
            return networkResp;
          });
        })
        .catch(() => {
          console.warn("[SW] Offline. Respondiendo con recurso de respaldo.");
          return caches.match("/offline.html");
        });
    })
  );
});
