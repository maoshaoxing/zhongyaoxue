const state = {
  query: "",
  filter: "all",
  requestId: 0,
  debounceTimer: 0,
  lastFocused: null,
};

const searchInput = document.getElementById("search");
const resultsElement = document.getElementById("results");
const statusElement = document.getElementById("status");
const filtersElement = document.getElementById("filters");
const detailElement = document.getElementById("detail");
const detailTitle = document.getElementById("detail-title");
const detailMeta = document.getElementById("detail-meta");
const detailBody = document.getElementById("detail-body");

const worker = new Worker("search-worker.js");

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

/* ---------------- 检索 ---------------- */

function runSearch() {
  const requestId = ++state.requestId;
  worker.postMessage({
    type: "search",
    requestId,
    query: state.query,
    filter: state.filter,
  });
}

function scheduleSearch() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(runSearch, 140);
}

worker.onmessage = (event) => {
  const message = event.data;

  if (message.type === "loaded") {
    statusElement.textContent = `${message.total.toLocaleString("zh-CN")} 条药典条目`;
    runSearch();
  }

  if (message.type === "results" && message.requestId === state.requestId) {
    renderResults(message);
  }

  if (message.type === "detail" && message.requestId === state.requestId) {
    renderDetail(message.entry);
  }

  if (message.type === "error") {
    statusElement.textContent = "加载失败";
    resultsElement.innerHTML = `<div class="empty">${escapeHtml(message.message)}</div>`;
  }
};

/* ---------------- 渲染 ---------------- */

function renderResults(message) {
  if (!message.results.length) {
    resultsElement.innerHTML = `<div class="empty">没有匹配的药典条目</div>`;
    return;
  }

  const tokens = message.tokens || [];

  resultsElement.innerHTML = message.results
    .map((entry) => {
      const pinyin = entry.pinyin
        ? `<span class="card-pinyin">${escapeHtml(entry.pinyin)}</span>`
        : "";
      const page = entry.page ? ` · 第 ${entry.page} 页` : "";
      const effect = entry.clinical["功能与主治"];
      const caution = entry.clinical["注意"];
      const effectLine = effect
        ? `<div class="clinical-line"><span class="clinical-label">主治</span><span>${highlight(effect, tokens)}</span></div>`
        : "";
      const cautionLine = caution
        ? `<div class="clinical-line"><span class="clinical-label">注意</span><span>${highlight(caution, tokens)}</span></div>`
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
          ${cautionLine}
          <div class="meta">${escapeHtml(entry.section)}${page}</div>
        </article>
      `;
    })
    .join("");

  if (message.total > message.results.length) {
    resultsElement.insertAdjacentHTML(
      "beforeend",
      `<div class="empty">显示前 ${message.results.length} 条，共 ${message.total.toLocaleString("zh-CN")} 条</div>`
    );
  }
}

function openDetail(id) {
  state.lastFocused = document.activeElement;
  const requestId = ++state.requestId;
  worker.postMessage({ type: "detail", requestId, id });
}

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

function renderDetail(entry) {
  if (!entry) return;

  detailTitle.textContent = entry.title;
  detailMeta.textContent = [entry.pinyin, entry.eTitle, entry.section, entry.page ? `第 ${entry.page} 页` : ""]
    .filter(Boolean)
    .join(" · ");

  detailBody.innerHTML =
    teachingBlock(entry.teaching) +
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
      .join("");

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

  document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.filter = button.dataset.filter;
  runSearch();
});

resultsElement.addEventListener("click", (event) => {
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

worker.postMessage({ type: "load" });
