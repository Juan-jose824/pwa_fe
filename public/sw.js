const API_URL = "https://pwa-back-k42e.onrender.com";

const APP_SHELL_CACHE = "appShell_v2";
const DYNAMIC_CACHE = "dynamic_v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/assets/img/shogun.jpg",
  "/assets/img/icon3.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      for (const url of APP_SHELL) {
        try {
          const absoluteUrl = new URL(url, self.location.origin).href;
          await cache.add(absoluteUrl);
        } catch (err) {
          console.warn(`[SW] No se pudo cachear ${url}:`, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![APP_SHELL_CACHE, DYNAMIC_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // 🚫 NO CACHE PARA API (login, register, subscribe, etc)
  if (url.includes("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ message: "Sin conexión a internet" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" }
          }
        );
      })
    );
    return;
  }

  // ✔ Cache-first para archivos estáticos
  event.respondWith(
    caches.match(event.request).then((cacheResp) => {
      if (cacheResp) return cacheResp;

      return fetch(event.request)
        .then((resp) => {
          if (!event.request.url.startsWith("http")) return resp;

          return caches.open(DYNAMIC_CACHE).then((cache) => {
            if (resp && resp.ok) cache.put(event.request, resp.clone());
            return resp;
          });
        })
        .catch(() => caches.match("/index.html"));
    })
  );
});

// SYNC
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-login") {
    console.log("[SW] Ejecutando sincronización de logins...");
    event.waitUntil(syncPendingLogins());
  }
});

// SYNC LOGIN
async function syncPendingLogins() {
  const dbReq = indexedDB.open("database", 1);

  dbReq.onsuccess = async (event) => {
    const db = event.target.result;
    const tx = db.transaction("pendingRequests", "readonly");
    const store = tx.objectStore("pendingRequests");

    const logins = [];
    const req = store.openCursor();

    req.onsuccess = async (cursorEvent) => {
      const cursor = cursorEvent.target.result;
      if (cursor) {
        if (cursor.value.type === "login") {
          logins.push({ key: cursor.key, value: cursor.value });
        }
        cursor.continue();
      } else {
        for (const login of logins) {
          try {
            console.log("[SW] Reintentando login con:", login.value.usuario);

            const resp = await fetch(`${API_URL}/api/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                usuario: login.value.usuario,
                password: login.value.password
              })
            });

            if (resp.ok) {
              const data = await resp.json();
              console.log("[SW] Login exitoso (offline → online)");

              self.registration.showNotification("Login exitoso", {
                body: `Bienvenido de nuevo, ${data.usuario}`,
                icon: "/assets/img/icon3.png"
              });

              const txDel = db.transaction("pendingRequests", "readwrite");
              txDel.objectStore("pendingRequests").delete(login.key);
            } else if (resp.status === 401) {
              console.warn(`[SW] Login fallido para ${login.value.usuario}`);
            }
          } catch (err) {
            console.error("[SW] Error reenviando login:", err);
          }
        }
      }
    };
  };

  dbReq.onerror = (err) => console.error("[SW] Error abriendo IndexedDB:", err);
}

// PUSH
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.mensaje || "Tienes una nueva notificación 🎉",
    icon: "/assets/img/icon3.png",
    image: "/assets/img/shogun.jpg",
    badge: "/assets/img/icon3.png",
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo || "Notificación", options)
  );

  // Notificación especial para tabla de admin
  if (data.type === "new-user") {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: "update-users" })
        );
      })
    );
  }
});
