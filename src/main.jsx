import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";
import App from "./App.jsx";

const API_URL = import.meta.env.VITE_API_URL || "https://pwa-back-k42e.onrender.com";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registro = await navigator.serviceWorker.register("/sw.js");
      console.log("✅ Service Worker registrado:", registro);
    } catch (err) {
      console.error("❌ Error registrando Service Worker:", err);
    }
  });
} else {
  console.warn("⚠️ Service Worker no soportado en este navegador");
}

// Init IndexedDB (structure used by app)
const dbRequest = window.indexedDB.open("database", 1);
dbRequest.onupgradeneeded = event => {
  const db = event.target.result;
  if (!db.objectStoreNames.contains("pendingRequests")) {
    const store = db.createObjectStore("pendingRequests", { keyPath: "id", autoIncrement: true });
    store.createIndex("type", "type", { unique: false });
  }
};
dbRequest.onerror = () => console.error("❌ Error creando IndexedDB");
dbRequest.onsuccess = () => console.log("✅ IndexedDB lista");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App API_URL={API_URL} />
  </StrictMode>
);
