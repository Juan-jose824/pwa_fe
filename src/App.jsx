import { useState, useEffect } from "react";
import "./App.css";
import shogun from "./assets/img/shogun.jpg"; // importa la imagen para que Vite la resuelva

const API_URL = import.meta.env.VITE_API_URL || "https://pwa-back-k42e.onrender.com";

export default function App() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [pendientes, setPendientes] = useState([]);

  // inicializa DB si hace falta
  const initDB = () => {
    const req = indexedDB.open("database", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingRequests")) {
        const store = db.createObjectStore("pendingRequests", { keyPath: "id", autoIncrement: true });
        store.createIndex("type", "type", { unique: false });
      }
    };
    req.onerror = () => console.warn("IndexedDB: error al abrir/crear DB");
  };

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
      tx.onerror = () => console.warn("IndexedDB: error leyendo pendientes");
    };
    dbReq.onerror = () => console.warn("IndexedDB: no se pudo abrir DB");
  };

  useEffect(() => {
    initDB();
    cargarPendientes();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Verificando...");

    const loginData = { usuario, password };

    try {
      const resp = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });

      if (resp.ok) {
        setMensaje("Login correcto. Enviando notificación...");
        await fetch(`${API_URL}/api/send-push`, { method: "POST" });
        cargarPendientes(); // actualizar pendientes
      } else {
        setMensaje("Usuario o contraseña incorrectos");
      }
    } catch (err) {
      // Guardar offline con type:"login" para que el SW lo reconozca
      setMensaje("⚠️ Conexión perdida, guardando login offline...");
      const dbReq = indexedDB.open("database", 1);
      dbReq.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction("pendingRequests", "readwrite");
        const store = tx.objectStore("pendingRequests");
        store.add({ type: "login", usuario: loginData.usuario, password: loginData.password });
        tx.oncomplete = async () => {
          setMensaje("📦 Login guardado offline. Se enviará al reconectar.");
          cargarPendientes(); // actualizar pendientes
          if ("serviceWorker" in navigator && "SyncManager" in window) {
            try {
              const sw = await navigator.serviceWorker.ready;
              await sw.sync.register("sync-login");
            } catch (err) {
              console.warn("SyncManager no disponible o registro falló", err);
            }
          }
        };
        tx.onerror = () => console.warn("IndexedDB: error guardando login");
      };
      dbReq.onerror = () => console.warn("IndexedDB: no se pudo abrir DB para escribir");
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
          if (cursor.value.type === "login") {
            logins.push({ key: cursor.key, value: cursor.value });
          }
          cursor.continue();
        } else {
          // reenviar secuencialmente para evitar sobrecarga
          (async function resendAll() {
            for (const login of logins) {
              try {
                const resp = await fetch(`${API_URL}/api/login`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ usuario: login.value.usuario, password: login.value.password }),
                });
                if (resp.ok) {
                  await fetch(`${API_URL}/api/send-push`, { method: "POST" });
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
      store.openCursor().onerror = () => console.warn("IndexedDB: error leyendo cursor");
    };
    dbReq.onerror = () => console.warn("IndexedDB: no se pudo abrir DB");
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
