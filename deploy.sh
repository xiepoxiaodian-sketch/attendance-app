#!/bin/bash
# ============================================================
# 好好上班 - 自動化部署腳本
# 使用方式：bash deploy.sh "修改說明"
# ============================================================

set -e  # 任何錯誤立即停止

COMMIT_MSG="${1:-Update}"
API_URL="https://attendance-app-production-8901.up.railway.app"
ICON_SRC="/home/ubuntu/webdev-static-assets/app-icon.png"

echo ""
echo "🚀 開始部署：$COMMIT_MSG"
echo "============================================"

# Step 1: 清除舊 build
echo ""
echo "📦 [1/4] 清除舊版本..."
rm -rf .expo dist-web

# Step 2: Build 前端
echo ""
echo "🔨 [2/4] 正在打包前端（約 3-5 分鐘）..."
EXPO_PUBLIC_API_URL=$API_URL \
  npx expo export --platform web --output-dir dist-web --clear 2>&1 | \
  grep -E "Exported|ERROR|error" || true

if [ ! -d "dist-web" ]; then
  echo "❌ Build 失敗！請檢查錯誤訊息"
  exit 1
fi
echo "✅ 前端打包完成"

# Step 3: 加入 PWA 設定 + 版本號（強制瀏覽器更新快取）
echo ""
echo "🎨 [3/4] 加入 PWA 設定..."
python3 << 'PYEOF'
from PIL import Image
import os, json, glob, time

# 複製 App 圖示
icon_src = "/home/ubuntu/webdev-static-assets/app-icon.png"
if os.path.exists(icon_src):
    img = Image.open(icon_src)
    os.makedirs("dist-web/assets/icons", exist_ok=True)
    img.save("dist-web/assets/icons/icon-192.png")
    img.save("dist-web/assets/icons/icon-512.png")
    print("  ✓ App 圖示已加入")

# 建立 manifest.json
manifest = {
    "name": "好好上班",
    "short_name": "好好上班",
    "description": "打鹿岸原住民人文主題餐廳 員工打卡系統",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#1E3A8A",
    "theme_color": "#2563EB",
    "orientation": "portrait",
    "icons": [
        {"src": "/assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": "/assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}
    ]
}
with open("dist-web/manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print("  ✓ manifest.json 已建立")

# 加入 PWA meta tags 到所有 HTML
pwa_tags = (
    '<link rel="manifest" href="/manifest.json">'
    '<meta name="theme-color" content="#2563EB">'
    '<meta name="apple-mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
    '<meta name="apple-mobile-web-app-title" content="好好上班">'
    '<link rel="apple-touch-icon" href="/assets/icons/icon-192.png">'
)

# 版本號（時間戳），強制瀏覽器清除快取
version = str(int(time.time()))
cache_bust = f'<meta name="app-version" content="{version}">'

html_files = glob.glob("dist-web/**/*.html", recursive=True) + glob.glob("dist-web/*.html")
count = 0
for html_file in html_files:
    with open(html_file, "r", encoding="utf-8") as f:
        content = f.read()
    modified = False
    if "manifest.json" not in content:
        content = content.replace("</head>", pwa_tags + cache_bust + "</head>", 1)
        modified = True
    elif "app-version" not in content:
        content = content.replace("</head>", cache_bust + "</head>", 1)
        modified = True
    if modified:
        with open(html_file, "w", encoding="utf-8") as f:
            f.write(content)
        count += 1

print(f"  ✓ PWA tags 已加入 {count} 個 HTML 檔案（版本：{version}）")
PYEOF

echo "✅ PWA 設定完成"

# Step 4: 推送到 GitHub
echo ""
echo "📤 [4/4] 推送到 GitHub..."
git add dist-web
# 加入其他可能被修改的檔案
git add -A 2>/dev/null || true
git commit -m "deploy: $COMMIT_MSG" --allow-empty
git push github main

echo ""
echo "============================================"
echo "✅ 部署完成！"
echo ""
echo "🌐 網址：$API_URL"
echo "⏳ Railway 正在自動部署，約 2-3 分鐘後生效"
echo ""
