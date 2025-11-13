import { useState } from "react";

export default function LoginForm({ onRegister, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok) onLogin(data);
    else setMsg(data.message);
  };

  return (
    <div className="login">
      <h2>Iniciar Sesión</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Entrar</button>
      </form>
      <p>{msg}</p>
      <button onClick={onRegister}>Registrarse</button>
    </div>
  );
}
