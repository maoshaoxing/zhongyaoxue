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

/* ---------------- 病症同义词表 ----------------
 * 西医病名 / 症状词 → 药典【功能与主治】里惯用的中医表述。
 * 主词直接命中权重最高；同义词用于扩大召回（高血压 → 眩晕/肝阳上亢…）。
 */
const SYMPTOM_SYNONYMS = {
  高血压: ["眩晕", "头痛", "头晕", "耳鸣", "肝阳上亢", "降压"],
  糖尿病: ["消渴", "多饮", "多尿", "烦渴", "降糖"],
  冠心病: ["胸痹", "心痛", "心绞痛", "胸闷"],
  心绞痛: ["胸痹", "心痛", "胸闷"],
  心悸: ["怔忡", "惊悸", "心慌"],
  中风: ["半身不遂", "卒中", "口眼歪斜", "语言謇涩", "中风"],
  失眠: ["不寐", "不得眠", "多梦", "心烦", "安神"],
  头痛: ["偏头痛", "头风", "头痛"],
  眩晕: ["头晕", "肝阳上亢", "眼花"],
  抑郁: ["郁证", "肝郁", "情志", "郁"],
  焦虑: ["心烦", "不寐", "郁证"],
  咳嗽: ["久咳", "干咳", "咳痰", "痰多", "喘咳"],
  哮喘: ["气喘", "咳喘", "痰鸣气喘"],
  气喘: ["咳喘", "气喘"],
  感冒: ["风寒感冒", "风热感冒", "鼻塞", "流涕"],
  发热: ["发烧", "高热", "退热", "解热"],
  咽喉肿痛: ["咽痛", "喉痹", "咽喉不利"],
  咽炎: ["咽痛", "喉痹"],
  鼻炎: ["鼻塞", "鼻渊", "鼻流浊涕"],
  胃痛: ["胃脘痛", "脘腹胀痛", "胃胀"],
  胃胀: ["脘腹胀痛", "腹胀", "食积"],
  消化不良: ["食积", "纳呆", "脘腹胀痛"],
  便秘: ["大便秘结", "肠燥", "通便"],
  腹泻: ["泄泻", "便溏", "久泻", "五更泄泻"],
  痢疾: ["下痢", "里急后重", "便脓血"],
  呕吐: ["呕逆", "恶心", "胃气上逆"],
  呃逆: ["嗳气", "打嗝"],
  黄疸: ["身目发黄", "阳黄", "阴黄", "湿热黄疸"],
  水肿: ["小便不利", "浮肿", "身肿"],
  肾炎: ["水肿", "小便不利"],
  尿频: ["小便频数", "夜尿", "遗尿"],
  尿路感染: ["淋证", "小便淋沥", "尿急"],
  前列腺: ["癃闭", "小便不利", "淋证"],
  阳痿: ["阳事不举", "肾阳虚"],
  遗精: ["滑精", "梦遗"],
  痛经: ["经行腹痛", "寒凝", "月经不调"],
  月经不调: ["经闭", "崩漏", "经行腹痛", "月经不调"],
  更年期: ["绝经前后", "潮热", "烘热汗出"],
  带下: ["湿热带下", "带下量多"],
  贫血: ["血虚", "萎黄", "面色无华"],
  高血脂: ["高脂血症", "血脂", "痰浊"],
  脂肪肝: ["胁痛", "痰浊", "肝郁"],
  风湿: ["痹病", "风湿痹痛", "关节痛", "痹痛"],
  关节炎: ["痹病", "关节痛", "风湿"],
  腰痛: ["腰膝酸软", "肾虚腰痛"],
  颈椎病: ["颈项强痛", "肩颈"],
  跌打损伤: ["扭伤", "伤筋", "瘀肿", "骨折"],
  湿疹: ["湿疮", "瘙痒", "渗出"],
  荨麻疹: ["风疹", "瘾疹", "瘙痒"],
  痤疮: ["粉刺", "肺风粉刺"],
  疮疡: ["痈", "疽", "疔", "肿毒"],
  口疮: ["口舌生疮", "口腔溃疡"],
  牙痛: ["牙龈肿痛", "牙宣"],
  目赤: ["羞明", "眼红", "目赤肿痛"],
  自汗: ["自汗盗汗", "气虚自汗"],
  盗汗: ["自汗盗汗", "阴虚盗汗"],
  出血: ["吐血", "衄血", "便血", "尿血", "崩漏"],
  中暑: ["暑热", "暑湿"],
  烧烫伤: ["水火烫伤", "烫伤"],
  疳积: ["小儿疳积", "食积"],
  肥胖: ["高脂血症", "痰湿"],
};

// 病症模式只看【功能与主治】字段（fold 后的字段名固定为「功能与主治」）
const EFFECT_FIELD = fold("功能与主治");

let entries = [];
let aliasMap = {}; // fold(别名) -> fold(药典正名)
let teaching = {}; // 药典正名 -> 教材信息
let safety = {}; // 药典正名 -> 毒性 / 妊娠禁忌 / 【注意】原文
let conflicts = []; // 药典【注意】「不宜与…同用」配伍禁忌对
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

  // 安全信息兜底索引：炮制名归一后也能找到（炒牵牛子 → 牵牛子）
  const safetyByNorm = new Map();
  for (const info of Object.values(safety)) {
    if (info && info.norm && !safetyByNorm.has(info.norm)) safetyByNorm.set(info.norm, info);
  }

  return list.map((entry) => {
    const base = stripParen(entry.title);
    const baseKey = fold(base);
    const fields = entry.fields || [];
    const safe = safety[base] || safetyByNorm.get(baseKey) || null;
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
      // 只透出检索页要展示的三项，避免把整条安全记录塞进结果里
      safety: safe
        ? { toxic: safe.toxic, toxicity: safe.toxicity, pregnancy: safe.pregnancy }
        : null,
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

// 边下边报进度：11.8MB 语料 gzip 后约 2MB，没有反馈会让人以为卡住。
// 注意 gzip 传输时 content-length 是压缩后大小，解压后字节会超过它，
// 所以这里只上传「已加载字节数」，不换算百分比。
async function readTextWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body || typeof res.body.getReader !== "function") return res.text();

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (loaded - lastReport > 512 * 1024) {
      lastReport = loaded;
      onProgress(loaded);
    }
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress(loaded);
  return new TextDecoder().decode(buffer);
}

async function loadAll() {
  const [corpusText, teachingRes, safetyRes] = await Promise.all([
    readTextWithProgress("../data/pharmacopoeia.jsonl", (loaded) => {
      self.postMessage({ type: "progress", loaded });
    }),
    loadJSON("../data/teaching.json").catch(() => null),
    loadJSON("../data/safety.json").catch(() => null),
  ]);

  if (safetyRes) {
    try {
      const s = await safetyRes.json();
      safety = s.safety || {};
      conflicts = s.conflicts || [];
    } catch (error) {
      safety = {};
      conflicts = [];
    }
  }

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

  const source = corpusText;
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
      safety: entry.safety,
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

/* ---------------- 病症找药 ---------------- */

let symptomKeyMap = null; // fold(病名) -> { display, terms: [fold后词] , displayTerms: [原文词] }

function buildSymptomKeyMap() {
  if (symptomKeyMap) return symptomKeyMap;
  symptomKeyMap = new Map();
  for (const [key, synonyms] of Object.entries(SYMPTOM_SYNONYMS)) {
    const displayTerms = [key, ...synonyms];
    symptomKeyMap.set(fold(key), {
      display: key,
      terms: displayTerms.map(fold),
      displayTerms,
    });
  }
  return symptomKeyMap;
}

function symptomFilterMatch(entry, filter) {
  if (filter === "herb") return entry.type === "herb" || entry.type === "extract";
  if (filter === "formula") return entry.type === "formula";
  return entry.type === "herb" || entry.type === "extract" || entry.type === "formula";
}

function symptomSearch(query, filter) {
  buildSymptomKeyMap();
  const rawTokens = String(query || "")
    .split(/[\s,，、;；/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // 每个查询词扩成一组：主词权重 100，同义词 35（每组同义词只计一次）
  const groups = rawTokens.map((raw) => {
    const hit = symptomKeyMap.get(fold(raw));
    return {
      primary: fold(raw),
      primaryDisplay: raw,
      terms: hit ? hit.terms : [fold(raw)],
      displayTerms: hit ? hit.displayTerms : [raw],
      expanded: Boolean(hit),
    };
  });

  const pool = entries.filter((entry) => symptomFilterMatch(entry, filter));
  const ranked = [];
  const matchedDisplay = new Set();

  for (const entry of pool) {
    const effField = entry._.fields.find((f) => f.name === EFFECT_FIELD);
    if (!effField) continue;

    let score = 0;
    const matched = [];
    for (const group of groups) {
      let termHit = null;
      if (group.primary && effField.body.includes(group.primary)) {
        score += 100;
        termHit = group.primaryDisplay;
      } else {
        for (let i = 1; i < group.terms.length; i++) {
          if (group.terms[i] && effField.body.includes(group.terms[i])) {
            score += 35;
            termHit = group.displayTerms[i];
            break;
          }
        }
      }
      if (termHit) {
        matched.push(termHit);
        matchedDisplay.add(termHit);
      }
    }
    if (score > 0) ranked.push({ entry, score, matched });
  }

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.matched.length - a.matched.length ||
      a.entry.title.localeCompare(b.entry.title, "zh-Hans-CN")
  );

  const top = ranked.slice(0, 120);
  return {
    mode: "symptom",
    total: ranked.length,
    tokens: [...matchedDisplay],
    expanded: groups.filter((g) => g.expanded).map((g) => g.primaryDisplay),
    results: top.map(({ entry, matched }) => ({
      id: entry.id,
      title: entry.title,
      pinyin: entry.pinyin,
      eTitle: entry.eTitle,
      page: entry.page,
      section: entry.section,
      type: entry.type,
      matched,
      snippet: makeSnippet(entry, [...matchedDisplay].map(fold)),
      safety: entry.safety,
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

/* ---------------- Agent 用的两个原子查询 ---------------- */

// 按名字精确定位一个药典条目：正名 / 去括号名 / 俗名别名 / 拼音，最后退到前缀
function lookupEntry(query) {
  const value = fold(query);
  if (!value || value.length < 2) return null;

  for (const entry of entries) {
    if (entry._.title === value || entry._.base === value) return summarize(entry);
  }

  const aliasTarget = aliasMap[value];
  if (aliasTarget) {
    const target = fold(aliasTarget);
    const hit = entries.find((entry) => entry._.base === target || entry._.title === target);
    if (hit) return summarize(hit);
  }

  for (const entry of entries) {
    if (entry._.pinyin === value) return summarize(entry);
  }

  // 前缀兜底：只取字典序最靠前的一个，避免一句话里随机的两字词误命中
  const prefix = entries.find((entry) => entry._.base.startsWith(value));
  if (prefix) return summarize(prefix);

  return null;
}

function summarize(entry) {
  return {
    id: entry.id,
    title: entry.title,
    pinyin: entry.pinyin,
    eTitle: entry.eTitle,
    page: entry.page,
    section: entry.section,
    type: entry.type,
    teaching: entry.teaching,
    safety: entry.safety,
    clinical: {
      性味与归经: fieldText(entry, "性味与归经"),
      功能与主治: fieldText(entry, "功能与主治"),
      用法与用量: fieldText(entry, "用法与用量"),
      注意: fieldText(entry, "注意"),
    },
  };
}

// 配伍 / 安全核查：names -> { resolved, conflicts }
function checkConflict(names) {
  const resolved = names.map((name) => {
    let n = String(name || "")
      .replace(/[（(].*?[)）]/g, "")
      .replace(/\s+/g, "");
    const byAlias = aliasMap[fold(n)];
    if (byAlias) n = byAlias;
    let info = safety[n] || null;
    if (!info) {
      const value = fold(n);
      for (const item of Object.values(safety)) {
        if (item.norm && fold(item.norm) === value) {
          info = item;
          n = item.norm;
          break;
        }
      }
    }
    if (!info) {
      const hit = entries.find((entry) => entry._.base === fold(n));
      if (hit) n = stripParen(hit.title);
    }
    return { input: name, name: n, info };
  });

  const picked = new Set(resolved.map((r) => r.name).filter(Boolean));
  const hits = [];
  const seen = new Set();
  for (const pair of conflicts) {
    const from = stripParen(pair.rawFrom || pair.from);
    if (!picked.has(from)) continue;
    const target = (pair.targets || []).find((t) => picked.has(t) && t !== from);
    if (!target) continue;
    const key = [from, target].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ a: from, b: target });
  }

  return { resolved, conflicts: hits };
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
    safety: entry.safety,
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
      const mode = message.mode === "symptom" ? "symptom" : "text";
      const result =
        mode === "symptom"
          ? symptomSearch(message.query || "", message.filter || "all")
          : search(message.query || "", message.filter || "all");
      self.postMessage({
        type: "results",
        requestId: message.requestId,
        ...result,
      });
      return;
    }

    if (message.type === "lookup") {
      self.postMessage({
        type: "lookupResult",
        requestId: message.requestId,
        entry: lookupEntry(message.query || ""),
      });
      return;
    }

    if (message.type === "conflict") {
      self.postMessage({
        type: "conflictResult",
        requestId: message.requestId,
        ...checkConflict(message.names || []),
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
