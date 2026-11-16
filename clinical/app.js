const state = {
  query: "",
  filter: "all",
  mode: "text", // "text" 药名/全文 | "symptom" 病症找药
  requestId: 0,
  debounceTimer: 0,
  lastFocused: null,
};

const searchInput = document.getElementById("search");
const resultsElement = document.getElementById("results");
const statusElement = document.getElementById("status");
const filtersElement = document.getElementById("filters");
const symptomFiltersElement = document.getElementById("symptom-filters");
const modeTabsElement = document.getElementById("mode-tabs");
const detailElement = document.getElementById("detail");
const detailTitle = document.getElementById("detail-title");
const detailMeta = document.getElementById("detail-meta");
const detailBody = document.getElementById("detail-body");

// 热门病症：空查询时的快捷入口
const POPULAR_SYMPTOMS = [
  "高血压", "糖尿病", "冠心病", "心绞痛", "中风",
  "头痛", "眩晕", "失眠", "咳嗽", "哮喘",
  "感冒", "发热", "咽喉肿痛", "鼻炎", "口疮",
  "胃痛", "消化不良", "便秘", "腹泻", "黄疸",
  "水肿", "尿频", "痛经", "月经不调", "带下",
  "贫血", "高血脂", "风湿", "腰痛", "跌打损伤",
  "湿疹", "荨麻疹", "痤疮", "疮疡", "盗汗",
];

// 从封面页带过来的 ?q= 直接填进搜索框；?mode=symptom 切到病症模式
const initialParams = new URLSearchParams(location.search);
if (initialParams.get("mode") === "symptom") state.mode = "symptom";
const initialQuery = initialParams.get("q");
if (initialQuery) {
  searchInput.value = initialQuery;
  state.query = initialQuery.trim();
}

/* ---------------- 基础工具 ---------------- */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 单次替换完成高亮，避免多次 replace 产生嵌套标签
function highlight(text, tokens) {
  const html = escapeHtml(text);
  const parts = (tokens || [])
    .filter((t) => t && t.length > 1)
    .map(escapeRegExp);
  if (!parts.length) return html;
  try {
    const re = new RegExp(`(${parts.join("|")})`, "gi");
    return html.replace(re, "<mark>$1</mark>");
  } catch (error) {
    return html;
  }
}

function typeLabel(type) {
  const labels = {
    herb: "药材饮片",
    extract: "提取物",
    formula: "成方制剂",
    index: "索引",
    front_matter: "前言",
    other: "其他",
  };
  return labels[type] || "其他";
}

const LEVEL_CLASS = { 掌握: "level-master", 熟悉: "level-familiar", 了解: "level-basic" };

function levelBadge(teaching) {
  if (!teaching || !teaching.level) return "";
  const cls = LEVEL_CLASS[teaching.level] || "level-basic";
  return `<span class="badge level ${cls}">教材·${escapeHtml(teaching.level)}</span>`;
}

// 安全性单独成块：毒性 / 妊娠禁忌 用色块标出，【注意】原文折叠两行
function safetyFlags(safety) {
  if (!safety) return [];
  const flags = [];
  if (safety.toxic) {
    flags.push(
      `<span class="sflag sflag-toxic">${escapeHtml(safety.toxicity || "有毒")}</span>`
    );
  }
  if (safety.pregnancy) {
    flags.push(`<span class="sflag sflag-preg">孕妇${escapeHtml(safety.pregnancy)}</span>`);
  }
  return flags;
}

function safetyBlock(entry, tokens) {
  const flags = safetyFlags(entry.safety);
  const caution = entry.clinical && entry.clinical["注意"];
  if (!flags.length && !caution) return "";
  return `
    <div class="safety">
      ${flags.length ? `<div class="sflag-row">${flags.join("")}</div>` : ""}
      ${
        caution
          ? `<div class="safety-note"><span class="safety-label">注意</span><span class="safety-text">${highlight(
              caution,
              tokens || []
            )}</span></div>`
          : ""
      }
    </div>
  `;
}

/* ---------------- 模式切换 ---------------- */

function applyMode() {
  const symptom = state.mode === "symptom";
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === state.mode);
  });
  filtersElement.classList.toggle("hidden", symptom);
  symptomFiltersElement.classList.toggle("hidden", !symptom);
  searchInput.placeholder = symptom
    ? "输入病症或西医病名，如：高血压、失眠、糖尿病、跌打损伤"
    : "搜索药名、拼音、俗名、拉丁名、功能主治或正文";
}

modeTabsElement.addEventListener("click", (event) => {
  const tab = event.target.closest(".mode-tab");
  if (!tab || tab.dataset.mode === state.mode) return;
  state.mode = tab.dataset.mode;
  state.filter = "all";
  document.querySelectorAll("#filters .filter").forEach((b) =>
    b.classList.toggle("active", b.dataset.filter === "all")
  );
  document.querySelectorAll("#symptom-filters .filter").forEach((b) =>
    b.classList.toggle("active", b.dataset.filter === "all")
  );
  applyMode();
  runSearch();
});

/* ---------------- 检索 ---------------- */

function runSearch() {
  const requestId = ++state.requestId;
  ZySearch.search(state.query, state.filter, state.mode).then((message) => {
    if (message && message.type === "results" && requestId === state.requestId) {
      renderResults(message);
    }
  });
  syncUrl();
}

// 查询词同步到地址栏，刷新/分享都能复原；file:// 下 replaceState 会抛，忽略即可
function syncUrl() {
  try {
    const url = new URL(location.href);
    if (state.query) url.searchParams.set("q", state.query);
    else url.searchParams.delete("q");
    if (state.mode === "symptom") url.searchParams.set("mode", "symptom");
    else url.searchParams.delete("mode");
    history.replaceState(null, "", url);
  } catch (error) {
    /* 忽略 */
  }
}

function scheduleSearch() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(runSearch, 140);
}

/* ---------------- 渲染 ---------------- */

function cardHtml(entry, tokens) {
  const pinyin = entry.pinyin
    ? `<span class="card-pinyin">${escapeHtml(entry.pinyin)}</span>`
    : "";
  const page = entry.page ? ` · 第 ${entry.page} 页` : "";
  const effect = entry.clinical["功能与主治"];
  const effectLine = effect
    ? `<div class="clinical-line"><span class="clinical-label">主治</span><span>${highlight(effect, tokens)}</span></div>`
    : "";
  const matchedLine =
    entry.matched && entry.matched.length
      ? `<div class="matched-line">按 <span class="matched-term">${entry.matched
          .map(escapeHtml)
          .join("</span> <span class=\"matched-term\">")}</span> 匹配</div>`
      : "";
  return `
    <article class="card" data-id="${entry.id}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(entry.title)} 详情">
      <div class="card-top">
        <span class="card-title">${highlight(entry.title, tokens)}</span>
        ${pinyin}
        ${levelBadge(entry.teaching)}
        <span class="badge">${escapeHtml(typeLabel(entry.type))}</span>
      </div>
      <div class="snippet">${highlight(entry.snippet, tokens)}</div>
      ${effectLine}
      ${matchedLine}
      ${safetyBlock(entry, tokens)}
      <div class="meta">${escapeHtml(entry.section)}${page}</div>
    </article>
  `;
}

function emptyChipsBoard() {
  return `
    <div class="chips-board">
      <h2>输入病症，帮你从 2290 条药典条目里找药</h2>
      <p>药典用的是中医表述（高血压 → 眩晕 / 肝阳上亢），这里已做好同义词扩展，
      点下面任意病症直接试：</p>
      <div class="chip-grid">
        ${POPULAR_SYMPTOMS.map(
          (s) => `<button class="chip" data-chip="${escapeHtml(s)}">${escapeHtml(s)}</button>`
        ).join("")}
      </div>
    </div>
  `;
}

function renderResults(message) {
  // 病症模式 + 空查询：展示快捷病症面板
  if (message.mode === "symptom" && !state.query) {
    resultsElement.innerHTML = emptyChipsBoard();
    return;
  }

  if (!message.results.length) {
    resultsElement.innerHTML =
      message.mode === "symptom"
        ? `<div class="empty">没有在【功能与主治】里匹配到「${escapeHtml(state.query)}」<br>试试换个说法：中医病名（胸痹、消渴、不寐）或症状词（头痛、便秘）</div>`
        : `<div class="empty">没有匹配的药典条目</div>`;
    return;
  }

  const tokens = message.tokens || [];
  let html = "";

  if (message.mode === "symptom") {
    // 命中说明条
    const expandedNote = message.expanded && message.expanded.length
      ? `已扩展同义词：${message.expanded.map(escapeHtml).join("、")}`
      : "";
    const hitTerms = tokens.length
      ? `按 <strong>${tokens.map(escapeHtml).join(" / ")}</strong> 匹配`
      : "";
    html += `
      <div class="symptom-summary">
        <div>${hitTerms} · 共 <strong>${message.total.toLocaleString("zh-CN")}</strong> 条</div>
        ${expandedNote ? `<div class="expand-note">${expandedNote}</div>` : ""}
      </div>`;

    const singles = message.results.filter((e) => e.type === "herb" || e.type === "extract");
    const formulas = message.results.filter((e) => e.type === "formula");

    if (singles.length) {
      html += `<h2 class="group-title">单味药 · ${singles.length}</h2>`;
      html += `<div class="results-grid">${singles.map((e) => cardHtml(e, tokens)).join("")}</div>`;
    }
    if (formulas.length) {
      html += `<h2 class="group-title">成方制剂 · ${formulas.length}</h2>`;
      html += `<div class="results-grid">${formulas.map((e) => cardHtml(e, tokens)).join("")}</div>`;
    }
  } else {
    html += message.results.map((entry) => cardHtml(entry, tokens)).join("");
  }

  resultsElement.innerHTML = html;

  if (message.total > message.results.length) {
    resultsElement.insertAdjacentHTML(
      "beforeend",
      `<div class="empty">显示前 ${message.results.length} 条，共 ${message.total.toLocaleString("zh-CN")} 条</div>`
    );
  }

  resultsElement.insertAdjacentHTML(
    "beforeend",
    `<p class="results-disclaimer">以上为药典法定条文摘录，仅供学习与复习参考，<strong>不构成诊断、不构成处方</strong>。用药须由执业医师决定。</p>`
  );
}

function openDetail(id) {
  state.lastFocused = document.activeElement;
  ZySearch.detail(id).then((message) => {
    if (message && message.entry) renderDetail(message.entry);
  });
}

// 详情抽屉暴露给学习助手（agent.js）复用
window.__zyDetail = openDetail;

function teachingBlock(teaching) {
  if (!teaching) return "";
  const rows = [
    ["掌握级别", teaching.level],
    ["教材分类", teaching.category],
    ["四气五味", [teaching.siqi, teaching.wuwei].filter(Boolean).join(" ｜ ")],
    ["归经", teaching.guijing],
    ["教材功效", teaching.summary],
  ].filter((row) => row[1]);
  if (!rows.length) return "";
  return `
    <section class="field teaching">
      <h3>教材信息</h3>
      <dl class="teaching-list">
        ${rows
          .map(
            ([k, v]) =>
              `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`
          )
          .join("")}
      </dl>
    </section>
  `;
}

function fieldTextOf(entry, name) {
  return (entry.fields || [])
    .filter((f) => f.name === name)
    .map((f) => f.text)
    .join("\n");
}

// 抽屉里的安全块：色标 + 【注意】全文（不折叠）
function detailSafetyBlock(entry) {
  const flags = safetyFlags(entry.safety);
  const caution = fieldTextOf(entry, "注意");
  if (!flags.length && !caution) return "";
  return `
    <section class="field safety-detail">
      <h3>安全提示</h3>
      ${flags.length ? `<div class="sflag-row">${flags.join("")}</div>` : ""}
      ${caution ? `<p class="safety-full">${escapeHtml(caution)}</p>` : ""}
    </section>
  `;
}

function renderDetail(entry) {
  if (!entry) return;

  detailTitle.textContent = entry.title;
  detailMeta.textContent = [entry.pinyin, entry.eTitle, entry.section, entry.page ? `第 ${entry.page} 页` : ""]
    .filter(Boolean)
    .join(" · ");

  detailBody.innerHTML =
    teachingBlock(entry.teaching) +
    detailSafetyBlock(entry) +
    entry.fields
      .map((field) => {
        if (!field.text) return "";
        return `
        <section class="field">
          <h3>${escapeHtml(field.name)}</h3>
          <p>${escapeHtml(field.text)}</p>
        </section>
      `;
      })
      .join("") +
    `<p class="drawer-disclaimer">以上为药典法定条文原文，仅供学习与复习参考，<strong>不构成诊断、不构成处方、不构成用药建议</strong>。剂量与配伍受个体、证候影响，实际用药须由执业医师决定。</p>`;

  detailBody.scrollTop = 0;
  detailElement.classList.add("open");
  detailElement.setAttribute("aria-hidden", "false");
  detailElement.querySelector(".close")?.focus();
}

function closeDetail() {
  detailElement.classList.remove("open");
  detailElement.setAttribute("aria-hidden", "true");
  if (state.lastFocused && document.contains(state.lastFocused)) {
    state.lastFocused.focus();
  }
}

/* ---------------- 事件 ---------------- */

searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim();
  scheduleSearch();
});

filtersElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  filtersElement.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.filter = button.dataset.filter;
  runSearch();
});

symptomFiltersElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  symptomFiltersElement.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.filter = button.dataset.filter;
  runSearch();
});

resultsElement.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip[data-chip]");
  if (chip) {
    searchInput.value = chip.dataset.chip;
    state.query = chip.dataset.chip;
    runSearch();
    return;
  }
  const card = event.target.closest(".card[data-id]");
  if (!card) return;
  openDetail(card.dataset.id);
});

resultsElement.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".card[data-id]");
  if (!card) return;
  event.preventDefault();
  openDetail(card.dataset.id);
});

detailElement.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closeDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
});

/* ---------------- 启动 ---------------- */

applyMode();

if (ZySearch.offline) {
  statusElement.textContent = "离线版不支持全文检索";
  resultsElement.innerHTML = `<div class="empty">
    APK 离线包内只带教材背诵模块。药典全文检索与方药研习需要联网，
    请打开 <a href="https://maoshaoxing.github.io/zhongyaoxue/clinical/index.html">在线版</a>。
  </div>`;
} else {
  ZySearch.onProgress((msg) => {
    const mb = (msg.loaded / 1048576).toFixed(1);
    statusElement.textContent = `正在加载药典数据 ${mb} MB`;
    statusElement.classList.add("is-loading");
  });
  ZySearch.onError((msg) => {
    statusElement.textContent = "加载失败";
    resultsElement.innerHTML = `<div class="empty">${escapeHtml(msg.message || "药典数据加载失败，请刷新重试")}</div>`;
  });
  ZySearch.ensure().then((total) => {
    if (total < 0) return; // 已由 onError 处理
    statusElement.classList.remove("is-loading");
    statusElement.textContent = `${total.toLocaleString("zh-CN")} 条药典条目`;
    if (state.mode === "symptom" && !state.query) renderResults({ mode: "symptom", results: [], tokens: [] });
    runSearch();
  });
}
