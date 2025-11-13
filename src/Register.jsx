import { useState } from "react";

export default function Register({ API_URL, goToLogin }) {
  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");

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
        setMensaje("✅ Usuario registrado correctamente. Redirigiendo...");
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
