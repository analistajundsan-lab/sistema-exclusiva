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

function notifyAppUpdate() {
  const shouldReload = window.confirm("Nova versao disponivel. Atualizar agora?");
  if (shouldReload) window.location.reload();
}

// Só registra o service worker em produção. Em dev o SW causa cache velho e
// dispara o confirm de "nova versão" a cada troca de bundle do Vite.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => {
      navigator.serviceWorker.addEventListener("message", event => {
        if (event.data?.type === "SW_UPDATED") {
          notifyAppUpdate();
        }
      });

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
            notifyAppUpdate();
          }
        });
      });
    }).catch(() => undefined);
  });
}
