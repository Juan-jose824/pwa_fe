export default function UserView({ user }) {
  return (
    <div className="user-view">
      <h2>Bienvenido, {user.username}</h2>
      <p>✨ Gracias por iniciar sesión en nuestra PWA.</p>
    </div>
  );
}
