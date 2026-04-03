#!/usr/bin/env node
/**
 * Post-build script: inject MaterialIcons font into all dist-web HTML files.
 * This ensures icons render correctly in production web environment.
 */
const fs = require("fs");
const path = require("path");

const distWebDir = path.join(__dirname, "..", "dist-web");
const fontsDir = path.join(distWebDir, "fonts");
const srcFont = path.join(
  __dirname,
  "..",
  "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf"
);

// 1. Copy font file to dist-web/fonts/
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}
fs.copyFileSync(srcFont, path.join(fontsDir, "MaterialIcons.ttf"));
console.log("✓ Copied MaterialIcons.ttf to dist-web/fonts/");

// 2. Font CSS to inject
const fontCss = `<style>@font-face{font-family:"MaterialIcons";src:url("/fonts/MaterialIcons.ttf") format("truetype");font-weight:normal;font-style:normal;}</style>`;

// 3. Inject into all HTML files
function injectIntoHtml(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  if (content.includes("@font-face") && content.includes("MaterialIcons.ttf")) {
    // Already injected
    return false;
  }
  // Inject before </head> or after <head>
  if (content.includes("</head>")) {
    content = content.replace("</head>", `${fontCss}</head>`);
  } else if (content.includes("<head>")) {
    content = content.replace("<head>", `<head>${fontCss}`);
  } else {
    // No head tag, inject at start
    content = fontCss + content;
  }
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

// Find all HTML files recursively
function findHtmlFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

const htmlFiles = findHtmlFiles(distWebDir);
let injectedCount = 0;
for (const file of htmlFiles) {
  if (injectIntoHtml(file)) {
    injectedCount++;
  }
}
console.log(`✓ Injected font CSS into ${injectedCount} HTML files (${htmlFiles.length} total)`);
