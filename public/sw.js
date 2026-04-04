// 好好上班 PWA Service Worker
const CACHE_NAME = "haohao-v1";
const OFFLINE_URL = "/";

// 安裝時快取核心資源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
    })
  );
  self.skipWaiting();
});

// 啟動時清理舊快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 網路優先策略：優先從網路取得，失敗時回退到快取
self.addEventListener("fetch", (event) => {
  // 只處理 GET 請求
  if (event.request.method !== "GET") return;
  // 跳過 API 請求（不快取動態資料）
  if (event.request.url.includes("/api/") || event.request.url.includes("/trpc/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 快取成功的靜態資源
        if (response.ok && event.request.url.includes("/_expo/static/")) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => {
        // 網路失敗時回退到快取
        return caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_URL));
      })
  );
});
