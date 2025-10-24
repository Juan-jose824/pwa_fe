import { useState, useEffect } from "react";
import "./App.css";
import shogun from "./assets/img/shogun.jpg";

export default function App({ API_URL }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendientes, setPendientes] = useState([]);

  // ---------------- IndexedDB ----------------
  const initDB = () => {
    const req = indexedDB.open("database", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingRequests")) {
        const store = db.createObjectStore("pendingRequests", {
          keyPath: "id",
          autoIncrement: true
        });
        store.createIndex("type", "type", { unique: false });
      }
    };
  };

  const cargarPendientes = () => {
    const dbReq = indexedDB.open("database", 1);
    dbReq.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("pendingRequests", "readonly");
      const store = tx.objectStore("pendingRequests");

      const logins = [];
      store.openCursor().onsuccess = (cursorEvent) => {
        const cursor = cursorEvent.target.result;
        if (cursor) {
          if (cursor.value.type === "login") logins.push(cursor.value);
          cursor.continue();
        } else setPendientes(logins);
      };
    };
  };

  useEffect(() => {
    initDB();
    cargarPendientes();
  }, []);

  // ---------------- Login ----------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Verificando...");

    const loginData = { usuario, password };

    try {
      const resp = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData)
      });

      if (resp.ok) {
        setMensaje("Login correcto. Enviando notificación...");

        // ---------------- Suscripción push ----------------
        if ("serviceWorker" in navigator) {
          const registro = await navigator.serviceWorker.ready;
          if (Notification.permission === "default") await Notification.requestPermission();

          if (Notification.permission === "granted") {
            const sub = await registro.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(
                "BCHALEzsuX9vfyoR2WyFYJP0nCSNmZyzUOZgNq1I3w3Q4wdgPt7bOPh3JdaePMh7Qx4HZpzfcMVZ1K_BrIxOTrk"
              )
            });

            // Guardar suscripción en backend con el usuario
            await fetch(`${API_URL}/api/subscribe`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ usuario, subscription: sub.toJSON() })
            });
          }
        }

        // ---------------- Enviar notificación push ----------------
        await fetch(`${API_URL}/api/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario })
        });

        cargarPendientes();
      } else setMensaje("Usuario o contraseña incorrectos");
    } catch (err) {
      // Guardar login offline
      setMensaje("⚠️ Conexión perdida, guardando login offline...");
      const dbReq = indexedDB.open("database", 1);
      dbReq.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction("pendingRequests", "readwrite");
        const store = tx.objectStore("pendingRequests");
        store.add({ type: "login", usuario, password });
        tx.oncomplete = async () => {
          setMensaje("📦 Login guardado offline. Se enviará al reconectar.");
          cargarPendientes();
          if ("serviceWorker" in navigator && "SyncManager" in window) {
            const sw = await navigator.serviceWorker.ready;
            await sw.sync.register("sync-login");
          }
        };
      };
    }
  };

  // ---------------- Reenviar logins offline ----------------
  const enviarLoginsPendientes = async () => {
    const dbReq = indexedDB.open("database", 1);
    dbReq.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("pendingRequests", "readonly");
      const store = tx.objectStore("pendingRequests");

      const logins = [];
      store.openCursor().onsuccess = (cursorEvent) => {
        const cursor = cursorEvent.target.result;
        if (cursor) {
          if (cursor.value.type === "login") logins.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          (async function resendAll() {
            for (const login of logins) {
              try {
                const resp = await fetch(`${API_URL}/api/login`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ usuario: login.value.usuario, password: login.value.password })
                });

                if (resp.ok) {
                  await fetch(`${API_URL}/api/send-push`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ usuario: login.value.usuario })
                  });

                  const delTx = db.transaction("pendingRequests", "readwrite");
                  delTx.objectStore("pendingRequests").delete(login.key);
                }
              } catch (err) {
                console.error("Error reenviando login offline", err);
              }
            }
            setTimeout(cargarPendientes, 500);
          })();
        }
      };
    };
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={shogun} alt="Logo" className="login-logo" />
        <h2 className="login-title">Bienvenido 👋</h2>
        <p className="login-subtitle">Inicia sesión para continuar</p>

        <form onSubmit={handleLogin} className="login-form">
          <input
            type="text"
            placeholder="Usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Entrar</button>
        </form>

        <button
          className={`retry-btn ${pendientes.length > 0 ? "pending" : ""}`}
          onClick={enviarLoginsPendientes}
        >
          🔄 Reintentar logins pendientes ({pendientes.length})
        </button>

        <p className="login-message">{mensaje}</p>
      </div>
    </div>
  );
}

// ---------------- Función auxiliar ----------------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
