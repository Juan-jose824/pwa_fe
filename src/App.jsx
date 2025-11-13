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
  const [auth, setAuth] = useState(null);
  const [view, setView] = useState("login");

  // --------------------------
  //  Inicializar IndexedDB
  // --------------------------
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

  // --------------------------
  //  Listener genérico: LOGIN SUCCESS 🔥
  // --------------------------
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        console.log("📩 Mensaje recibido del SW:", event.data);

        if (event.data?.type === "login-success") {
          const data = event.data;

          const authObj = {
            token: data.token,
            usuario: data.usuario,
            correo: data.correo,
            role: data.role,
          };

          setAuth(authObj);
          localStorage.setItem("auth", JSON.stringify(authObj));

          setView(data.role === "admin" ? "admin" : "dashboard");
        }
      });
    }
  }, []);

  // --------------------------
  //  Efecto inicial
  // --------------------------
  useEffect(() => {
    initDB();

    const stored = localStorage.getItem("auth");
    if (stored) {
      const data = JSON.parse(stored);
      setAuth(data);
      setView(data.role === "admin" ? "admin" : "dashboard");
    }
  }, []);

  // --------------------------
  //  Listener de SW para admin
  // --------------------------
  useEffect(() => {
    if ("serviceWorker" in navigator && auth?.role === "admin") {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "update-users") {
          setView("");
          setTimeout(() => setView("admin"), 100);
        }
      });
    }
  }, [auth]);

  // --------------------------
  //   LOGIN con soporte Offline
  // --------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Verificando...");

    try {
      const resp = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      }).then((r) => {
        if (!r.ok) throw new Error("Offline or server error");
        return r;
      });

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

    } catch (err) {
      console.warn("⚠️ Conexión perdida → guardando login en IndexedDB");
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

        if ("serviceWorker" in navigator && "SyncManager" in window) {
          navigator.serviceWorker.ready.then((sw) =>
            sw.sync.register("sync-login")
          );
        }
      };
    };
  };

  // -------------------------------------
  //    Suscripción Push
  // -------------------------------------
  const registrarPush = async (token) => {
    if (!("serviceWorker" in navigator)) return;
    if (!publicKey) return;

    try {
      const registro = await navigator.serviceWorker.ready;
      let sub = await registro.pushManager.getSubscription();

      if (!sub) {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") return;

        sub = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await fetch(`${API_URL}/api/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
    } catch (err) {
      console.error("❌ Error registrando push:", err);
    }
  };

  // --------------------------
  // Logout
  // --------------------------
  const logout = () => {
    setAuth(null);
    localStorage.removeItem("auth");
    setView("login");
    setUsuario("");
    setPassword("");
    setMensaje("");
  };

  // --------------------------
  //  Vistas
  // --------------------------

  if (view === "register")
    return <Register API_URL={API_URL} goToLogin={() => setView("login")} />;

  if (view === "dashboard" && auth)
    return <Dashboard usuario={auth.usuario} correo={auth.correo} onLogout={logout} />;

  if (view === "admin" && auth)
    return <UsersAdmin API_URL={API_URL} token={auth.token} onLogout={logout} />;

  // --------------------------
  // Login Screen
  // --------------------------
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
