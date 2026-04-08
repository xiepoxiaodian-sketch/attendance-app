/**
 * PWA 更新機制
 * 支援 iOS Safari 和 Android Chrome
 * 策略：版本號比對 + Service Worker 更新偵測 + 背景切回重新檢查
 */

const VERSION_KEY = "app_version";
const LAST_ACTIVE_KEY = "app_last_active";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 分鐘
const STALE_THRESHOLD = 30 * 60 * 1000; // 30 分鐘未使用視為過期（iOS 專屬）

let lastCheckTime = 0;
let updateBannerShown = false;

/**
 * 向伺服器查詢最新版本號（完全繞過快取）
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * 強制重新載入頁面（iOS 和 Android 相容）
 * 加上版本號參數讓瀏覽器認為是新 URL，強制重新下載
 */
function forceReload(version: string) {
  // 通知 Service Worker 跳過等待
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
  }

  // 延遲 150ms 確保 SW 訊息發送完成，再重載
  setTimeout(() => {
    try {
      const url = new URL(window.location.href);
      // 移除舊的版本參數，加上新的
      url.searchParams.set("_v", version);
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  }, 150);
}

/**
 * 核心：檢查版本並在需要時更新
 */
export async function checkForUpdate(force = false) {
  if (typeof window === "undefined") return; // SSR 環境跳過

  const now = Date.now();

  // 避免頻繁檢查（除非強制）
  if (!force && now - lastCheckTime < CHECK_INTERVAL) return;
  lastCheckTime = now;

  const latestVersion = await fetchLatestVersion();
  if (!latestVersion) return; // 網路失敗，靜默忽略

  const storedVersion = localStorage.getItem(VERSION_KEY);

  if (!storedVersion) {
    // 首次載入，儲存版本號
    localStorage.setItem(VERSION_KEY, latestVersion);
    return;
  }

  if (storedVersion !== latestVersion) {
    // 偵測到新版本，更新儲存並強制重載
    console.log(`[PWA] 版本更新：${storedVersion} → ${latestVersion}`);
    localStorage.setItem(VERSION_KEY, latestVersion);
    forceReload(latestVersion);
  }
}

/**
 * 顯示更新提示橫幅（Service Worker 更新偵測的備援）
 */
function showUpdateBanner() {
  if (updateBannerShown || typeof document === "undefined") return;
  updateBannerShown = true;

  const banner = document.createElement("div");
  banner.id = "pwa-update-banner";
  banner.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "z-index:99999",
    "background:#1d4ed8",
    "color:#fff",
    "padding:12px 16px",
    "display:flex",
    "justify-content:space-between",
    "align-items:center",
    "font-size:14px",
    "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
    "box-shadow:0 2px 8px rgba(0,0,0,0.3)",
  ].join(";");

  banner.innerHTML = `
    <span>✨ 系統已更新，請點此重新整理</span>
    <button id="pwa-update-btn" style="
      background:#fff;color:#1d4ed8;border:none;
      padding:6px 16px;border-radius:6px;
      font-weight:bold;cursor:pointer;font-size:14px;
      -webkit-tap-highlight-color:transparent;
    ">立即更新</button>
  `;

  document.body.prepend(banner);

  document.getElementById("pwa-update-btn")?.addEventListener("click", () => {
    window.location.reload();
  });
}

/**
 * 註冊 Service Worker 並偵測更新
 */
function setupServiceWorkerUpdate() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration) return;

    // 偵測新版 SW 安裝完成
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // 新版 SW 已就緒，先嘗試版本比對更新，否則顯示橫幅
          checkForUpdate(true).catch(() => showUpdateBanner());
        }
      });
    });

    // 定期觸發 SW 檢查更新（每 60 秒）
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 1000);
  });

  // SW 控制權轉移後自動重載（Android Chrome 主要路徑）
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

/**
 * iOS 專屬：從背景切回時重新檢查版本
 */
function setupIOSBackgroundCheck() {
  if (typeof document === "undefined") return;

  // 記錄進入背景的時間
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    }

    if (document.visibilityState === "visible") {
      const lastActive = parseInt(
        localStorage.getItem(LAST_ACTIVE_KEY) || "0"
      );
      const elapsed = Date.now() - lastActive;

      if (elapsed > STALE_THRESHOLD) {
        // 超過 30 分鐘未使用，強制重新檢查版本
        checkForUpdate(true);
      } else {
        // 一般切回，正常檢查（受 5 分鐘節流限制）
        checkForUpdate();
      }
    }
  });
}

/**
 * 初始化所有 PWA 更新機制
 * 在 App 入口呼叫一次即可
 */
export function initPWAUpdate() {
  if (typeof window === "undefined") return;

  // 1. 立即執行版本比對
  checkForUpdate(true);

  // 2. 設定 Service Worker 更新偵測
  setupServiceWorkerUpdate();

  // 3. 設定 iOS 背景切回處理
  setupIOSBackgroundCheck();
}
