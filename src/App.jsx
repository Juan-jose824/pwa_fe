// src/App.jsx
import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  const sendPost = async () => {
    const data = { nombre: "Juanito", valor: count };

    try {
      const resp = await fetch('http://localhost:3000/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!resp.ok) throw new Error('Error en POST');
      console.log("✅ POST enviado correctamente");

    } catch (error) {
      console.warn("⚠️ No hay conexión, guardando en IndexedDB...", error);

      const dbReq = indexedDB.open('database', 1);
      dbReq.onsuccess = event => {
        const db = event.target.result;
        const tx = db.transaction('pendingRequests', 'readwrite');
        tx.objectStore('pendingRequests').add(data);
        tx.oncomplete = () => {
          console.log('📦 POST guardado offline');
          // Registramos tarea de sincronización
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(sw => {
              sw.sync.register('sync-posts');
              console.log('🔄 Tarea de sincronización registrada');
            });
          }
        };
      };
    }
  };

  return (
    <>
      <h1>Prueba de POST Offline</h1>
      <button onClick={sendPost}>Enviar POST ({count})</button>
      <button onClick={() => setCount(count + 1)}>Incrementar</button>
    </>
  );
}

export default App;
