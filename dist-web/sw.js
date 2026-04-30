// 好好上班 PWA Service Worker
// v3：加入 SKIP_WAITING 訊息支援 + 改善 iOS/Android 更新機制
const CACHE_NAME = "haohao-v3";
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

// 啟動時清理舊快取，並立即接管所有分頁
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
    ])
  );
});

// 接收來自主執行緒的訊息（支援強制更新）
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 快取策略：HTML 網路優先（確保最新版），靜態資源快取優先（加速載入）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("/api/") || event.request.url.includes("/trpc/")) return;

  // HTML 頁面：網路優先，確保每次都取得最新版本
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(
            (cached) => cached || caches.match(OFFLINE_URL)
          );
        })
    );
    return;
  }

  // 靜態資源：快取優先（加速載入），快取不存在時從網路取得
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      });
    })
  );
});

// ============================================================
// Push Notification Handler
// ============================================================
self.addEventListener("push", (event) => {
  let data = { title: "好好上班", body: "有新的打卡通知", icon: "/favicon.png" };
  if (event.data) {
    try {
      data = { ...data, ...JSON.parse(event.data.text()) };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/favicon.png",
      badge: "/favicon.png",
      vibrate: [200, 100, 200],
      tag: "attendance-alert",
      renotify: true,
      data: { url: self.location.origin + "/admin" },
    })
  );
});

// 點擊通知時開啟後台管理頁面
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || self.location.origin + "/admin";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/admin") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
