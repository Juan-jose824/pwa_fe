import { useState, useEffect } from "react";
import "./App.css";
import Register from "./Register";
import Dashboard from "./Dashboard";
import UsersAdmin from "./UsersAdmin";

export default function App({ API_URL }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendientes, setPendientes] = useState([]);
  const [view, setView] = useState("login"); // login | register | dashboard | admin
  const [auth, setAuth] = useState(null); // { token, usuario, correo, role }

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
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("auth");
    if (stored) {
      const data = JSON.parse(stored);
      setAuth(data);
      setView(data.role === "admin" ? "admin" : "dashboard");
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

        if ("serviceWorker" in navigator) {
          const registro = await navigator.serviceWorker.ready;
          if (Notification.permission === "default") await Notification.requestPermission();
          if (Notification.permission === "granted") {
            try {
              const publicKey = import.meta.env.VITE_PUBLIC_KEY;
              if (publicKey) {
                const sub = await registro.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
                await fetch(`${API_URL}/api/subscribe`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${data.token}`
                  },
                  body: JSON.stringify({ subscription: sub.toJSON() })
                });
              }
            } catch (err) {
              console.error("Error suscribiendo push:", err);
            }
          }
        }

        if (data.role === "admin") setView("admin");
        else setView("dashboard");
      } else {
        const data = await resp.json();
        setMensaje(data.message || "Usuario o contraseña incorrectos");
      }
    } catch (err) {
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
                  const data = await resp.json();
                  if (data.token) {
                    await fetch(`${API_URL}/api/send-push`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${data.token}`
                      }
                    });
                  }
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
        {/* ✅ Imagen servida desde /public */}
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

// helper
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
