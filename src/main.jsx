import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

navigator.serviceWorker.register('/sw.js')
.then(registro=>{
  if(Notification.permission==='default'){
    Notification.requestPermission().then(result=>{
      if(result ==='granted'){
        registro.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:"BCHALEzsuX9vfyoR2WyFYJP0nCSNmZyzUOZgNq1I3w3Q4wdgPt7bOPh3JdaePMh7Qx4HZpzfcMVZ1K_BrIxOTrk"
        })
        .then(res=>{
          const sub = res.toJSON();
          console.log("📬 Suscripción generada:", sub);
          // Guardar suscripción en backend
          fetch("http://localhost:3000/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sub)
          });
        })
      }
    })
  }
});

// Inicializar IndexedDB
let dbRequest = window.indexedDB.open('database', 1);
dbRequest.onupgradeneeded = event => {
  const db = event.target.result;
  if (!db.objectStoreNames.contains('pendingRequests')) {
    db.createObjectStore('pendingRequests', { autoIncrement: true });
  }
};
dbRequest.onerror = () => console.error('❌ Error creando IndexedDB');
dbRequest.onsuccess = () => console.log('✅ IndexedDB lista');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
