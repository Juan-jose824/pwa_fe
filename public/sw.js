const API_URL = "https://pwa-back-k42e.onrender.com";

const APP_SHELL_CACHE = "appShell_v3";
const DYNAMIC_CACHE = "dynamic_v3";

const APP_SHELL = [
  "/",
  "/index.html",
  "/assets/img/shogun.jpg",
  "/assets/img/icon3.png"
];

// -------------------------------
// INSTALL
// -------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      for (const url of APP_SHELL) {
        try {
          const absoluteUrl = new URL(url, self.location.origin).href;
          await cache.add(absoluteUrl);
        } catch (err) {
          console.warn("[SW] Error cacheando:", url, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// -------------------------------
// ACTIVATE
// -------------------------------
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

// -------------------------------
// FETCH
// -------------------------------
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // No cache para API
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

  // Cache-first para archivos estáticos
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

// -------------------------------
// SYNC EVENT
// -------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-login") {
    event.waitUntil(syncPendingLogins());
  }
});

// -------------------------------
// BACKGROUND SYNC: LOGIN OFFLINE
// -------------------------------
async function syncPendingLogins() {
  console.log("[SW] Comenzando sincronización...");

  const db = await openDB();
  const pending = await readAllPending(db);

  for (const item of pending) {
    if (item.type !== "login") continue;

    try {
      console.log("[SW] Reintentando login:", item.usuario);

      const resp = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario: item.usuario,
          password: item.password
        })
      });

      if (!resp.ok) throw new Error("Error en login offline");

      const data = await resp.json();

      // Borrar de DB
      await deletePending(db, item.id);

      // Notificación local
      self.registration.showNotification("Login exitoso", {
        body: `Bienvenido de nuevo, ${data.usuario}`,
        icon: "/assets/img/icon3.png"
      });

      // 🟢 CORREGIDO: mandar TODOS los datos necesarios al frontend
      notifyClients({
        type: "login-success",
        token: data.token,
        usuario: data.usuario,
        correo: data.correo,
        role: data.role || data.rol   // admin o user
      });

    } catch (err) {
      console.error("[SW] Error reintentando:", err);
    }
  }
}

// -------------------------------
// IndexedDB helpers
// -------------------------------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("database", 1);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pendingRequests")) {
        db.createObjectStore("pendingRequests", {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAllPending(db) {
  return new Promise((resolve) => {
    const tx = db.transaction("pendingRequests", "readonly");
    const store = tx.objectStore("pendingRequests");
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
  });
}

function deletePending(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction("pendingRequests", "readwrite");
    tx.objectStore("pendingRequests").delete(id);
    tx.oncomplete = () => resolve();
  });
}

// -------------------------------
// ENVIAR MENSAJE A LAS PESTAÑAS
// -------------------------------
function notifyClients(msg) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage(msg));
  });
}

// -------------------------------
// PUSH
// -------------------------------
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.mensaje || "Tienes una nueva notificación",
    icon: "/assets/img/icon3.png",
    badge: "/assets/img/icon3.png",
    image: "/assets/img/shogun.jpg",
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.titulo || "Notificación", options)
  );

  if (data.type === "new-user") {
    notifyClients({ type: "update-users" });
  }
});
