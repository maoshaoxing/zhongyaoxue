#!/usr/bin/env node
/**
 * build_teaching.mjs
 * 把教材数据（data.js 的 TCM_HERBS / ALIAS_DATA）与药典条目对齐，
 * 生成 clinical 检索用的 data/teaching.json。
 *
 * 产出结构：
 * {
 *   "herbs": { "<药典正名>": { level, category, siqi, wuwei, guijing, summary, textbookName } },
 *   "alias": { "<别名/俗名>": "<药典正名>" },
 *   "missing": ["教材有、药典一部未收载的名称"]
 * }
 *
 * 用法：node scripts/build_teaching.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const readDataJs = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
const readCorpus = fs.readFileSync(path.join(ROOT, "data/pharmacopoeia.jsonl"), "utf8");

// 1. 在沙箱里执行 data.js，取出 window.TCM_HERBS / window.ALIAS_DATA
const sandbox = {};
new Function("window", readDataJs)(sandbox);
const HERBS = sandbox.TCM_HERBS || [];
const ALIASES = sandbox.ALIAS_DATA || [];

// 2. 药典条目正名索引（去掉括号别名）
const stripParen = (t) => t.replace(/[（(].*?[)）]/g, "").trim();
const entries = readCorpus.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const baseTitles = new Set(
  entries.filter((e) => e.type === "herb" || e.type === "extract").map((e) => stripParen(e.title))
);

// 3. 教材俗名 → 药典正名（人工核对，药典一部确实收载）
const TEXTBOOK_TO_CHP = {
  全虫: "全蝎",
  蚯蚓: "地龙",
  田七: "三七",
  白僵蚕: "僵蚕",
  乌蛇: "乌梢蛇",
  龟板: "龟甲",
  团鱼甲: "鳖甲",
  鸡肫皮: "鸡内金",
  益智仁: "益智",
  鲍鱼壳: "石决明",
  珠母: "珍珠母",
  白花蛇: "蕲蛇",
  海蛤壳: "蛤壳",
  竹叶: "淡竹叶",
  贯众: "绵马贯众",
  萆薢: "粉萆薢",
  沙参: "南沙参",
  瓜蒌根: "天花粉",
  棕榈炭: "棕榈",
  地鳖虫: "土鳖虫",
};

function resolve(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (baseTitles.has(n)) return n;
  const mapped = TEXTBOOK_TO_CHP[n];
  if (mapped && baseTitles.has(mapped)) return mapped;
  return null;
}

// 4. 教材药物信息 → 按药典正名索引
const herbs = {};
const alias = {};
const missing = [];

for (const h of HERBS) {
  const target = resolve(h.name);
  if (!target) {
    if (!missing.includes(h.name)) missing.push(h.name);
    continue;
  }
  // 同名多条时保留信息更全的一条（避免 data.js 重复项互相覆盖成空值）
  const prev = herbs[target];
  const next = {
    level: h.level || "",
    category: (h.tags && h.tags[0]) || "",
    tags: h.tags || [],
    siqi: h.siqi || "",
    wuwei: h.wuwei || "",
    guijing: h.guijing || "",
    summary: h.summary || "",
    textbookName: h.name,
  };
  if (!prev || (next.summary.length + next.guijing.length) > (prev.summary.length + prev.guijing.length)) {
    herbs[target] = next;
  }
  if (h.name !== target) alias[h.name] = target;
}

// 5a. 人工对照表本身就是别名表：即使 data.js 里没有该名称，也让它能命中
for (const [name, target] of Object.entries(TEXTBOOK_TO_CHP)) {
  if (baseTitles.has(target) && !alias[name]) alias[name] = target;
}

// 5b. 教材别名表 → 药典正名（别名 → 教材名 → 药典名，链式解析）
for (const a of ALIASES) {
  const target = resolve(a.name);
  if (target && a.alias && !alias[a.alias]) alias[a.alias] = target;
}

// 6. 药典自带的括号别名，例如「土鳖虫（䗪虫）」「延胡索（元胡）」
let parenAliasCount = 0;
for (const e of entries) {
  if (e.type !== "herb" && e.type !== "extract") continue;
  const m = e.title.match(/^(.*?)[（(](.*?)[)）]\s*$/);
  if (!m) continue;
  const main = m[1].trim();
  for (const inner of m[2].split(/[、,，/]/)) {
    const k = inner.trim();
    if (k && !alias[k]) {
      alias[k] = main;
      parenAliasCount++;
    }
  }
}

const out = { herbs, alias, missing };
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/teaching.json"), JSON.stringify(out), "utf8");

const levelCount = {};
for (const v of Object.values(herbs)) levelCount[v.level] = (levelCount[v.level] || 0) + 1;
console.log("教材药物", HERBS.length, "味 → 对齐药典", Object.keys(herbs).length, "味");
console.log("掌握级别分布", levelCount);
console.log("别名映射", Object.keys(alias).length, "条（含药典括号别名", parenAliasCount, "条）");
console.log("药典一部未收载", missing.length, "味：", missing.join("、"));
console.log("输出 data/teaching.json");
