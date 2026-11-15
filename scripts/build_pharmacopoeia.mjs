import fs from "node:fs";
import path from "node:path";

const SECTION_TYPES = {
  "药材和饮片": "herb",
  "植物油脂和提取物": "extract",
  "成方制剂和单味制剂": "formula",
  "索引": "index",
  "前言": "front_matter",
};

function parseFields(text) {
  const matches = [...text.matchAll(/【([^【】]+)】/g)];
  const fields = [];

  const overview = matches.length ? text.slice(0, matches[0].index).trim() : text.trim();
  if (overview) fields.push({ name: "概述", text: overview });

  matches.forEach((match, index) => {
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const body = text.slice(match.index + match[0].length, end).trim();
    if (body) fields.push({ name: match[1].trim(), text: body });
  });

  return fields;
}

function normalizeEntry(raw) {
  const section = raw.section || "其他";
  return {
    id: raw.id,
    title: raw.title || "",
    pinyin: raw.pinyin || "",
    eTitle: raw.eTitle || "",
    page: raw.page ?? null,
    section,
    type: SECTION_TYPES[section] || "other",
    path: raw.path || [],
    fields: parseFields(raw.text || ""),
  };
}

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  console.error("Usage: node scripts/build_pharmacopoeia.mjs <source.jsonl> <output.jsonl>");
  process.exit(1);
}

const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/).filter(Boolean);
const entries = lines.map((line, index) => {
  try {
    return normalizeEntry(JSON.parse(line));
  } catch (error) {
    throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
  }
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const output = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
fs.writeFileSync(outputPath, output, "utf8");

console.log(`Wrote ${entries.length} entries to ${outputPath}`);
