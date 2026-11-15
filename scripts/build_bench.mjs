#!/usr/bin/env node
/**
 * build_bench.mjs
 * 从药典语料里抽出「方药研习」需要的数据：
 *   data/formulas.json —— 1595 个成方制剂的处方组成 / 功能主治 / 用法 / 注意
 *   data/safety.json   —— 每味药的毒性、妊娠禁忌、配伍禁忌
 *
 * 用法：node scripts/build_bench.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const raw = fs
  .readFileSync(path.join(ROOT, "data/pharmacopoeia.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const stripParen = (t) => String(t || "").replace(/[（(].*?[)）]/g, "").trim();

// 炮制前缀，用于把「炒牵牛子」「酒女贞子」归一到药材名
const PROCESS_PREFIX = [
  "麸炒", "土炒", "清炒", "米炒", "砂炒", "蜜炙", "姜炙", "酒炙", "醋炙", "盐炙",
  "炒", "炙", "制", "法", "酒", "醋", "盐", "姜", "蜜", "煅", "焦", "生", "熟", "清",
];

function normHerb(name) {
  let n = stripParen(name).replace(/\s+/g, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PROCESS_PREFIX) {
      if (n.length > prefix.length + 1 && n.startsWith(prefix)) {
        n = n.slice(prefix.length);
        changed = true;
        break;
      }
    }
  }
  return n;
}

const fieldOf = (entry, name) => {
  const hit = entry.fields.find((f) => f.name === name);
  return hit ? hit.text : "";
};

/* ---------------- 成方 ---------------- */

const COMPOSE_RE = /^(.+?)\s*(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|μg|ug)$/;

const formulas = [];
for (const entry of raw) {
  if (entry.type !== "formula") continue;

  // 原文偶尔把两味药挤在一行（「丹参500g生川乌100g」），先按剂量单位断开
  const rawCompose = fieldOf(entry, "处方")
    .replace(/(kg|mg|ml|μg|ug|g)(?=[^\s\d.])/g, "$1\n")
    .split(/\n+/);

  const compose = [];
  for (const line of rawCompose) {
    const text = line.trim().replace(/[；;。]$/, "");
    if (!text) continue;
    const m = text.match(COMPOSE_RE);
    if (m) {
      compose.push({
        name: m[1].trim(),
        base: normHerb(m[1]),
        amount: Number(m[2]),
        unit: m[3] === "ug" ? "μg" : m[3],
      });
    } else {
      // 例如「适量」这类无剂量项
      compose.push({ name: text, base: normHerb(text), amount: null, unit: "" });
    }
  }

  formulas.push({
    id: entry.id,
    title: entry.title,
    page: entry.page,
    compose,
    functions: fieldOf(entry, "功能与主治"),
    usage: fieldOf(entry, "用法与用量"),
    caution: fieldOf(entry, "注意"),
  });
}

/* ---------------- 安全信息 ---------------- */

// 反向：药名 -> 忌用的药名列表（来自「不宜与…同用」）
const conflictPairs = [];
for (const entry of raw) {
  const note = fieldOf(entry, "注意");
  if (!note) continue;
  const m = note.match(/不宜与([^。；]+?)(?:同用|配伍)/);
  if (!m) continue;
  const targets = m[1]
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normHerb);
  if (targets.length) {
    conflictPairs.push({ from: normHerb(entry.title), rawFrom: entry.title, targets });
  }
}

const safety = {};
for (const entry of raw) {
  if (entry.type !== "herb" && entry.type !== "extract") continue;
  const nature = fieldOf(entry, "性味与归经");
  const note = fieldOf(entry, "注意");
  const pregnancyMatch = note.match(/孕妇(禁用|慎用|忌用|不宜)/);
  const toxic = /有大毒|有毒/.test(nature);
  if (!toxic && !pregnancyMatch && !note) continue;
  // 键用「去括号后的原正名」，不剥炮制前缀：
  // 川乌与制川乌毒性不同、半夏与法半夏是两条法定标准，不能混成一条
  const key = stripParen(entry.title);
  safety[key] = {
    title: entry.title,
    norm: normHerb(entry.title),
    page: entry.page,
    toxic,
    toxicity: (nature.match(/有大毒|有毒/) || [])[0] || "",
    pregnancy: pregnancyMatch ? pregnancyMatch[1] : "",
    caution: note.slice(0, 260),
  };
}

/* ---------------- 输出 ---------------- */

fs.writeFileSync(
  path.join(ROOT, "data/formulas.json"),
  JSON.stringify({ count: formulas.length, formulas }),
  "utf8"
);
fs.writeFileSync(
  path.join(ROOT, "data/safety.json"),
  JSON.stringify({ count: Object.keys(safety).length, conflicts: conflictPairs, safety }),
  "utf8"
);

const withCompose = formulas.filter((f) => f.compose.length).length;
const avg = (formulas.reduce((n, f) => n + f.compose.length, 0) / formulas.length).toFixed(1);
console.log("成方", formulas.length, "个，其中可解析处方", withCompose, "个，平均组成", avg, "味");
console.log("安全条目", Object.keys(safety).length, "条（有毒", Object.values(safety).filter((s) => s.toxic).length, "味）");
console.log("配伍禁忌", conflictPairs.length, "条，涉及药材", new Set(conflictPairs.flatMap((p) => [p.from, ...p.targets])).size, "味");
console.log("输出 data/formulas.json、data/safety.json");
