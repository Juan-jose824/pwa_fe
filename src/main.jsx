import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

const API_URL = import.meta.env.VITE_API_URL || "https://pwa-back-k42e.onrender.com";

// Registro seguro del Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(async (registro) => {
      console.log('✅ Service Worker registrado:', registro);

      // Solicitar permiso de notificación si es default
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          try {
            const sub = await registro.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: "BCHALEzsuX9vfyoR2WyFYJP0nCSNmZyzUOZgNq1I3w3Q4wdgPt7bOPh3JdaePMh7Qx4HZpzfcMVZ1K_BrIxOTrk"
            });
            const subJSON = sub.toJSON();
            console.log('📬 Suscripción generada:', subJSON);

            // Guardar suscripción en backend
            await fetch(`${API_URL}/api/subscribe`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(subJSON)
            });
          } catch (err) {
            console.error('❌ Error al generar la suscripción push:', err);
          }
        }
      }
    })
    .catch(err => console.error('❌ Error registrando Service Worker:', err));
} else {
  console.warn('⚠️ Service Worker no soportado en este navegador');
}

// Inicializar IndexedDB
const dbRequest = window.indexedDB.open('database', 1);
dbRequest.onupgradeneeded = event => {
  const db = event.target.result;
  if (!db.objectStoreNames.contains('pendingRequests')) {
    db.createObjectStore('pendingRequests', { keyPath: 'id', autoIncrement: true });
  }
};
dbRequest.onerror = () => console.error('❌ Error creando IndexedDB');
dbRequest.onsuccess = () => console.log('✅ IndexedDB lista');

// Renderizar App
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
