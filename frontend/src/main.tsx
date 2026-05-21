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

if ("serviceWorker" in navigator) {
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
