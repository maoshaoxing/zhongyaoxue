/**
 * 药典检索 Worker
 *
 * 相比初版的关键改动：
 * 1. 归一化一次到位：去声调、ɑ→a、ɡ→g、ü→u（同时接受 v 输入）、去空格与标点。
 *    初版直接用 normalize('NFKC')，打不出 ɑ 的用户永远搜不到「黄芪」。
 * 2. 索引预计算：加载时把标题/拼音/拉丁名/各字段正文归一化后缓存，查询只做字符串包含，
 *    不再每次按键把 420 万字重新归一化。
 * 3. 分档排序：命中的 token 数优先（全命中 > 部分命中），再比分数。
 *    初版用整条 ×0.15 折扣，会让「麻黄 桂枝」把标题精确命中的「麻黄」压到药酒后面。
 * 4. 字段命中做上限截断，避免超长方剂靠字段数量刷分。
 * 5. 别名与教材数据：俗名（全虫/田七/国老）能命中正名，结果带教材掌握级别。
 */

let entries = [];
let aliasMap = {}; // fold(别名) -> fold(药典正名)
let teaching = {}; // 药典正名 -> 教材信息
let loaded = false;

/* ---------------- 文本归一化 ---------------- */

// 药典拼音里混着 ɑ(U+0251) ɡ(U+0261) ü 以及声调符号，还有 ’ 这种撇号
function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // 去声调（组合附加符号）
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ɑ/g, "a")
    .replace(/ɡ/g, "g")
    .replace(/[üǖǘǚǜ]/g, "u")
    .replace(/v/g, "u") // nvzhenzi -> nuzhenzi
    .replace(/[’'`·•\s\-_.,，。、()（）［］\[\]]/g, "");
}

function stripParen(title) {
  return String(title || "").replace(/[（(].*?[)）]/g, "").trim();
}

/* ---------------- 加载与建索引 ---------------- */

function buildIndex(list) {
  // 反查：正名 -> 该正名下所有别名
  const reverse = new Map();
  for (const [alias, target] of Object.entries(aliasMap)) {
    const key = fold(target);
    if (!reverse.has(key)) reverse.set(key, []);
    reverse.get(key).push(fold(alias));
  }

  return list.map((entry) => {
    const base = stripParen(entry.title);
    const baseKey = fold(base);
    const fields = entry.fields || [];
    return {
      id: entry.id,
      title: entry.title,
      pinyin: entry.pinyin,
      eTitle: entry.eTitle,
      page: entry.page,
      section: entry.section,
      type: entry.type,
      path: entry.path || [],
      fields,
      teaching: teaching[base] || null,
      _: {
        title: fold(entry.title),
        base: baseKey,
        pinyin: fold(entry.pinyin),
        eTitle: fold(entry.eTitle),
        section: fold(entry.section),
        path: fold((entry.path || []).join(" ")),
        fields: fields.map((f) => ({ name: fold(f.name), body: fold(f.text) })),
        alias: (reverse.get(baseKey) || []).join(" "),
      },
    };
  });
}

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function loadAll() {
  const [corpusRes, teachingRes] = await Promise.all([
    loadJSON("../data/pharmacopoeia.jsonl"),
    loadJSON("../data/teaching.json").catch(() => null),
  ]);

  if (teachingRes) {
    try {
      const t = await teachingRes.json();
      teaching = t.herbs || {};
      aliasMap = {};
      for (const [k, v] of Object.entries(t.alias || {})) aliasMap[fold(k)] = v;
    } catch (err) {
      teaching = {};
      aliasMap = {};
    }
  }

  const source = await corpusRes.text();
  const raw = source
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  entries = buildIndex(raw);
  // 预热一次，避免首屏第一次查询卡顿
  search("黄芪", "all");
  return entries.length;
}

/* ---------------- 打分 ---------------- */

function titleScore(entry, value) {
  const idx = entry._;
  if (idx.title === value) return 1400;
  if (idx.base === value) return 1320;
  if (idx.title.startsWith(value) || idx.base.startsWith(value)) return 1050;
  if (idx.title.includes(value)) return 780;
  return 0;
}

function scoreOne(entry, value) {
  if (!value) return 0;
  const idx = entry._;
  let score = titleScore(entry, value);

  if (idx.alias && idx.alias.includes(value)) score += 900; // 俗名/教材名命中
  if (idx.pinyin === value) score += 900;
  else if (idx.pinyin.startsWith(value)) score += 700;
  else if (idx.pinyin.includes(value)) score += 470; // 子串：huangqi 会撞上 huangqingwei
  if (idx.eTitle.includes(value)) score += 430;
  if (idx.section.includes(value) || idx.path.includes(value)) score += 200;

  let nameHits = 0;
  let bodyHits = 0;
  for (const field of idx.fields) {
    if (field.name.includes(value)) nameHits++;
    if (field.body.includes(value)) bodyHits++;
  }
  // 截断：避免「功能与主治+处方+制法+…」全中的长方剂靠数量刷分
  score += Math.min(nameHits, 3) * 130 + Math.min(bodyHits, 6) * 75;

  return score;
}

const SEARCHABLE_TYPES = new Set(["herb", "extract", "formula"]);

function matchesFilter(entry, filter) {
  if (filter === "mastery") return Boolean(entry.teaching && entry.teaching.level === "掌握");
  if (filter && filter !== "all") return entry.type === filter;
  // 默认检索不返回索引、前言、其他杂项
  return SEARCHABLE_TYPES.has(entry.type);
}

function makeSnippet(entry, tokens) {
  const body = entry.fields.map((f) => f.text).join(" ").replace(/\s+/g, " ").trim();
  if (!tokens.length) return body.slice(0, 170);

  const folded = body.toLowerCase();
  let hit = -1;
  for (const token of tokens) {
    const at = folded.indexOf(token);
    if (at >= 0 && (hit < 0 || at < hit)) hit = at;
  }
  if (hit < 0) return body.slice(0, 170);

  const start = Math.max(0, hit - 60);
  const end = Math.min(body.length, hit + 120);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

function search(query, filter) {
  const rawTokens = String(query || "")
    .split(/[\s,，、;；/|]+/)
    .map(fold)
    .filter(Boolean);
  const tokens = [...new Set(rawTokens)];

  let pool = entries.filter((entry) => matchesFilter(entry, filter));

  let ranked;
  if (!tokens.length) {
    ranked = pool
      .slice()
      .sort(
        (a, b) =>
          a.section.localeCompare(b.section, "zh-Hans-CN") ||
          a.title.localeCompare(b.title, "zh-Hans-CN")
      )
      .map((entry) => ({ entry, tier: 1, score: 0 }));
  } else {
    ranked = [];
    for (const entry of pool) {
      let total = 0;
      let hit = 0;
      let titleHit = 0;
      for (const token of tokens) {
        const s = scoreOne(entry, token);
        if (s > 0) {
          hit++;
          total += s;
        }
        titleHit = Math.max(titleHit, titleScore(entry, token));
      }
      if (!hit) continue;
      ranked.push({
        entry,
        hasTitle: titleHit > 0 ? 1 : 0,
        full: hit === tokens.length ? 1 : 0,
        score: total,
      });
    }
    // 排序优先级：
    //  1. 标题命中的（查「麻黄 桂枝」时，「麻黄」必须排在只是正文提到麻黄的药酒前面）
    //  2. 全部 token 都有命中的
    //  3. 总分
    ranked.sort(
      (a, b) =>
        b.hasTitle - a.hasTitle ||
        b.full - a.full ||
        b.score - a.score ||
        a.entry.title.localeCompare(b.entry.title, "zh-Hans-CN")
    );
  }

  return {
    total: ranked.length,
    tokens: rawTokens,
    results: ranked.slice(0, 120).map(({ entry }) => ({
      id: entry.id,
      title: entry.title,
      pinyin: entry.pinyin,
      eTitle: entry.eTitle,
      page: entry.page,
      section: entry.section,
      type: entry.type,
      snippet: makeSnippet(entry, tokens),
      teaching: entry.teaching
        ? {
            level: entry.teaching.level,
            category: entry.teaching.category,
            siqi: entry.teaching.siqi,
            wuwei: entry.teaching.wuwei,
            guijing: entry.teaching.guijing,
          }
        : null,
      clinical: {
        性味与归经: fieldText(entry, "性味与归经"),
        功能与主治: fieldText(entry, "功能与主治"),
        用法与用量: fieldText(entry, "用法与用量"),
        注意: fieldText(entry, "注意"),
      },
    })),
  };
}

function fieldText(entry, fieldName) {
  return entry.fields
    .filter((f) => f.name === fieldName)
    .map((f) => f.text)
    .join("\n");
}

function detail(id) {
  const entry = entries.find((e) => e.id === Number(id));
  if (!entry) return null;
  return {
    id: entry.id,
    title: entry.title,
    pinyin: entry.pinyin,
    eTitle: entry.eTitle,
    page: entry.page,
    section: entry.section,
    type: entry.type,
    path: entry.path,
    teaching: entry.teaching,
    fields: entry.fields,
  };
}

/* ---------------- 消息处理 ---------------- */

self.onmessage = async (event) => {
  const message = event.data;

  try {
    if (message.type === "load") {
      if (!loaded) {
        const total = await loadAll();
        loaded = true;
        self.postMessage({ type: "loaded", total });
      } else {
        self.postMessage({ type: "loaded", total: entries.length });
      }
      return;
    }

    if (message.type === "search") {
      self.postMessage({
        type: "results",
        requestId: message.requestId,
        ...search(message.query || "", message.filter || "all"),
      });
      return;
    }

    if (message.type === "detail") {
      self.postMessage({
        type: "detail",
        requestId: message.requestId,
        entry: detail(message.id),
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId || null,
      message: error.message,
    });
  }
};
