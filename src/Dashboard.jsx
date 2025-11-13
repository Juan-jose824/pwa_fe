export default function Dashboard({ usuario, correo, onLogout }) {
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h2>👋 Bienvenido, {usuario}</h2>
        <p className="tagline">"La luz de tu mente brilla cuando respiras con calma."</p>
      </header>

      <section className="user-info">
        <p><strong>Correo:</strong> {correo}</p>
      </section>

      <button onClick={onLogout} className="logout-btn">Cerrar sesión</button>
    </div>
  );
}
