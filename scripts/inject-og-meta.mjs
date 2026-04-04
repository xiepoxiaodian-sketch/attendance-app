/**
 * Post-build script: inject Open Graph meta tags into dist-web/index.html
 * Run after `expo export --platform web`
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, "../dist-web/index.html");

const APP_NAME = "員工打卡系統";
const APP_DESCRIPTION = "員工出勤管理、排班、請假一站式後台系統";
const APP_ICON_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663487173990/dvHycosbPvRvBSsW7DJCxS/app-icon-selected_e2fb6214.png";
const SITE_URL = "https://attendance-app-production-8901.up.railway.app";

const OG_TAGS = `
  <meta name="application-name" content="${APP_NAME}" />
  <meta name="description" content="${APP_DESCRIPTION}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${APP_NAME}" />
  <meta property="og:description" content="${APP_DESCRIPTION}" />
  <meta property="og:image" content="${APP_ICON_URL}" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:url" content="${SITE_URL}" />
  <meta property="og:site_name" content="${APP_NAME}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${APP_NAME}" />
  <meta name="twitter:description" content="${APP_DESCRIPTION}" />
  <meta name="twitter:image" content="${APP_ICON_URL}" />
  <link rel="apple-touch-icon" href="${APP_ICON_URL}" />`;

if (!fs.existsSync(indexPath)) {
  console.error("❌ dist-web/index.html not found. Run expo export first.");
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf-8");

// Inject title if empty
html = html.replace(
  /<title data-rh="true"><\/title>/,
  `<title data-rh="true">${APP_NAME}</title>`
);

// Inject OG tags before </head>
if (!html.includes("og:title")) {
  html = html.replace("</head>", `${OG_TAGS}\n</head>`);
  console.log("✅ Open Graph meta tags injected.");
} else {
  console.log("ℹ️  Open Graph meta tags already present, skipping.");
}

fs.writeFileSync(indexPath, html, "utf-8");
console.log("✅ dist-web/index.html updated.");
