import { useEffect, useState } from "react";

export default function AdminView({ user }) {
  const [users, setUsers] = useState([]);

  const loadUsers = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/users?admin=${user.username}`);
    const data = await res.json();
    setUsers(data);
  };

  const sendNotification = async (id, name) => {
    await fetch(`${import.meta.env.VITE_API_URL}/api/send-push/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Mensaje del admin",
        body: `Hola ${name}, tienes una nueva notificación.`,
      }),
    });
    alert("Notificación enviada");
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="admin-view">
      <h2>Panel de Administrador</h2>
      <button onClick={loadUsers}>Actualizar (botonA)</button>
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Nombre de usuario</th>
            <th>Correo</th>
            <th>BotonE</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u._id}>
              <td>{i + 1}</td>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>
                <button onClick={() => sendNotification(u._id, u.username)}>Enviar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
