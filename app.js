/* ============================================
   中药学备考全书 - 应用逻辑
   ============================================ */

// ── 状态变量 ──
let currentTab = 'herbs';
let currentLevel = 'all';
let currentCate = 'all';
let currentSiqi = 'all';
let currentWuwei = 'all';
let quizList = [];
let currentQuizIndex = 0;
let quizCorrect = 0;
let quizWrong = 0;
let quizTotal = 0;
let quizMode = 'name-to-effect';
let quizWrongList = [];

// ── 学习进度 ──
function getProgress() {
  let p = localStorage.getItem('zhongyao-progress');
  if (!p) {
    p = {};
    TCM_HERBS.forEach(h => { p[h.id] = 'unlearned'; });
    localStorage.setItem('zhongyao-progress', JSON.stringify(p));
    return p;
  }
  try { return JSON.parse(p); } catch(e) { return {}; }
}

function saveProgress(progress) {
  localStorage.setItem('zhongyao-progress', JSON.stringify(progress));
}

function setStatus(herbId, status) {
  let p = getProgress();
  p[herbId] = status;
  saveProgress(p);
}

function getStatus(herbId) {
  let p = getProgress();
  return p[herbId] || 'unlearned';
}

function cycleStatus(herbId) {
  const order = ['unlearned', 'review', 'mastered'];
  let cur = getStatus(herbId);
  let idx = order.indexOf(cur);
  let next = order[(idx + 1) % order.length];
  setStatus(herbId, next);
  return next;
}

function getProgressStats() {
  let p = getProgress();
  let total = TCM_HERBS.length;
  let mastered = 0, review = 0, unlearned = 0;
  TCM_HERBS.forEach(h => {
    let s = p[h.id] || 'unlearned';
    if (s === 'mastered') mastered++;
    else if (s === 'review') review++;
    else unlearned++;
  });
  return { total, mastered, review, unlearned, rate: total ? Math.round(mastered/total*100) : 0 };
}

// ── 学习统计仪表盘 ──
function renderDashboard() {
  let stats = getProgressStats();
  let el = document.getElementById('dashboardStats');
  if (!el) return;
  el.innerHTML = `
    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="stat-card-icon">🌿</div>
        <div class="stat-card-number">${stats.total}</div>
        <div class="stat-card-label">总药材数</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon">✅</div>
        <div class="stat-card-number">${stats.mastered}</div>
        <div class="stat-card-label">已掌握</div>
        <div class="stat-card-sub">${stats.rate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon">🔄</div>
        <div class="stat-card-number">${stats.review}</div>
        <div class="stat-card-label">待复习</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon">⚪</div>
        <div class="stat-card-number">${stats.unlearned}</div>
        <div class="stat-card-label">未学习</div>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-title">📊 各分类掌握情况</div>
      <div id="categoryChart"></div>
    </div>
  `;
  renderCategoryChart();
}

function renderCategoryChart() {
  let container = document.getElementById('categoryChart');
  if (!container) return;
  let p = getProgress();
  let cates = [...new Set(TCM_HERBS.map(h => h.tags[0]))];
  let html = '';
  cates.forEach(c => {
    let herbs = TCM_HERBS.filter(h => h.tags[0] === c);
    let total = herbs.length;
    let mastered = herbs.filter(h => (p[h.id] || 'unlearned') === 'mastered').length;
    let pct = total ? Math.round(mastered/total*100) : 0;
    html += `
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--ink-600);margin-bottom:4px;">
          <span>${c}</span>
          <span>${mastered}/${total}</span>
        </div>
        <div style="height:8px;background:var(--ink-50);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--herb-green-400),var(--herb-green-600));border-radius:4px;transition:width 0.6s ease;"></div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ── 更新进度条 ──
function updateProgressBar() {
  let stats = getProgressStats();
  let bar = document.getElementById('progressFill');
  let text = document.getElementById('progressText');
  let badge = document.getElementById('progressBadge');
  if (bar) bar.style.width = stats.rate + '%';
  if (text) text.textContent = stats.mastered + ' / ' + stats.total + ' 味';
  if (badge) badge.textContent = '掌握率 ' + stats.rate + '%';
}

// ── 搜索联想 ──
function renderSuggestions(query) {
  let wrap = document.getElementById('searchSuggestions');
  if (!wrap) return;
  if (!query || query.length < 1) {
    wrap.classList.remove('show');
    return;
  }
  let kw = query.trim().toLowerCase();
  let matches = TCM_HERBS.filter(h =>
    h.name.includes(kw) ||
    h.summary.includes(kw) ||
    h.tags.join('').includes(kw)
  ).slice(0, 8);

  if (matches.length === 0) {
    wrap.classList.remove('show');
    return;
  }

  wrap.innerHTML = matches.map(h => {
    let nameHtml = h.name.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<span class="sug-highlight">${m}</span>`);
    return `<div class="suggestion-item" data-id="${h.id}" onclick="selectSuggestion('${h.id}')">
      <span class="sug-name">${nameHtml}</span>
      <span class="sug-tag">${h.level} · ${h.tags[0]}</span>
    </div>`;
  }).join('');
  wrap.classList.add('show');
}

function selectSuggestion(id) {
  let herb = TCM_HERBS.find(h => h.id === id);
  if (!herb) return;
  document.getElementById('search').value = herb.name;
  document.getElementById('searchSuggestions').classList.remove('show');
  render();
}

// ── 级别颜色 ──
const LEVEL_STYLES = {
  '掌握': { bg: 'linear-gradient(135deg,var(--cinnabar-600),var(--cinnabar-700))', label: '掌握' },
  '熟悉': { bg: 'linear-gradient(135deg,var(--familiar),#B8730A)', label: '熟悉' },
  '了解': { bg: 'linear-gradient(135deg,var(--herb-green-600),var(--herb-green-700))', label: '了解' }
};

// ── 更新结果数 ──
function updateResultsInfo(count, tab) {
  let info = document.getElementById('resultsInfo');
  let cnt = document.getElementById('resultsCount');
  let ctx = document.getElementById('resultsContext');
  if (!info) return;
  if (tab === 'herbs') {
    info.style.display = 'flex';
    cnt.textContent = count;
    if (ctx) ctx.textContent = '包含搜索筛选条件';
  } else {
    info.style.display = 'none';
  }
}

// ── 渲染中药列表 ──
function renderHerbs() {
  let kw = document.getElementById('search').value.trim().toLowerCase();
  let arr = TCM_HERBS;

  if (currentLevel !== 'all') arr = arr.filter(h => h.level === currentLevel);
  if (currentCate !== 'all') arr = arr.filter(h => h.tags[0] === currentCate);
  if (currentSiqi !== 'all') arr = arr.filter(h => h.siqi.includes(currentSiqi));
  if (currentWuwei !== 'all') arr = arr.filter(h => h.wuwei.includes(currentWuwei));
  if (kw) {
    arr = arr.filter(h =>
      h.name.includes(kw) ||
      h.summary.includes(kw) ||
      (h.tags && h.tags.join(',').includes(kw))
    );
  }

  let wrap = document.getElementById('cardList');
  if (!wrap) return;
  wrap.innerHTML = '';
  updateResultsInfo(arr.length, 'herbs');

  if (arr.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">没有找到匹配的药材<br>试试其他关键词或筛选条件</div></div>';
    return;
  }

  let p = getProgress();
  arr.forEach((item, idx) => {
    let style = LEVEL_STYLES[item.level] || LEVEL_STYLES['了解'];
    let status = p[item.id] || 'unlearned';
    let statusLabels = { mastered: '✅ 已掌握', review: '🔄 待复习', unlearned: '⚪ 未学习' };
    let statusClasses = { mastered: 'mastered', review: 'review', unlearned: 'unlearned' };

    let gjHtml = item.guijing ? `<span class="herb-tag-guijing">归经：${item.guijing}</span>` : '';

    let card = document.createElement('div');
    card.className = 'herb-card';
    card.style.animationDelay = (idx * 0.03) + 's';
    card.innerHTML = `
      <div class="herb-card-header" style="background:${style.bg};">
        <span class="herb-card-name">${item.name}</span>
        <span class="herb-card-level">${style.label}</span>
      </div>
      <div class="herb-card-body">
        <div class="herb-tags">
          ${gjHtml}
          ${item.tags.map(t => `<span class="herb-tag">${t}</span>`).join('')}
        </div>
        <div class="herb-summary">${item.summary}</div>
        <div class="herb-detail" id="detail-${item.id}">
          <div class="herb-detail-row">
            <span class="herb-detail-label">四气</span>
            <span class="herb-detail-value"><span class="herb-tag">${item.siqi}</span></span>
          </div>
          <div class="herb-detail-row">
            <span class="herb-detail-label">五味</span>
            <span class="herb-detail-value"><span class="herb-tag">${item.wuwei}</span></span>
          </div>
          <div style="margin-top:8px;">
            <button class="study-status ${statusClasses[status]}" data-id="${item.id}" onclick="event.stopPropagation();toggleStatus('${item.id}')">
              ${statusLabels[status]}
            </button>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', function() {
      let detail = document.getElementById('detail-' + item.id);
      if (detail) detail.classList.toggle('show');
    });

    wrap.appendChild(card);
  });
}

// ── 切换学习状态 ──
function toggleStatus(id) {
  let next = cycleStatus(id);
  let labels = { mastered: '✅ 已掌握', review: '🔄 待复习', unlearned: '⚪ 未学习' };
  let classes = { mastered: 'mastered', review: 'review', unlearned: 'unlearned' };

  let btns = document.querySelectorAll(`.study-status[data-id="${id}"]`);
  btns.forEach(b => {
    b.textContent = labels[next];
    b.className = 'study-status ' + classes[next];
  });

  updateProgressBar();
  renderDashboard();
}

// ── 渲染别名 ──
function renderAlias() {
  let kw = document.getElementById('search').value.trim().toLowerCase();
  let arr = ALIAS_DATA;
  if (kw) arr = arr.filter(a => a.alias.includes(kw) || a.name.includes(kw) || a.func.includes(kw));
  let wrap = document.getElementById('cardList');
  if (!wrap) return;
  wrap.innerHTML = '';
  updateResultsInfo(0, 'alias');

  if (arr.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">没有找到匹配的别名</div></div>';
    return;
  }

  arr.forEach((item, idx) => {
    let card = document.createElement('div');
    card.className = 'herb-card alias-card';
    card.style.animationDelay = (idx * 0.02) + 's';
    card.innerHTML = `
      <div class="alias-header">
        <div class="alias-name">${item.alias}</div>
        <div class="alias-real">正名：<strong>${item.name}</strong></div>
      </div>
      <div class="herb-card-body">
        <div class="alias-func">${item.func}</div>
      </div>
    `;
    wrap.appendChild(card);
  });
}

// ── 渲染歌诀 ──
function renderSongs() {
  let kw = document.getElementById('search').value.trim().toLowerCase();
  let arr = SONGS_DATA;
  if (kw) arr = arr.filter(s => s.title.includes(kw) || s.content.includes(kw));
  let wrap = document.getElementById('cardList');
  if (!wrap) return;
  wrap.innerHTML = '';
  updateResultsInfo(0, 'songs');

  if (arr.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><div class="empty-state-text">没有找到匹配的歌诀</div></div>';
    return;
  }

  arr.forEach((item, idx) => {
    let card = document.createElement('div');
    card.className = 'herb-card songs-card';
    card.style.animationDelay = (idx * 0.03) + 's';
    card.innerHTML = `
      <div class="songs-title">📜 ${item.title}</div>
      <div class="songs-content">${item.content}</div>
    `;
    wrap.appendChild(card);
  });
}

// ── 渲染随机背诵 ──
function renderQuiz() {
  let wrap = document.getElementById('cardList');
  if (wrap) wrap.innerHTML = '';

  let allHerbs = [...TCM_HERBS];

  // 优先出错的题目
  let wrongIds = JSON.parse(localStorage.getItem('zhongyao-wrong') || '[]');
  let wrongHerbs = wrongIds.map(id => TCM_HERBS.find(h => h.id === id)).filter(Boolean);
  let repeatedWrong = [];
  wrongIds.forEach(id => {
    let h = TCM_HERBS.find(x => x.id === id);
    if (h) repeatedWrong.push(h);
  });

  // 混合：错题优先 + 随机
  quizList = [...repeatedWrong, ...allHerbs.filter(h => !wrongIds.includes(h.id))];
  quizList.sort(() => Math.random() - 0.5);

  currentQuizIndex = 0;
  quizCorrect = 0;
  quizWrong = 0;
  quizTotal = 0;
  quizWrongList = [];

  let qa = document.getElementById('quizArea');
  if (qa) {
    qa.classList.add('show');
    updateQuizUI();
    nextQuiz();
  }

  updateResultsInfo(0, 'quiz');
}

function updateQuizUI() {
  let totalEl = document.getElementById('quizTotal');
  let correctEl = document.getElementById('quizCorrect');
  let wrongEl = document.getElementById('quizWrong');
  if (totalEl) totalEl.textContent = quizTotal;
  if (correctEl) correctEl.textContent = quizCorrect;
  if (wrongEl) wrongEl.textContent = quizWrong;
}

function nextQuiz() {
  if (currentQuizIndex >= quizList.length) {
    // 全部答完
    let q = document.getElementById('quizQues');
    let a = document.getElementById('quizAns');
    if (q) q.textContent = '🎉 全部完成！共 ' + quizTotal + ' 题，正确 ' + quizCorrect + ' 题';
    if (a) {
      a.textContent = '正确率：' + (quizTotal ? Math.round(quizCorrect/quizTotal*100) : 0) + '% — 点击「重新开始」再来一轮';
      a.classList.add('show');
    }
    return;
  }

  let item = quizList[currentQuizIndex];
  let q = document.getElementById('quizQues');
  let a = document.getElementById('quizAns');
  if (!q) return;

  let mode = document.getElementById('quizModeSelect');
  quizMode = mode ? mode.value : 'name-to-effect';

  if (quizMode === 'name-to-effect') {
    q.textContent = item.name + ' 的功效是？';
  } else if (quizMode === 'effect-to-name') {
    q.textContent = '「' + item.summary + '」是哪味药的功效？';
  } else {
    q.textContent = item.name + ' 的归经是？';
  }

  if (a) {
    if (quizMode === 'name-to-effect') {
      a.textContent = '答：' + item.summary;
    } else if (quizMode === 'effect-to-name') {
      a.textContent = '答：' + item.name;
    } else {
      a.textContent = '答：' + (item.guijing || '未收录');
    }
    a.classList.remove('show');
  }

  currentQuizIndex++;
}

function showQuizAnswer() {
  let a = document.getElementById('quizAns');
  if (a) a.classList.add('show');
}

function markQuiz(correct) {
  if (currentQuizIndex <= 0) return;
  quizTotal++;
  if (correct) {
    quizCorrect++;
  } else {
    quizWrong++;
    let prevIdx = currentQuizIndex - 1;
    if (prevIdx < quizList.length) {
      let wrongItem = quizList[prevIdx];
      if (!quizWrongList.find(w => w.id === wrongItem.id)) {
        quizWrongList.push(wrongItem);
      }
      // 保存错题到 localStorage
      let wrongIds = JSON.parse(localStorage.getItem('zhongyao-wrong') || '[]');
      if (!wrongIds.includes(wrongItem.id)) {
        wrongIds.push(wrongItem.id);
        localStorage.setItem('zhongyao-wrong', JSON.stringify(wrongIds));
      }
    }
  }
  updateQuizUI();
  showQuizAnswer();
}

function restartQuiz() {
  renderQuiz();
}

// ── 主渲染函数 ──
function render() {
  document.getElementById('searchSuggestions')?.classList.remove('show');

  let qa = document.getElementById('quizArea');
  if (qa) qa.classList.remove('show');

  let ls = document.getElementById('learnStatsSection');
  if (ls) ls.classList.remove('show');

  // 显示对应 Tab 内容
  if (currentTab === 'herbs') {
    renderHerbs();
    document.getElementById('filterSection').style.display = 'block';
  } else if (currentTab === 'alias') {
    renderAlias();
    document.getElementById('filterSection').style.display = 'none';
  } else if (currentTab === 'songs') {
    renderSongs();
    document.getElementById('filterSection').style.display = 'none';
  } else if (currentTab === 'quiz') {
    renderQuiz();
    document.getElementById('filterSection').style.display = 'none';
  } else if (currentTab === 'stats') {
    document.getElementById('filterSection').style.display = 'none';
    let wrap = document.getElementById('cardList');
    if (wrap) wrap.innerHTML = '';
    let ls = document.getElementById('learnStatsSection');
    if (ls) {
      ls.classList.add('show');
      renderDashboard();
    }
  }
}

// ── 初始化大分类筛选 ──
function initCateFilter() {
  let cates = [...new Set(TCM_HERBS.map(h => h.tags[0]))];
  let wrap = document.getElementById('cateFilter');
  if (!wrap) return;
  let html = `<button class="filter-btn active" data-cate="all">全部类别</button>`;
  cates.forEach(c => {
    let count = TCM_HERBS.filter(h => h.tags[0] === c).length;
    html += `<button class="filter-btn" data-cate="${c}">${c} (${count})</button>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      wrap.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentCate = this.dataset.cate;
      render();
    });
  });
}

// ── 四气五味筛选 ──
function initSiqiFilter() {
  let filter = document.getElementById('siqiFilter');
  if (!filter) return;
  let siqis = ['all', '寒', '热', '温', '凉', '平', '微寒', '微温', '大热'];
  filter.innerHTML = siqis.map(s => {
    let active = s === 'all' ? 'active' : '';
    let label = s === 'all' ? '全部四气' : s;
    return `<button class="filter-btn ${active}" data-siqi="${s}">${label}</button>`;
  }).join('');
  filter.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      filter.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentSiqi = this.dataset.siqi;
      render();
    });
  });
}

function initWuweiFilter() {
  let filter = document.getElementById('wuweiFilter');
  if (!filter) return;
  let wuweis = ['all', '辛', '甘', '苦', '酸', '咸', '淡', '涩'];
  filter.innerHTML = wuweis.map(w => {
    let active = w === 'all' ? 'active' : '';
    let label = w === 'all' ? '全部五味' : w;
    return `<button class="filter-btn ${active}" data-wuwei="${w}">${label}</button>`;
  }).join('');
  filter.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      filter.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentWuwei = this.dataset.wuwei;
      render();
    });
  });
}

// ── Tab 切换 ──
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      currentTab = this.dataset.tab;
      render();
      // 更新导航栏计数
      updateTabCounts();
    });
  });
}

function updateTabCounts() {
  let counts = {
    herbs: TCM_HERBS.length,
    alias: ALIAS_DATA.length,
    songs: SONGS_DATA.length
  };
  document.querySelectorAll('.nav-tab').forEach(tab => {
    let t = tab.dataset.tab;
    let cnt = tab.querySelector('.nav-tab-count');
    if (cnt && counts[t]) {
      cnt.textContent = counts[t];
    }
  });
}

// ── 级别筛选 ──
function initLevelFilter() {
  document.querySelectorAll('#levelFilter .filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      this.parentNode.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentLevel = this.dataset.type;
      render();
    });
  });
}

// ── 搜索 ──
function initSearch() {
  let input = document.getElementById('search');
  let btn = document.getElementById('searchBtn');
  if (!input) return;

  input.addEventListener('input', function() {
    renderSuggestions(this.value);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      document.getElementById('searchSuggestions')?.classList.remove('show');
      render();
    }
  });

  // 点击外部关闭联想
  document.addEventListener('click', function(e) {
    let wrap = document.getElementById('searchSuggestions');
    let searchWrap = document.querySelector('.search-wrap');
    if (wrap && searchWrap && !searchWrap.contains(e.target)) {
      wrap.classList.remove('show');
    }
  });

  if (btn) {
    btn.addEventListener('click', function() {
      document.getElementById('searchSuggestions')?.classList.remove('show');
      render();
    });
  }
}

// ── 清除错题 ──
function clearWrong() {
  localStorage.setItem('zhongyao-wrong', '[]');
  alert('错题本已清空');
}

// ── 初始化 ──
function initApp() {
  initTabs();
  initCateFilter();
  initSiqiFilter();
  initWuweiFilter();
  initLevelFilter();
  initSearch();
  updateTabCounts();
  updateProgressBar();
  render();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
