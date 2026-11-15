#!/usr/bin/env node
/**
 * build-site.mjs
 * 组装可部署的静态站点到 dist/，只包含真正需要的文件。
 *
 * dist/
 *   index.html            门户（新的药典检索 / 方药研习 在前）
 *   manifest.json         PWA 配置
 *   sw.js                 Service Worker
 *   clinical_reference.html
 *   clinical/             药典检索 + 方药研习
 *   data/                 药典语料与派生数据
 *   herbs/                旧版教材背诵工具（整体移入子目录）
 *   icons/
 *
 * 用法：node scripts/build-site.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

function reset() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
}

function copyFile(from, to) {
  const target = path.join(DIST, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(ROOT, from), target);
}

function copyDir(from, to, filter = () => true) {
  const src = path.join(ROOT, from);
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = `${from}/${entry.name}`;
    if (!filter(rel, entry)) continue;
    if (entry.isDirectory()) {
      count += copyDir(rel, `${to}/${entry.name}`, filter);
    } else {
      copyFile(rel, `${to}/${entry.name}`);
      count++;
    }
  }
  return count;
}

/* ---------------- 门户页 ---------------- */

const portal = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>中药学备考全书</title>
<link rel="icon" href="icons/icon-96x96.png">
<link rel="apple-touch-icon" href="icons/icon-192x192.png">
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#0f766e">
<style>
  :root {
    --bg: #f6f7f8;
    --surface: #fff;
    --text: #111827;
    --muted: #6b7280;
    --line: #e5e7eb;
    --accent: #0f766e;
    --accent-soft: #ecfdf5;
    --gold: #b45309;
    --shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 56px 24px 80px; }
  h1 { margin: 0 0 10px; font-size: 40px; letter-spacing: -0.02em; }
  .sub { margin: 0 0 6px; color: var(--muted); font-size: 16px; }
  .meta { margin: 0 0 44px; color: var(--muted); font-size: 14px; }
  .cards { display: grid; gap: 18px; }
  .card {
    display: block;
    padding: 26px 28px;
    border: 1px solid var(--line);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow);
    text-decoration: none;
    color: inherit;
    transition: transform .16s ease, border-color .16s ease;
  }
  .card:hover { transform: translateY(-2px); border-color: var(--accent); }
  .card:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  .card h2 { margin: 0 0 8px; font-size: 23px; display: flex; align-items: center; gap: 10px; }
  .card p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.75; }
  .pill {
    padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
    background: var(--accent-soft); color: var(--accent); font-family: system-ui, sans-serif;
  }
  .pill.gold { background: #fef3c7; color: var(--gold); }
  .card .go { margin-top: 14px; color: var(--accent); font-size: 14px; font-weight: 600; font-family: system-ui, sans-serif; }
  footer {
    margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--line);
    color: var(--muted); font-size: 13px; line-height: 1.9;
  }
  @media (max-width: 560px) {
    .wrap { padding: 36px 18px 60px; }
    h1 { font-size: 30px; }
    .card { padding: 20px; }
  }
</style>
</head>
<body>
<main class="wrap">
  <h1>中药学备考全书</h1>
  <p class="sub">《中国药典》2025 年版一部 · 第十版教材</p>
  <p class="meta">2290 条药典条目 ｜ 1616 个成方 ｜ 283 味教材药</p>

  <div class="cards">
    <a class="card" href="./clinical/index.html">
      <h2>药典检索 <span class="pill">全库</span></h2>
      <p>按药名、拼音、俗名、拉丁名、功能主治或正文检索药典全文。支持教材掌握级别筛选，命中词高亮。</p>
      <div class="go">进入检索 →</div>
    </a>

    <a class="card" href="./clinical/bench.html">
      <h2>方药研习台 <span class="pill gold">配伍自查</span></h2>
      <p>选几味药，自动比对药典【注意】里的「不宜与…同用」（十八反十九畏），并反查同时含有这些药的成方。</p>
      <div class="go">进入研习 →</div>
    </a>

    <a class="card" href="./herbs/index.html">
      <h2>教材背诵 <span class="pill">283 味</span></h2>
      <p>按掌握/熟悉/了解筛选，查功效归经四气五味，分类歌诀背诵，三种背诵模式与错题统计。</p>
      <div class="go">进入背诵 →</div>
    </a>
  </div>

  <footer>
    数据来源：《中华人民共和国药典》2025 年版一部（国家药典委员会）、《中药学》第十版教材。<br>
    本站为学习与复习工具，展示的是法定条文与教材内容，<strong>不构成诊断、不构成处方、不构成用药建议</strong>。实际用药须由执业医师决定。
  </footer>
</main>

<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
</script>
</body>
</html>
`;

/* ---------------- 组装 ---------------- */

reset();

// 1. 门户页
fs.writeFileSync(path.join(DIST, "index.html"), portal, "utf8");

// 2. 站点公共文件
for (const file of ["manifest.json", "sw.js", "clinical_reference.html"]) {
  copyFile(file, file);
}

// 3. 新模块
const clinicalCount = copyDir("clinical", "clinical", (rel) => !rel.endsWith(".map"));
const dataCount = copyDir("data", "data");
const iconCount = copyDir("icons", "icons");

// 4. 旧版教材工具 → herbs/（连同它依赖的相对资源一起搬）
//    它的相对引用是 style.css / app.js / data.js / icons/ / manifest.json
copyFile("app.js", "herbs/app.js");
copyFile("data.js", "herbs/data.js");
copyFile("songs.js", "herbs/songs.js");
copyFile("style.css", "herbs/style.css");
copyFile("manifest.json", "herbs/manifest.json");
copyDir("icons", "herbs/icons");

//    旧页面的 sw.js 注册指向 /herbs/sw.js（不存在），且它的预缓存列表是根路径，
//    在子目录里跑会缓存错对象。构建时直接摘掉这段注册，让旧工具以纯静态方式运行。
let legacyHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const swBlockRe = /\s*if\s*\(\s*'serviceWorker'\s+in\s+navigator\s*\)\s*\{[\s\S]*?\n\}\s*(?=<\/script>)/;
const hadSw = swBlockRe.test(legacyHtml);
legacyHtml = legacyHtml.replace(swBlockRe, "\n");
fs.mkdirSync(path.join(DIST, "herbs"), { recursive: true });
fs.writeFileSync(path.join(DIST, "herbs/index.html"), legacyHtml, "utf8");

// 5. 体积统计
function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

const mb = (n) => (n / 1048576).toFixed(2) + "MB";
console.log("dist 构建完成");
console.log("  clinical/", clinicalCount, "个文件");
console.log("  data/    ", dataCount, "个文件");
console.log("  icons/   ", iconCount, "个文件");
console.log("  herbs/   ", "5 项 + icons（已移除 SW 注册：" + (hadSw ? "是" : "否，正则未命中") + "）");
console.log("  总计     ", mb(dirSize(DIST)));
