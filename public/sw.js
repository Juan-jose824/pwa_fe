const API_URL = "https://pwa-back-k42e.onrender.com";

const APP_SHELL_CACHE = "appShell_v1.0";
const DYNAMIC_CACHE = "dynamic_v1.0";

const APP_SHELL = [
  "/",
  "/index.html",
  "/assets/img/shogun.jpg",
  "/assets/img/icon3.png"
];

// -------------------- INSTALL --------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      for (const url of APP_SHELL) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn(`[SW] No se pudo cachear ${url}:`, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// -------------------- ACTIVATE --------------------
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

// -------------------- FETCH --------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cacheResp) =>
      cacheResp ||
      fetch(event.request)
        .then((resp) =>
          caches.open(DYNAMIC_CACHE).then((cache) => {
            try { cache.put(event.request, resp.clone()); } catch(e) {}
            return resp;
          })
        )
        .catch(() => caches.match("./index.html"))
    )
  );
});

// -------------------- SYNC --------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-posts") {
    console.log("[SW] Ejecutando sincronización de POSTs...");
    event.waitUntil(syncPendingPosts());
  } else if (event.tag === "sync-login") {
    console.log("[SW] Ejecutando sincronización de logins...");
    event.waitUntil(syncPendingLogins());
  }
});

async function syncPendingPosts() {
  const dbReq = indexedDB.open("database", 1);
  dbReq.onsuccess = (event) => {
    const db = event.target.result;
    const tx = db.transaction("pendingRequests", "readonly");
    const store = tx.objectStore("pendingRequests");

    const allPosts = [];
    store.openCursor().onsuccess = (cursorEvent) => {
      const cursor = cursorEvent.target.result;
      if (cursor) {
        if (cursor.value.type !== "login") allPosts.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      } else {
        sendPostsSequentially(db, allPosts);
      }
    };
  };
}

async function sendPostsSequentially(db, posts) {
  for (let post of posts) {
    try {
      const resp = await fetch(`${API_URL}/api/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(post.value)
      });
      if (resp.ok) {
        const tx = db.transaction("pendingRequests", "readwrite");
        tx.objectStore("pendingRequests").delete(post.key);
      }
    } catch (err) {
      console.error("Error reenviando POST", err);
    }
  }
  console.log("[SW] Sincronización de POSTs completada");
}

async function syncPendingLogins() {
  const dbReq = indexedDB.open("database", 1);
  dbReq.onsuccess = (event) => {
    const db = event.target.result;
    const tx = db.transaction("pendingRequests", "readwrite");
    const store = tx.objectStore("pendingRequests");

    store.openCursor().onsuccess = async (cursorEvent) => {
      const cursor = cursorEvent.target.result;
      if (cursor) {
        if (cursor.value.type === "login") {
          try {
            const resp = await fetch(`${API_URL}/api/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ usuario: cursor.value.usuario, password: cursor.value.password })
            });

            if (resp.ok) {
              await fetch(`${API_URL}/api/send-push`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario: cursor.value.usuario })
              });

              store.delete(cursor.key);
              console.log("Login reenviado y notificación enviada");
            }
          } catch (err) {
            console.error("Error reenviando login", err);
          }
        }
        cursor.continue();
      }
    };
  };
}

// -------------------- PUSH --------------------
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.mensaje || data.body || "Tienes una nueva notificación 🎉",
    icon: "/assets/img/icon3.png",
    image: "/assets/img/shogun.jpg",
    badge: "/assets/img/icon3.png",
    vibrate: [200, 100, 200],
  };
  event.waitUntil(
    self.registration.showNotification(data.titulo || "Notificación", options)
  );
});
