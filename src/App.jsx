import { useState, useEffect } from "react";
import "./App.css";
import Register from "./Register";
import Dashboard from "./Dashboard";
import UsersAdmin from "./UsersAdmin";

const publicKey = import.meta.env.VITE_PUBLIC_KEY;

export default function App({ API_URL }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendientes, setPendientes] = useState([]);
  const [view, setView] = useState("login");
  const [auth, setAuth] = useState(null);

  // --- Inicializar IndexedDB ---
  const initDB = () => {
    const req = indexedDB.open("database", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingRequests")) {
        const store = db.createObjectStore("pendingRequests", {
          keyPath: "id",
          autoIncrement: true,
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

  // --- Efecto inicial ---
  useEffect(() => {
    initDB();
    cargarPendientes();

    // Restaurar sesión
    const stored = localStorage.getItem("auth");
    if (stored) {
      const data = JSON.parse(stored);
      setAuth(data);
      setView(data.role === "admin" ? "admin" : "dashboard");
    }
  }, []);

  // --- Listener de SW (si hay sesión) ---
  useEffect(() => {
    if ("serviceWorker" in navigator && auth?.role === "admin") {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "update-users") {
          console.log("[SW] Actualizando tabla de usuarios...");
          setView("");
          setTimeout(() => setView("admin"), 0);
        }
      });
    }
  }, [auth]);

  // --- LOGIN ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Verificando...");
    try {
      const resp = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const authObj = {
          token: data.token,
          usuario: data.usuario,
          correo: data.correo,
          role: data.role,
        };
        setAuth(authObj);
        localStorage.setItem("auth", JSON.stringify(authObj));
        setMensaje("Login correcto.");
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

  // --- Guardar login en IndexedDB ---
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
          navigator.serviceWorker.ready.then((sw) => sw.sync.register("sync-login"));
        }
      };
    };
  };

  // --- Suscripción push ---
  // --- Suscripción push (versión mejorada) ---
const registrarPush = async (token) => {
  if (!("serviceWorker" in navigator)) {
    console.warn("⚠️ Este navegador no soporta Service Workers");
    return;
  }

  if (!publicKey) {
    console.warn("⚠️ No se encontró VITE_PUBLIC_KEY en .env");
    return;
  }

  try {
    console.log("[Push] Esperando Service Worker listo...");
    const registro = await navigator.serviceWorker.ready;

    let sub = await registro.pushManager.getSubscription();

    // Solicitar permiso si aún no está concedido
    if (!sub) {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        console.warn("⚠️ Permiso de notificación no otorgado");
        return;
      }

      console.log("[Push] Creando nueva suscripción...");
      sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // Enviar al backend (con reintento)
    const body = JSON.stringify({ subscription: sub.toJSON() });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    let intentos = 0;
    let enviado = false;

    while (!enviado && intentos < 3) {
      try {
        const resp = await fetch(`${API_URL}/api/subscribe`, {
          method: "POST",
          headers,
          body,
        });
        if (resp.ok) {
          console.log("✅ [Push] Suscripción guardada en backend");
          enviado = true;
        } else {
          const data = await resp.json();
          console.warn(`⚠️ [Push] Error al guardar: ${data.message}`);
        }
      } catch (err) {
        console.warn(`⚠️ [Push] Intento ${intentos + 1} fallido:`, err.message);
        await new Promise((r) => setTimeout(r, 2000)); // esperar 2s
      }
      intentos++;
    }

    if (!enviado) console.error("❌ [Push] No se pudo registrar la suscripción");

  } catch (err) {
    console.error("❌ Error registrando push:", err);
  }
};


  // --- Reintentar logins pendientes ---
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
          if (cursor.value.type === "login")
            logins.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          (async function resendAll() {
            for (const login of logins) {
              try {
                const resp = await fetch(`${API_URL}/api/login`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    usuario: login.value.usuario,
                    password: login.value.password,
                  }),
                });
                if (resp.ok) {
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

  // --- Renderizado ---
  if (view === "register")
    return <Register API_URL={API_URL} goToLogin={() => setView("login")} />;
  if (view === "dashboard" && auth)
    return <Dashboard usuario={auth.usuario} correo={auth.correo} onLogout={logout} />;
  if (view === "admin" && auth)
    return <UsersAdmin API_URL={API_URL} token={auth.token} onLogout={logout} />;

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/assets/img/shogun.jpg" alt="Logo" className="login-logo" />
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

        <button
          className="retry-btn"
          onClick={() => setView("register")}
          style={{ marginTop: 8 }}
        >
          Crear una cuenta
        </button>
        <p className="login-message">{mensaje}</p>
      </div>
    </div>
  );
}

// Helper
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
