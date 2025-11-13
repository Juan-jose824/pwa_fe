import { useState } from "react";

export default function Register({ API_URL, goToLogin }) {
  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");

  // TU PUBLIC KEY VAPID
  const publicKey = "<TU_PUBLIC_KEY_AQUI>";

  const handleRegister = async (e) => {
    e.preventDefault();
    setMensaje("Creando usuario...");

    try {
      const resp = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, correo, password })
      });

      if (resp.ok) {
        const data = await resp.json();
        setMensaje("✅ Usuario registrado correctamente. Redirigiendo...");

        // Suscribir push al registrar
        if ("serviceWorker" in navigator) {
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
                console.log("Nueva suscripción push:", sub.toJSON());
              }
            }

            if (sub) {
              await fetch(`${API_URL}/api/subscribe-new-user`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: data.id,
                  subscription: sub.toJSON()
                })
              });
              console.log("[Push] Suscripción enviada para nuevo usuario");
            }
          } catch (err) {
            console.error("Error suscribiendo push al registrar:", err);
          }
        }

        setTimeout(goToLogin, 1200);
      } else {
        const data = await resp.json();
        setMensaje(data.message || data.error || "Error al registrar usuario.");
      }
    } catch (err) {
      console.error("Error:", err);
      setMensaje("Error de conexión.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Crear cuenta nueva</h2>
        <form onSubmit={handleRegister} className="login-form">
          <input
            type="text"
            placeholder="Nombre de usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
          <input
            type="email"
            placeholder="Correo electrónico"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Registrar</button>
        </form>

        <button className="retry-btn" onClick={goToLogin} style={{ marginTop: 8 }}>
          ⬅️ Volver al login
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
