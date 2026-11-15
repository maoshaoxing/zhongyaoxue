const state = {
  query: "",
  filter: "all",
  requestId: 0,
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
    resultsElement.innerHTML = `<div class="empty">${message.message}</div>`;
  }
};

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function runSearch() {
  const requestId = ++state.requestId;
  worker.postMessage({
    type: "search",
    requestId,
    query: state.query,
    filter: state.filter,
  });
}

function renderResults(message) {
  if (!message.results.length) {
    resultsElement.innerHTML = `<div class="empty">没有匹配的药典条目</div>`;
    return;
  }

  resultsElement.innerHTML = message.results
    .map((entry) => {
      const pinyin = entry.pinyin ? `<span class="card-pinyin">${escapeHtml(entry.pinyin)}</span>` : "";
      const page = entry.page ? ` · 第 ${entry.page} 页` : "";
      const effect = entry.clinical["功能与主治"];
      const caution = entry.clinical["注意"];
      const effectLine = effect
        ? `<div class="clinical-line"><span class="clinical-label">主治</span><span>${escapeHtml(effect)}</span></div>`
        : "";
      const cautionLine = caution
        ? `<div class="clinical-line"><span class="clinical-label">注意</span><span>${escapeHtml(caution)}</span></div>`
        : "";
      return `
        <article class="card" data-id="${entry.id}">
          <div class="card-top">
            <span class="card-title">${escapeHtml(entry.title)}</span>
            ${pinyin}
            <span class="badge">${escapeHtml(typeLabel(entry.type))}</span>
          </div>
          <div class="snippet">${escapeHtml(entry.snippet)}</div>
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
      `<div class="empty">显示前 120 条，共 ${message.total.toLocaleString("zh-CN")} 条</div>`
    );
  }
}

function openDetail(id) {
  const requestId = ++state.requestId;
  worker.postMessage({ type: "detail", requestId, id });
}

function renderDetail(entry) {
  if (!entry) return;

  detailTitle.textContent = entry.title;
  detailMeta.textContent = [entry.pinyin, entry.eTitle, entry.section, entry.page ? `第 ${entry.page} 页` : ""]
    .filter(Boolean)
    .join(" · ");

  detailBody.innerHTML = entry.fields
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

  detailElement.classList.add("open");
  detailElement.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  detailElement.classList.remove("open");
  detailElement.setAttribute("aria-hidden", "true");
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim();
  runSearch();
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

detailElement.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closeDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
});

worker.postMessage({ type: "load" });
