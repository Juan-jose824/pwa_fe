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

  // Comment state (dashboard)
  const [comentarioTexto, setComentarioTexto] = useState("");
  const [comentariosList, setComentariosList] = useState([]);

  // Init IndexedDB structure
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

  // Listener for messages from SW (login-success, comentario-sent, update-users)
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
            role: data.role
          };
          setAuth(authObj);
          localStorage.setItem("auth", JSON.stringify(authObj));
          setView(data.role === "admin" ? "admin" : "dashboard");
          setMensaje("Login restaurado desde el SW");
        }

        if (event.data?.type === "comentario-sent") {
          // Optionally refresh comentarios list if user is on dashboard
          if (view === "dashboard") loadComentarios(auth?.usuario);
        }

        if (event.data?.type === "update-users") {
          if (auth?.role === "admin") {
            setView("");
            setTimeout(() => setView("admin"), 100);
          }
        }
      });
    }
  }, [auth, view]);

  // Initial effect: DB init and try to restore session
  useEffect(() => {
    initDB();
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

      if (!resp.ok) throw new Error("Offline or server error");
      const data = await resp.json();

      const authObj = {
        token: data.token,
        usuario: data.usuario,
        correo: data.correo,
        role: data.role
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

  // Guardar login offline
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
          navigator.serviceWorker.ready.then((sw) => sw.sync.register("sync-login"));
        }
      };
    };
  };

  // registrarPush unchanged except minimal checks
  const registrarPush = async (token) => {
    if (!("serviceWorker" in navigator) || !publicKey) return;
    try {
      const registro = await navigator.serviceWorker.ready;
      let sub = await registro.pushManager.getSubscription();
      if (!sub) {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") return;
        sub = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }
      await fetch(`${API_URL}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
    } catch (err) {
      console.error("❌ Error registrando push:", err);
    }
  };

  const logout = () => {
    setAuth(null);
    localStorage.removeItem("auth");
    setView("login");
    setUsuario("");
    setPassword("");
    setMensaje("");
  };

  // ----------------------------------
  // Comentarios: enviar online / guardar offline
  // ----------------------------------
  const enviarComentario = async () => {
    if (!comentarioTexto || comentarioTexto.trim().length === 0) {
      setMensaje("Escribe un comentario antes de enviar");
      return;
    }

    const payload = {
      usuario: auth?.usuario || usuario || "anon",
      texto: comentarioTexto.trim(),
      fecha: new Date().toISOString()
    };

    try {
      const resp = await fetch(`${API_URL}/api/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error("No conectado");
      const data = await resp.json();
      setMensaje("Comentario enviado correctamente");
      setComentarioTexto("");
      loadComentarios(payload.usuario);
    } catch (err) {
      // guardar en indexedDB y registrar sync
      guardarComentarioOffline(payload);
    }
  };

  const guardarComentarioOffline = (payload) => {
    const dbReq = indexedDB.open("database", 1);
    dbReq.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("pendingRequests", "readwrite");
      const store = tx.objectStore("pendingRequests");
      store.add({ type: "comentario", ...payload });
      tx.oncomplete = () => {
        setMensaje("📦 Comentario guardado offline. Se enviará al reconectar.");
        if ("serviceWorker" in navigator && "SyncManager" in window) {
          navigator.serviceWorker.ready.then((sw) => sw.sync.register("sync-comentarios"));
        }
        setComentarioTexto("");
      };
    };
  };

  const loadComentarios = async (usuarioToLoad) => {
    try {
      const url = usuarioToLoad ? `${API_URL}/api/comentarios?usuario=${encodeURIComponent(usuarioToLoad)}` : `${API_URL}/api/comentarios`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Error cargando comentarios");
      const data = await resp.json();
      setComentariosList(data);
    } catch (err) {
      console.warn("No se pudieron cargar comentarios:", err);
    }
  };

  // Load comentarios when entering dashboard
  useEffect(() => {
    if (view === "dashboard") {
      loadComentarios(auth?.usuario || usuario);
    }
  }, [view, auth]);

  // VIEWS
  if (view === "register") return <Register API_URL={API_URL} goToLogin={() => setView("login")} />;
  if (view === "admin" && auth) return <UsersAdmin API_URL={API_URL} token={auth.token} onLogout={logout} />;
  if (view === "dashboard" && auth) {
    // render Dashboard + comment form under it
    return (
      <>
        <Dashboard usuario={auth.usuario} correo={auth.correo} onLogout={logout} />
        <div style={{ padding: 12, maxWidth: 800, margin: "0 auto" }}>
          <h3>Escribir un comentario</h3>
          <textarea
            rows={4}
            placeholder="Escribe tu comentario..."
            value={comentarioTexto}
            onChange={(e) => setComentarioTexto(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
          <div style={{ marginTop: 8 }}>
            <button onClick={enviarComentario}>Enviar comentario</button>
            <button onClick={() => loadComentarios(auth.usuario)} style={{ marginLeft: 8 }}>Actualizar comentarios</button>
          </div>

          <h4 style={{ marginTop: 12 }}>Comentarios</h4>
          <ul>
            {comentariosList.map((c) => (
              <li key={c._id || c.fecha + c.usuario}>
                <strong>{c.usuario}</strong> — {new Date(c.fecha).toLocaleString()}: {c.texto}
              </li>
            ))}
          </ul>

          <p style={{ color: "#666" }}>{mensaje}</p>
        </div>
      </>
    );
  }

  // default login screen
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
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
