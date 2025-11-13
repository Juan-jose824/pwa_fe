import { useEffect, useState } from "react";

export default function UsersAdmin({ API_URL, token, onLogout }) {
  const [usuarios, setUsuarios] = useState([]);
  const [mensaje, setMensaje] = useState("");

  const cargarUsuarios = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setUsuarios(data || []);
        setMensaje("");
      } else {
        const data = await resp.json();
        setMensaje(data.message || "Error cargando usuarios");
      }
    } catch (err) {
      console.error("Error cargando usuarios:", err);
      setMensaje("Error de conexión");
    }
  };

  const enviarNotificacion = async (userId, nombre) => {
    setMensaje(`Enviando notificación a ${nombre}...`);
    try {
      const resp = await fetch(`${API_URL}/api/send-push/${userId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: "Mensaje del admin",
          body: `Hola ${nombre}, tienes una notificación.`
        })
      });
      if (resp.ok) setMensaje("✅ Notificación enviada");
      else {
        const data = await resp.json();
        setMensaje(data.message || "Error enviando notificación");
      }
    } catch (err) {
      console.error("Error enviando notificación:", err);
      setMensaje("Error de conexión");
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h2>👑 Panel de administración</h2>
        <button onClick={onLogout} className="logout-btn">Cerrar sesión</button>
      </header>

      <button onClick={cargarUsuarios} className="refresh-btn">🔄 Actualizar tabla</button>

      <table className="user-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Nombre de usuario</th>
            <th>Correo</th>
            <th>Notif</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u, index) => (
            <tr key={u._id}>
              <td>{index + 1}</td>
              <td>{u.usuario}</td>
              <td>{u.correo}</td>
              <td>
                <button
                  className="notify-btn"
                  onClick={() => enviarNotificacion(u._id, u.usuario)}
                >
                  Enviar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="login-message">{mensaje}</p>
    </div>
  );
}
