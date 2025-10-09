import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

navigator.serviceWorker.register('/sw.js');

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
