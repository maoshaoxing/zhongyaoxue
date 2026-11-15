#!/usr/bin/env node
/**
 * build-site.mjs
 * 仓库根目录本身就是站点（门户 index.html + clinical/ + herbs/ + data/）。
 * 这个脚本把可发布的那部分拷进 dist/，供 APK 打包和「GitHub Actions」部署使用。
 *
 * 注意：GitHub Pages 目前走的是「Deploy from a branch」，发布根目录，
 * 由 _config.yml 里的 exclude 挡掉 android/、scripts/、docs/ 等。
 * 两份清单（本文件的 SITE_FILES 与 _config.yml 的 exclude）需要保持一致。
 *
 * 用法：node scripts/build-site.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

// 需要发布的顶层文件与目录
const SITE_FILES = ["index.html", "manifest.json", "sw.js", "clinical_reference.html"];
const SITE_DIRS = ["clinical", "herbs", "data", "icons"];

function sizeOf(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(p) : fs.statSync(p).size;
  }
  return total;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const missing = [];
for (const file of SITE_FILES) {
  const from = path.join(ROOT, file);
  if (!fs.existsSync(from)) {
    missing.push(file);
    continue;
  }
  fs.copyFileSync(from, path.join(DIST, file));
}
for (const dir of SITE_DIRS) {
  const from = path.join(ROOT, dir);
  if (!fs.existsSync(from)) {
    missing.push(dir + "/");
    continue;
  }
  fs.cpSync(from, path.join(DIST, dir), { recursive: true });
}

if (missing.length) {
  console.error("缺少站点文件：", missing.join("、"));
  process.exitCode = 1;
}

const mb = (n) => (n / 1048576).toFixed(2) + "MB";
console.log("dist 构建完成");
console.log("  文件  ", SITE_FILES.join(" "));
console.log("  目录  ", SITE_DIRS.join(" "));
console.log("  总计  ", mb(sizeOf(DIST)));
