import { useState } from "react";

export default function RegisterForm({ onBack }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    setMsg(data.message);
  };

  return (
    <div className="register">
      <h2>Registro</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Registrar</button>
      </form>
      <p>{msg}</p>
      <button onClick={onBack}>Volver</button>
    </div>
  );
}
