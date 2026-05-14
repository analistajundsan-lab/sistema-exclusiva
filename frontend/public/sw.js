const CACHE_NAME = "sistema-exclusiva-v5";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => {
      // Notifica todas as abas abertas para recarregar e pegar o bundle novo
      return self.clients.matchAll({ type: "window" }).then(clients => {
        clients.forEach(client => client.postMessage({ type: "SW_UPDATED" }));
      });
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca interceptar chamadas de API — deixa passar direto para a rede
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/schedule/") ||
    url.pathname.startsWith("/swaps/") ||
    url.pathname.startsWith("/incidents/") ||
    url.pathname.startsWith("/users/") ||
    url.pathname.startsWith("/health")
  ) {
    return;
  }

  // Para o HTML do app: sempre rede primeiro, cache como fallback
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  // Para assets estáticos (JS, CSS, imagens): rede primeiro, cache como fallback
  // Garante que todo deploy seja imediatamente visível para todos os usuários
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
