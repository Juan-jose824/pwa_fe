import { useState, useEffect } from "react";
import "./App.css";
import Register from "./Register";
import Dashboard from "./Dashboard";
import UsersAdmin from "./UsersAdmin";

const publicKey = import.meta.env.VITE_PUBLIC_KEY; // clave VAPID pública

export default function App({ API_URL }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendientes, setPendientes] = useState([]);
  const [view, setView] = useState("login"); // login | register | dashboard | admin
  const [auth, setAuth] = useState(null);

  // Inicializar IndexedDB
  const initDB = () => {
    const req = indexedDB.open("database", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingRequests")) {
        const store = db.createObjectStore("pendingRequests", { keyPath: "id", autoIncrement: true });
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

    // Restaurar sesión si hay token en localStorage
    const stored = localStorage.getItem("auth");
    if (stored) {
      const data = JSON.parse(stored);
      setAuth(data);
      setView(data.role === "admin" ? "admin" : "dashboard");
    }

    // Escuchar mensajes del SW (ej: new-user push)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "update-users" && auth?.role === "admin") {
          console.log("[SW] Actualizando tabla de usuarios...");
          // Esto forzará recarga de UsersAdmin
          setView(""); // desmontar
          setTimeout(() => setView("admin"), 0); // volver a montar
        }
      });
    }
  }, []);

  // LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Verificando...");

    try {
      const resp = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password })
      });

      if (resp.ok) {
        const data = await resp.json();
        setMensaje("Login correcto.");

        const authObj = { token: data.token, usuario: data.usuario, correo: data.correo, role: data.role };
        setAuth(authObj);
        localStorage.setItem("auth", JSON.stringify(authObj));

        await registrarPush(data.token);

        setView(data.role === "admin" ? "admin" : "dashboard");
      } else {
        const data = await resp.json();
        setMensaje(data.message || "Usuario o contraseña incorrectos");
      }
    } catch (err) {
      console.warn("⚠️ Conexión perdida, guardando login offline...");
      guardarLoginOffline();
    }
  };

  // Guardar login en IndexedDB
  const guardarLoginOffline = () => {
    const dbReq = indexedDB.open("database", 1);
    dbReq.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("pendingRequests", "readwrite");
      const store = tx.objectStore("pendingRequests");
      store.add({ type: "login", usuario, password });
      tx.oncomplete = () => {
        setMensaje("📦 Login guardado offline. Se enviará al reconectar.");
        cargarPendientes();
        if ("serviceWorker" in navigator && "SyncManager" in window) {
          navigator.serviceWorker.ready.then(sw => sw.sync.register("sync-login"));
        }
      };
    };
  };

  // Suscripción push
  const registrarPush = async (token) => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registro = await navigator.serviceWorker.ready;
      let sub = await registro.pushManager.getSubscription();

      if (!sub) {
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") {
          sub = await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        }
      }

      if (sub) {
        await fetch(`${API_URL}/api/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ subscription: sub.toJSON() })
        });
        console.log("[Push] Suscripción enviada al backend");
      }
    } catch (err) {
      console.error("Error suscribiendo push:", err);
    }
  };

  // Reintentar logins pendientes
  const enviarLoginsPendientes = () => {
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
                  const data = await resp.json();
                  const delTx = db.transaction("pendingRequests", "readwrite");
                  delTx.objectStore("pendingRequests").delete(login.key);
                }
              } catch (err) {
                console.error("Error reenviando login offline", err);
              }
            }
            cargarPendientes();
          })();
        }
      };
    };
  };

  const logout = () => {
    setAuth(null);
    localStorage.removeItem("auth");
    setView("login");
    setUsuario("");
    setPassword("");
    setMensaje("");
  };

  if (view === "register") return <Register API_URL={API_URL} goToLogin={() => setView("login")} />;
  if (view === "dashboard" && auth) return <Dashboard usuario={auth.usuario} correo={auth.correo} onLogout={logout} />;
  if (view === "admin" && auth) return <UsersAdmin API_URL={API_URL} token={auth.token} onLogout={logout} />;

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/assets/img/shogun.jpg" alt="Logo" className="login-logo" />
        <h2 className="login-title">Bienvenido 👋</h2>
        <p className="login-subtitle">Inicia sesión para continuar</p>

        <form onSubmit={handleLogin} className="login-form">
          <input type="text" placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit">Entrar</button>
        </form>

        <button className={`retry-btn ${pendientes.length > 0 ? "pending" : ""}`} onClick={enviarLoginsPendientes}>
          🔄 Reintentar logins pendientes ({pendientes.length})
        </button>

        <button className="retry-btn" onClick={() => setView("register")} style={{ marginTop: 8 }}>
          Crear una cuenta
        </button>

        <p className="login-message">{mensaje}</p>
      </div>
    </div>
  );
}

// Helper
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
