import { useState, useEffect } from "react";
import "./App.css";

export default function App() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendientes, setPendientes] = useState([]);

  // Función para cargar logins pendientes
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
          if (cursor.value.usuario && cursor.value.password) {
            logins.push(cursor.value);
          }
          cursor.continue();
        } else {
          setPendientes(logins);
        }
      };
    };
  };

  useEffect(() => {
    cargarPendientes(); 
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Verificando...");

    const loginData = { usuario, password };

    try {
      const resp = await fetch("http://localhost:3000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });

      if (resp.ok) {
        setMensaje("Login correcto. Enviando notificación...");
        await fetch("http://localhost:3000/api/send-push", { method: "POST" });
        cargarPendientes(); // actualizar pendientes
      } else {
        setMensaje("Usuario o contraseña incorrectos");
      }
    } catch (err) {
      setMensaje("⚠️ Conexión perdida, guardando login offline...");
      const dbReq = indexedDB.open("database", 1);
      dbReq.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction("pendingRequests", "readwrite");
        tx.objectStore("pendingRequests").add(loginData);
        tx.oncomplete = () => {
          setMensaje("📦 Login guardado offline. Se enviará al reconectar.");
          cargarPendientes(); // actualizar pendientes
          if ("serviceWorker" in navigator && "SyncManager" in window) {
            navigator.serviceWorker.ready.then((sw) => {
              sw.sync.register("sync-login").catch(() => console.warn("SyncManager no disponible"));
            });
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
          logins.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          logins.forEach(async (login) => {
            try {
              const resp = await fetch("http://localhost:3000/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(login.value),
              });
              if (resp.ok) {
                await fetch("http://localhost:3000/api/send-push", { method: "POST" });
                const delTx = db.transaction("pendingRequests", "readwrite");
                delTx.objectStore("pendingRequests").delete(login.key);
              }
            } catch (err) {
              console.error("Error reenviando login offline", err);
            }
          });
          setTimeout(cargarPendientes, 500); 
        }
      };
    };
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="src/assets/img/shogun.jpg" alt="Logo" className="login-logo" />
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
          🔄 Reintentar logins pendientes
        </button>

        <p className="login-message">{mensaje}</p>
      </div>
    </div>
  );
}
