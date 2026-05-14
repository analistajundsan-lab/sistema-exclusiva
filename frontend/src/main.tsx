import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

function forceLogoutAndReload() {
  // Limpa toda a sessão do usuário para que ele precise logar novamente
  // após uma nova versão do app ser deployada
  const keys = ['token', 'refreshToken', 'role', 'userId', 'userName', 'displayName', 'photoUrl', 'userUnit', 'userUnits'];
  keys.forEach(k => localStorage.removeItem(k));
  window.location.href = '/login';
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => {
      navigator.serviceWorker.addEventListener("message", event => {
        if (event.data?.type === "SW_UPDATED") {
          forceLogoutAndReload();
        }
      });

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated") {
            forceLogoutAndReload();
          }
        });
      });
    }).catch(() => undefined);
  });
}
