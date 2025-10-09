// sw.js
const APP_SHELL_CACHE = "appShell_v1.0";
const DYNAMIC_CACHE = "dynamic_v1.0";

const APP_SHELL = [
  "/",
  "/index.html",
  "offline.html",
  "/src/index.css",
  "/src/App.jsx",
  "/src/App.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => ![APP_SHELL_CACHE, DYNAMIC_CACHE].includes(k))
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cacheResp =>
      cacheResp ||
      fetch(event.request)
        .then(resp => {
          return caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, resp.clone());
            return resp;
          });
        })
        .catch(() => caches.match("/offline.html"))
    )
  );
});

// --- Sincronización ---
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    console.log('[SW] Ejecutando sincronización de POSTs...');
    event.waitUntil(syncPendingPosts());
  }
});

async function syncPendingPosts() {
  return new Promise((resolve, reject) => {
    const dbReq = indexedDB.open('database', 1);

    dbReq.onsuccess = event => {
      const db = event.target.result;
      const tx = db.transaction('pendingRequests', 'readonly');
      const store = tx.objectStore('pendingRequests');

      const allPosts = [];
      store.openCursor().onsuccess = cursorEvent => {
        const cursor = cursorEvent.target.result;
        if (cursor) {
          allPosts.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          // --- Enviar todos los posts secuencialmente ---
          sendPostsSequentially(db, allPosts).then(resolve).catch(reject);
        }
      };
    };

    dbReq.onerror = reject;
  });
}

// Función para enviar y borrar uno por uno
async function sendPostsSequentially(db, posts) {
  for (let post of posts) {
    try {
      const resp = await fetch('http://localhost:3000/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(post.value)
      });

      if (resp.ok) {
        console.log('✅ POST reenviado con éxito');
        // Borrar cada registro en transacción separada
        const tx = db.transaction('pendingRequests', 'readwrite');
        tx.objectStore('pendingRequests').delete(post.key);
        await tx.complete;
      }
    } catch (err) {
      console.error('❌ Error reenviando POST', err);
    }
  }
  console.log('[SW] Sincronización completada');
}
