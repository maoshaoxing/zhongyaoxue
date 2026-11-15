/**
 * 方药研习台
 *
 * 三件事：
 *   1. 配伍自查 —— 药盘里的药两两比对药典【注意】里的「不宜与…同用」
 *   2. 安全提示 —— 有毒 / 孕妇禁用·慎用·忌用
 *   3. 含药成方 —— 找出同时含有药盘全部药材的成方制剂，看组成与功能主治
 *
 * 全部结论都标注药典页码，不做任何加工推断。
 */

const state = {
  meds: [],
  formulas: [],
  safety: {},
  conflicts: [],
  alias: {},
  herbNames: [],
};

const el = {
  input: document.getElementById("med-input"),
  suggest: document.getElementById("suggest"),
  tray: document.getElementById("tray"),
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  detail: document.getElementById("detail"),
  detailTitle: document.getElementById("detail-title"),
  detailMeta: document.getElementById("detail-meta"),
  detailBody: document.getElementById("detail-body"),
};

/* ---------------- 工具 ---------------- */

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const stripParen = (t) => String(t || "").replace(/[（(].*?[)）]/g, "").trim();

const PROCESS = [
  "麸炒", "土炒", "清炒", "米炒", "砂炒", "蜜炙", "姜炙", "酒炙", "醋炙", "盐炙",
  "炒", "炙", "制", "法", "酒", "醋", "盐", "姜", "蜜", "煅", "焦", "生", "熟", "清",
];

function normHerb(name) {
  let n = stripParen(name).replace(/\s+/g, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of PROCESS) {
      if (n.length > p.length + 1 && n.startsWith(p)) {
        n = n.slice(p.length);
        changed = true;
        break;
      }
    }
  }
  return n;
}

/* ---------------- 加载 ---------------- */

async function load() {
  const [formulasRes, safetyRes, teachingRes] = await Promise.all([
    fetch("../data/formulas.json"),
    fetch("../data/safety.json"),
    fetch("../data/teaching.json").catch(() => null),
  ]);

  if (!formulasRes.ok || !safetyRes.ok) throw new Error("药典数据加载失败");

  const f = await formulasRes.json();
  const s = await safetyRes.json();
  state.formulas = f.formulas || [];
  state.safety = s.safety || {};
  state.conflicts = s.conflicts || [];

  if (teachingRes && teachingRes.ok) {
    try {
      const t = await teachingRes.json();
      state.alias = t.alias || {};
    } catch (error) {
      state.alias = {};
    }
  }

  const names = new Set(Object.keys(state.safety));
  for (const formula of state.formulas) {
    for (const item of formula.compose) {
      if (item.base) names.add(item.base);
    }
  }
  names.delete("");
  state.herbNames = [...names]
    .filter((n) => n && n.trim().length > 0)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  el.status.textContent = `${state.formulas.length.toLocaleString("zh-CN")} 个成方 · ${state.herbNames.length.toLocaleString("zh-CN")} 味药材`;
  render();
}

/* ---------------- 药盘 ---------------- */

function resolveName(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (state.herbNames.includes(raw)) return raw;
  const base = normHerb(raw);
  if (state.herbNames.includes(base)) return base;
  const viaAlias = state.alias[raw] || state.alias[base];
  if (viaAlias) {
    if (state.herbNames.includes(viaAlias)) return viaAlias;
    const target = normHerb(viaAlias);
    if (state.herbNames.includes(target)) return target;
  }
  const fuzzy = state.herbNames.find((n) => n.includes(base) || base.includes(n));
  return fuzzy || null;
}

// 安全信息：先按正名精确取，取不到再按归一化名匹配
// （川乌与制川乌、半夏与法半夏是不同条目，不能合并）
function safetyOf(name) {
  if (state.safety[name]) return state.safety[name];
  const n = normHerb(name);
  for (const info of Object.values(state.safety)) {
    if (info.norm === n) return info;
  }
  return null;
}

function addMed(input) {
  const name = resolveName(input);
  if (!name) {
    flashSuggestion(`药典里找不到「${escapeHtml(input)}」`);
    return;
  }
  if (state.meds.includes(name)) {
    flashSuggestion(`药盘里已经有「${name}」了`);
    return;
  }
  state.meds.push(name);
  el.input.value = "";
  renderSuggestions("");
  render();
}

function removeMed(name) {
  state.meds = state.meds.filter((m) => m !== name);
  render();
}

/* ---------------- 计算 ---------------- */

// 药盘内两两比对药典「不宜与…同用」
function findConflicts() {
  const picked = new Set(state.meds);
  const hits = [];
  for (const pair of state.conflicts) {
    const from = normHerb(pair.rawFrom || pair.from);
    if (!picked.has(from)) continue;
    const target = pair.targets.find((t) => picked.has(t) && t !== from);
    if (!target) continue;
    hits.push({ a: from, b: target, rawFrom: pair.rawFrom, rawTarget: target });
  }
  // 去重（A→B 与 B→A 视为同一条）
  const seen = new Set();
  return hits.filter((h) => {
    const key = [h.a, h.b].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 同时含有药盘全部药材的成方
function formulasCovering(meds) {
  if (!meds.length) return [];
  const need = meds.map(normHerb);
  return state.formulas.filter((formula) => {
    const bases = new Set(formula.compose.map((c) => c.base));
    return need.every((n) => bases.has(n));
  });
}

/* ---------------- 渲染 ---------------- */

function renderSuggestions(keyword) {
  const q = String(keyword || "").trim();
  if (!q) {
    el.suggest.innerHTML = "";
    el.suggest.classList.remove("open");
    return;
  }
  const base = normHerb(q);
  if (!base) {
    el.suggest.innerHTML = "";
    el.suggest.classList.remove("open");
    return;
  }
  const matched = state.herbNames
    .filter((n) => n && (n.includes(base) || base.includes(n)))
    .slice(0, 8);
  const aliasHit = Object.keys(state.alias)
    .filter((k) => k.includes(q))
    .slice(0, 4)
    .map((k) => ({ label: `${k} → ${state.alias[k]}`, value: state.alias[k] }));

  const items = [
    ...matched.map((n) => ({ label: n, value: n })),
    ...aliasHit,
  ];
  if (!items.length) {
    el.suggest.innerHTML = "";
    el.suggest.classList.remove("open");
    return;
  }
  el.suggest.innerHTML = items
    .map(
      (item) =>
        `<button type="button" data-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`
    )
    .join("");
  el.suggest.classList.add("open");
}

function flashSuggestion(text) {
  el.suggest.innerHTML = `<div class="suggest-note">${text}</div>`;
  el.suggest.classList.add("open");
  clearTimeout(flashSuggestion.timer);
  flashSuggestion.timer = setTimeout(() => {
    el.suggest.classList.remove("open");
    el.suggest.innerHTML = "";
  }, 2200);
}

function renderTray() {
  if (!state.meds.length) {
    el.tray.innerHTML = `<span class="tray-hint">药盘为空 · 选 2 味以上可查配伍禁忌</span>`;
    return;
  }
  el.tray.innerHTML =
    state.meds
      .map(
        (name) =>
          `<span class="chip">${escapeHtml(name)}<button type="button" data-remove="${escapeHtml(name)}" aria-label="移除 ${escapeHtml(name)}">×</button></span>`
      )
      .join("") +
    `<button type="button" class="chip-clear" data-clear>清空</button>`;
}

function safetyTags(info) {
  if (!info) return "";
  const tags = [];
  if (info.toxic) tags.push(`<span class="tag tag-toxic">${escapeHtml(info.toxicity || "有毒")}</span>`);
  if (info.pregnancy) tags.push(`<span class="tag tag-preg">孕妇${escapeHtml(info.pregnancy)}</span>`);
  return tags.join("");
}

function renderBoard() {
  const parts = [];

  if (!state.meds.length) {
    parts.push(`
      <div class="panel panel-empty">
        <h2>怎么用</h2>
        <ol>
          <li>输入药材名加入药盘，支持俗名（全虫 / 田七 / 国老 / 元胡）</li>
          <li>选 2 味以上，自动比对药典【注意】里的「不宜与…同用」（十八反十九畏）</li>
          <li>再加一味，看哪些成方同时含有这些药 —— 这是背方剂组成最省力的方式</li>
        </ol>
      </div>
    `);
    el.board.innerHTML = parts.join("");
    return;
  }

  // 1. 配伍禁忌
  const conflicts = findConflicts();
  if (conflicts.length) {
    parts.push(`
      <div class="panel panel-warn">
        <h2>配伍禁忌 ${conflicts.length}</h2>
        ${conflicts
          .map(
            (h) =>
              `<div class="conflict-row">
                 <strong>${escapeHtml(h.a)}</strong>
                 <span class="arrow">✕</span>
                 <strong>${escapeHtml(h.b)}</strong>
                 <span class="conflict-note">药典【注意】：不宜同用</span>
               </div>`
          )
          .join("")}
        <p class="panel-foot">依据《中国药典》2025 年版一部各药材【注意】项，属十八反十九畏范畴。</p>
      </div>
    `);
  } else {
    parts.push(`
      <div class="panel panel-ok">
        <h2>配伍禁忌</h2>
        <p>药盘中未检出药典明示的配伍禁忌。</p>
        <p class="panel-foot">「未检出」不等于安全：药典只收录部分禁忌，临床配伍还受剂量、煎法、个体影响。</p>
      </div>
    `);
  }

  // 2. 安全提示
  const risky = state.meds
    .map((name) => ({ name, info: safetyOf(name) }))
    .filter((x) => x.info && (x.info.toxic || x.info.pregnancy));
  if (risky.length) {
    parts.push(`
      <div class="panel">
        <h2>安全提示</h2>
        ${risky
          .map(
            (x) => `
              <div class="safe-row">
                <span class="safe-name">${escapeHtml(x.info.title)}</span>
                ${safetyTags(x.info)}
                <span class="safe-meta">第 ${x.info.page} 页</span>
              </div>
              ${x.info.caution ? `<div class="safe-caution">${escapeHtml(x.info.caution)}</div>` : ""}
            `
          )
          .join("")}
      </div>
    `);
  }

  // 3. 含药成方
  const covered = formulasCovering(state.meds);
  parts.push(`
    <div class="panel">
      <h2>同时含这 ${state.meds.length} 味的成方 <span class="count">${covered.length}</span></h2>
      ${
        covered.length
          ? `<div class="formula-list">${covered
              .slice(0, 60)
              .map(
                (f) => `
                  <article class="formula-card" data-formula="${f.id}" tabindex="0" role="button">
                    <div class="formula-title">${escapeHtml(f.title)}</div>
                    <div class="formula-compose">${f.compose
                      .map((c) =>
                        state.meds.includes(c.base)
                          ? `<mark>${escapeHtml(c.name)}</mark>`
                          : escapeHtml(c.name)
                      )
                      .join(" · ")}</div>
                    <div class="formula-func">${escapeHtml(f.functions || "")}</div>
                  </article>
                `
              )
              .join("")}</div>
              ${covered.length > 60 ? `<p class="panel-foot">仅显示前 60 个，共 ${covered.length} 个。</p>` : ""}`
          : `<p>没有成方同时含有这些药材。</p>`
      }
    </div>
  `);

  el.board.innerHTML = parts.join("");
}

function render() {
  renderTray();
  renderBoard();
}

/* ---------------- 成方详情 ---------------- */

function openFormula(id) {
  const f = state.formulas.find((x) => x.id === Number(id));
  if (!f) return;
  el.detailTitle.textContent = f.title;
  el.detailMeta.textContent = f.page ? `第 ${f.page} 页` : "";
  el.detailBody.innerHTML = `
    <section class="field">
      <h3>处方</h3>
      <ul class="compose-list">
        ${f.compose
          .map(
            (c) =>
              `<li><span>${escapeHtml(c.name)}</span><span class="dose">${
                c.amount === null ? "适量" : c.amount + c.unit
              }</span></li>`
          )
          .join("")}
      </ul>
    </section>
    ${f.functions ? `<section class="field"><h3>功能与主治</h3><p>${escapeHtml(f.functions)}</p></section>` : ""}
    ${f.usage ? `<section class="field"><h3>用法与用量</h3><p>${escapeHtml(f.usage)}</p></section>` : ""}
    ${f.caution ? `<section class="field"><h3>注意</h3><p>${escapeHtml(f.caution)}</p></section>` : ""}
  `;
  el.detailBody.scrollTop = 0;
  el.detail.classList.add("open");
  el.detail.setAttribute("aria-hidden", "false");
  el.detail.querySelector(".close")?.focus();
}

function closeDetail() {
  el.detail.classList.remove("open");
  el.detail.setAttribute("aria-hidden", "true");
}

/* ---------------- 事件 ---------------- */

el.input.addEventListener("input", (event) => renderSuggestions(event.target.value));

el.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = el.suggest.querySelector("button[data-value]");
    addMed(first ? first.dataset.value : el.input.value);
  }
  if (event.key === "Escape") {
    el.suggest.classList.remove("open");
  }
});

el.suggest.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-value]");
  if (!button) return;
  addMed(button.dataset.value);
  el.input.focus();
});

el.tray.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove]");
  if (remove) return removeMed(remove.dataset.remove);
  if (event.target.closest("[data-clear]")) {
    state.meds = [];
    render();
  }
});

el.board.addEventListener("click", (event) => {
  const card = event.target.closest(".formula-card[data-formula]");
  if (card) openFormula(card.dataset.formula);
});

el.board.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".formula-card[data-formula]");
  if (!card) return;
  event.preventDefault();
  openFormula(card.dataset.formula);
});

el.detail.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closeDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-panel")) el.suggest.classList.remove("open");
});

load().catch((error) => {
  el.status.textContent = "加载失败";
  el.board.innerHTML = `<div class="panel panel-warn"><p>${escapeHtml(error.message)}</p></div>`;
});
