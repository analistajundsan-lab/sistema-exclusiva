// A versao base e trocada automaticamente a cada deploy pelo passo "postbuild"
// (scripts/stamp-sw.mjs), que estampa um identificador unico no dist/sw.js.
// Nao remova nem reformate esta linha — o script a localiza por regex.
const CACHE_NAME = "sistema-exclusiva-v13";
const APP_SHELL = ["/", "/manifest.webmanifest", "/logo-bus.svg"];

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

// ── Web Push ──────────────────────────────────────────────────────────────
self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Sistema Exclusiva";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/on-call" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/on-call";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca interceptar chamadas de API — deixa passar direto para a rede
  // (network-only: resposta autenticada JAMAIS entra no Cache Storage).
  // Em producao a API e servida sob /api/... (rewrite do vercel.json); em dev
  // local os paths chegam sem o prefixo — normalizamos antes de testar.
  const apiPath = url.pathname.startsWith("/api/")
    ? url.pathname.slice(4) // remove o prefixo "/api"
    : url.pathname;
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith("/api/") ||
    apiPath.startsWith("/auth/") ||
    apiPath.startsWith("/schedule/") ||
    apiPath.startsWith("/swaps/") ||
    apiPath.startsWith("/incidents/") ||
    apiPath.startsWith("/users/") ||
    apiPath.startsWith("/health")
  ) {
    return;
  }

  // Para o HTML do app: sempre rede primeiro, cache como fallback.
  // Quando a rede responde, atualiza a copia cacheada do "/" — assim o fallback
  // offline acompanha o deploy em vez de ficar preso ao index do install (que
  // apontava para bundles ja purgados e causava tela branca).
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
        }
        return response;
      }).catch(() => caches.match("/"))
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
