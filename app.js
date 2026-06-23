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
  } else if (currentTab === 'plan') {
    renderStudyPlan();
  }
}

// ═══════════════════════════════════════
// 14天冲刺计划
// ═══════════════════════════════════════

const PLAN_START = '2026-06-23';
let planMode = 'chapter';
let planRandomList = [];
let planRandomIdx = 0;
let planQuizList = [];
let planQuizIdx = 0;
let planQuizCorrect = 0;
let planQuizWrong = 0;

// Chapter definitions — herbs grouped by tags[0]
const CHAPTER_ORDER = [
  '解表药','清热药','泻下药','祛风湿药','化湿药','利水渗湿药',
  '温里药','理气药','消食药','驱虫药','止血药','活血化瘀药',
  '化痰止咳平喘药','安神药','平肝息风药','开窍药','补虚药','收涩药'
];

// 14 day plan: each day has [chapter, count] pairs
const DAY_PLAN = [
  { day: 1, label: '解表药 + 清热药(上)', chapters: { '解表药': 30, '清热药': 20 } },
  { day: 2, label: '清热药(下) + 泻下药 + 祛风湿药', chapters: { '清热药': 23, '泻下药': 9, '祛风湿药': 12 } },
  { day: 3, label: '化湿药 + 利水渗湿药 + 温里药', chapters: { '化湿药': 9, '利水渗湿药': 18, '温里药': 11 } },
  { day: 4, label: '理气药 + 消食药 + 驱虫药 + 止血药', chapters: { '理气药': 16, '消食药': 6, '驱虫药': 6, '止血药': 16 } },
  { day: 5, label: '活血化瘀药 + 化痰止咳平喘药', chapters: { '活血化瘀药': 22, '化痰止咳平喘药': 23 } },
  { day: 6, label: '安神药 + 平肝息风药 + 开窍药 + 补虚药(上)', chapters: { '安神药': 9, '平肝息风药': 13, '开窍药': 6, '补虚药': 15 } },
  { day: 7, label: '补虚药(下) + 收涩药 + 全复习', chapters: { '补虚药': 28, '收涩药': 15 } },
  { day: 8, label: '解表药 + 清热药 复习', chapters: { '解表药': 30, '清热药': 43 } },
  { day: 9, label: '泻下药→温里药 复习', chapters: { '泻下药': 9, '祛风湿药': 12, '化湿药': 9, '利水渗湿药': 18, '温里药': 11 } },
  { day: 10, label: '理气药→活血化瘀药 复习', chapters: { '理气药': 16, '消食药': 6, '驱虫药': 6, '止血药': 16, '活血化瘀药': 22 } },
  { day: 11, label: '化痰止咳→补虚(上半) 复习', chapters: { '化痰止咳平喘药': 23, '安神药': 9, '平肝息风药': 13, '补虚药': 25 } },
  { day: 12, label: '补虚(下半)+收涩 复习', chapters: { '补虚药': 18, '收涩药': 15, '开窍药': 6 } },
  { day: 13, label: '弱点攻坚(错题重点)', chapters: {} },
  { day: 14, label: '全量扫尾(350味快速过)', chapters: {} }
];

function getPlanProgress() {
  let p = localStorage.getItem('zhongyao-plan');
  return p ? JSON.parse(p) : {};
}
function savePlanProgress(p) { localStorage.setItem('zhongyao-plan', JSON.stringify(p)); }

function getPlanDay() {
  let today = new Date().toISOString().slice(0, 10);
  let start = new Date(PLAN_START);
  let now = new Date(today);
  let diff = Math.floor((now - start) / 86400000);
  return Math.min(Math.max(diff + 1, 1), 14);
}

function renderStudyPlan() {
  document.getElementById('filterSection').style.display = 'none';
  document.getElementById('cardList').innerHTML = '';
  document.getElementById('learnStatsSection').classList.remove('show');
  document.getElementById('studyPlanSection').style.display = 'block';

  let curDay = getPlanDay();
  let daysLeft = 14 - curDay + 1;
  let planInfo = DAY_PLAN[curDay - 1];
  let progress = getPlanProgress();
  let todayKey = 'day' + curDay;

  // Countdown
  document.getElementById('planCountdown').innerHTML = `
    <div class="countdown-badge">📅 第 ${curDay}/14 天</div>
    <div class="countdown-days">距考试还有 <strong>${daysLeft}</strong> 天</div>
    <div class="countdown-label">${planInfo.label}</div>
    <div class="countdown-progress">
      <div class="countdown-bar" style="width:${(curDay/14*100)}%"></div>
    </div>
  `;

  renderDaySelector(curDay);
  renderChapterGrid(curDay, progress, todayKey);
}

function renderDaySelector(curDay) {
  let el = document.getElementById('planDaySelector');
  el.innerHTML = DAY_PLAN.map((d, i) => {
    let cls = (i + 1) === curDay ? 'plan-day-btn today' : (i + 1) < curDay ? 'plan-day-btn done' : 'plan-day-btn';
    return `<button class="${cls}" onclick="switchPlanDay(${i+1})">D${i+1}</button>`;
  }).join('');
}

function switchPlanDay(day) {
  let el = document.getElementById('planDaySelector');
  el.querySelectorAll('.plan-day-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderChapterGridForDay(day);
}

function renderChapterGrid(curDay, progress, todayKey) {
  renderChapterGridForDay(curDay);
}

function renderChapterGridForDay(day) {
  let planInfo = DAY_PLAN[day - 1];
  let progress = getPlanProgress();
  let todayKey = 'day' + day;
  let dayProgress = progress[todayKey] || {};
  let grid = document.getElementById('planChapterGrid');

  // Day 13-14 special: use all herbs
  let herbsToShow = [];
  if (day === 13) {
    // Weakness day - show herbs marked wrong in quiz
    let wrong = JSON.parse(localStorage.getItem('zhongyao-plan-wrong') || '[]');
    herbsToShow = TCM_HERBS.filter(h => wrong.includes(h.name));
    if (herbsToShow.length === 0) herbsToShow = TCM_HERBS;
  } else if (day === 14) {
    herbsToShow = TCM_HERBS;
  }

  let html = '';
  let totalDone = 0;
  let totalAll = 0;

  if (day >= 13) {
    // Day 13-14: all herbs flat list
    let allHerbs = day === 13 ? herbsToShow : TCM_HERBS;
    html += `<div class="plan-chapter-block"><h4 class="plan-chapter-name">${day===13?'弱点攻坚(错题重点)':'全量扫尾'}</h4><div class="plan-herb-list">`;
    allHerbs.forEach(h => {
      let done = dayProgress[h.id] ? 'done' : '';
      if (dayProgress[h.id]) totalDone++;
      totalAll++;
      let levelTag = h.level === '掌握' ? '<span class="plan-herb-lv lv-master">掌</span>' :
                     h.level === '熟悉' ? '<span class="plan-herb-lv lv-familiar">熟</span>' :
                     '<span class="plan-herb-lv lv-understand">了</span>';
      html += `<span class="plan-herb-tag ${done}" onclick="togglePlanHerb('day${day}','${h.id}')">${levelTag}${h.name}</span>`;
    });
    html += '</div></div><div class="plan-chapter-progress">已背 <strong id="planDoneCount">${totalDone}</strong> / ${totalAll}</div>';
  } else {
    // Day 1-12: grouped by chapter
    let chs = planInfo.chapters;
    for (let [chName, target] of Object.entries(chs)) {
      let herbs = TCM_HERBS.filter(h => h.tags[0].includes(chName.replace('药','')) || h.tags[0] === chName);
      let done = herbs.filter(h => dayProgress[h.id]).length;
      totalDone += done;
      totalAll += herbs.length;

      html += `<div class="plan-chapter-block">
        <h4 class="plan-chapter-name">${chName} <span class="plan-chapter-stat">${done}/${herbs.length}</span>
          <span class="plan-chapter-bar-wrap"><span class="plan-chapter-bar" style="width:${herbs.length?done/herbs.length*100:0}%"></span></span>
        </h4>
        <div class="plan-herb-list">`;

      herbs.forEach(h => {
        let doneCls = dayProgress[h.id] ? 'done' : '';
        let levelTag = h.level === '掌握' ? '<span class="plan-herb-lv lv-master">掌</span>' :
                       h.level === '熟悉' ? '<span class="plan-herb-lv lv-familiar">熟</span>' :
                       '<span class="plan-herb-lv lv-understand">了</span>';
        html += `<span class="plan-herb-tag ${doneCls}" onclick="togglePlanHerb('day${day}','${h.id}')" ondblclick="goToHerb('${h.name}')" title="双击查看详情">${levelTag}${h.name}</span>`;
      });

      html += '</div></div>';
    }
    html += `<div class="plan-chapter-progress">今日已背 <strong id="planDoneCount">${totalDone}</strong> / ${totalAll}</div>`;
  }

  grid.innerHTML = html;
}

function goToHerb(name) {
  currentTab = 'herbs';
  document.getElementById('search').value = name;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.nav-tab[data-tab="herbs"]').classList.add('active');
  document.getElementById('studyPlanSection').style.display = 'none';
  document.getElementById('filterSection').style.display = 'block';
  render();
}

function togglePlanHerb(dayKey, herbId) {
  let p = getPlanProgress();
  if (!p[dayKey]) p[dayKey] = {};
  if (p[dayKey][herbId]) {
    delete p[dayKey][herbId];
  } else {
    p[dayKey][herbId] = true;
  }
  savePlanProgress(p);

  // Update visual
  let el = event.target;
  el.classList.toggle('done');

  // Update count
  let cnt = document.getElementById('planDoneCount');
  if (cnt) {
    let cur = parseInt(cnt.textContent);
    cnt.textContent = p[dayKey][herbId] ? (cur + 1) : (cur - 1);
  }
}

function switchPlanMode(mode) {
  planMode = mode;
  document.querySelectorAll('.plan-mode-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('planChapterMode').style.display = mode === 'chapter' ? 'block' : 'none';
  document.getElementById('planRandomMode').style.display = mode === 'random' ? 'block' : 'none';
  if (mode === 'random') startRandomStudy();
}

function startRandomStudy() {
  let level = document.getElementById('planRandomLevel').value;
  let herbs = level === 'all' ? [...TCM_HERBS] : TCM_HERBS.filter(h => h.level === level);
  // Shuffle
  for (let i = herbs.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [herbs[i], herbs[j]] = [herbs[j], herbs[i]];
  }
  planRandomList = herbs;
  planRandomIdx = 0;
  document.getElementById('planRandomCount').textContent = `0/${herbs.length}`;
  renderRandomCard();
}

function renderRandomCard() {
  let cards = document.getElementById('planRandomCards');
  if (planRandomIdx >= planRandomList.length) {
    cards.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎉</div><div class="empty-state-text">本轮背诵完成！点击换一批继续</div></div>';
    document.getElementById('planRandomCount').textContent = planRandomList.length + '/' + planRandomList.length;
    return;
  }

  let h = planRandomList[planRandomIdx];
  let progress = getPlanProgress();
  let curDay = getPlanDay();
  let dayProgress = progress['day' + curDay] || {};
  let isDone = dayProgress[h.id];
  let levelColor = { '掌握': 'var(--cinnabar-600)', '熟悉': 'var(--familiar)', '了解': 'var(--herb-green-600)' };
  let levelStyle = levelColor[h.level] || '';

  cards.innerHTML = `
    <div class="random-card">
      <div class="random-card-header" style="background:${levelStyle};">
        <span class="random-card-name" onclick="goToHerb('${h.name}')" style="cursor:pointer;" title="点击查看详情">${h.name}</span>
        <span class="random-card-level">${h.level}级</span>
        ${isDone ? '<span class="random-card-done">✅</span>' : ''}
      </div>
      <div class="random-card-body">
        <div class="random-card-section">
          <span class="random-card-label">功效</span>
          <span class="random-card-value">${h.summary}</span>
        </div>
        <div class="random-card-section">
          <span class="random-card-label">性味</span>
          <span class="random-card-value">${h.siqi} · ${h.wuwei}</span>
        </div>
        <div class="random-card-section">
          <span class="random-card-label">归经</span>
          <span class="random-card-value">${h.guijing || '—'}</span>
        </div>
        <div class="random-card-section">
          <span class="random-card-label">分类</span>
          <span class="random-card-value">${h.tags.join(' · ')}</span>
        </div>
      </div>
      <div class="random-card-actions">
        <button class="random-btn random-btn-pass" onclick="randomMarkDone('${h.id}')">✅ 会了</button>
        <button class="random-btn random-btn-next" onclick="randomNext()">➡️ 看过了</button>
        <button class="random-btn random-btn-again" onclick="randomAgain('${h.id}')">🔁 再背一次</button>
      </div>
    </div>
    <div class="random-progress">
      <div class="random-progress-bar" style="width:${(planRandomIdx+1)/planRandomList.length*100}%"></div>
      <span>${planRandomIdx + 1} / ${planRandomList.length}</span>
    </div>
  `;
}

function randomMarkDone(id) {
  let curDay = getPlanDay();
  let dayKey = 'day' + curDay;
  let p = getPlanProgress();
  if (!p[dayKey]) p[dayKey] = {};
  p[dayKey][id] = true;
  savePlanProgress(p);
  randomNext();
}

function randomNext() {
  planRandomIdx++;
  if (planRandomIdx >= planRandomList.length) {
    planRandomIdx = 0;
    // Re-shuffle wrong ones
  }
  renderRandomCard();
  document.getElementById('planRandomCount').textContent = (planRandomIdx) + '/' + planRandomList.length;
}

function randomAgain(id) {
  planRandomList.push(planRandomList[planRandomIdx]);
  randomNext();
}

// Quiz mode
function initPlanQuizChapters() {
  let sel = document.getElementById('planQuizChapter');
  sel.innerHTML = '<option value="all">全部章节</option>' +
    CHAPTER_ORDER.map(c => `<option value="${c}">${c}</option>`).join('');
}

function restartPlanQuiz() {
  let level = document.getElementById('planQuizLevel').value;
  let chapter = document.getElementById('planQuizChapter').value;
  let herbs = TCM_HERBS;

  if (level !== 'all') herbs = herbs.filter(h => h.level === level);
  if (chapter !== 'all') herbs = herbs.filter(h => h.tags[0] === chapter);

  // Shuffle
  for (let i = herbs.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [herbs[i], herbs[j]] = [herbs[j], herbs[i]];
  }

  planQuizList = herbs;
  planQuizIdx = 0;
  planQuizCorrect = 0;
  planQuizWrong = 0;

  document.getElementById('planQuizTotal').textContent = '0';
  document.getElementById('planQuizCorrect').textContent = '0';
  document.getElementById('planQuizWrong').textContent = '0';
  document.getElementById('planQuizRate').textContent = '0%';
  document.getElementById('planQuizAnswer').style.display = 'none';

  renderPlanQuiz();
}

function renderPlanQuiz() {
  if (planQuizIdx >= planQuizList.length) {
    document.getElementById('planQuizQuestion').textContent = '🎉 题目全部做完！';
    document.getElementById('planQuizAnswer').style.display = 'none';
    document.getElementById('planQuizAnswer').textContent = '';
    return;
  }

  let h = planQuizList[planQuizIdx];
  // Random question type
  let qType = Math.floor(Math.random() * 3);

  if (qType === 0) {
    // 药名→功效
    document.getElementById('planQuizQuestion').innerHTML = `<strong>${h.name}</strong> 的功效是？`;
    document.getElementById('planQuizAnswer').innerHTML = `<div class="plan-answer-box">${h.summary}</div>
      <div class="plan-answer-extra">四气：${h.siqi} · 五味：${h.wuwei} · 归经：${h.guijing || '—'} · 分类：${(h.tags || []).join('、')}</div>`;
  } else if (qType === 1) {
    // 功效→药名
    document.getElementById('planQuizQuestion').innerHTML = `具有「<strong>${h.summary}</strong>」功效的药是？`;
    document.getElementById('planQuizAnswer').innerHTML = `<div class="plan-answer-box">${h.name}</div>
      <div class="plan-answer-extra">四气：${h.siqi} · 五味：${h.wuwei} · 等级：${h.level}</div>`;
  } else {
    // 归经匹配
    document.getElementById('planQuizQuestion').innerHTML = `<strong>${h.name}</strong> 的归经是？`;
    document.getElementById('planQuizAnswer').innerHTML = `<div class="plan-answer-box">${h.guijing || '—'}</div>
      <div class="plan-answer-extra">功效：${h.summary} · 等级：${h.level}</div>`;
  }
  document.getElementById('planQuizAnswer').style.display = 'none';
}

function showPlanQuizAnswer() {
  document.getElementById('planQuizAnswer').style.display = 'block';
}

function markPlanQuiz(correct) {
  let total = planQuizCorrect + planQuizWrong + 1;
  if (correct) {
    planQuizCorrect++;
  } else {
    planQuizWrong++;
    // Save to wrong list
    let wrong = JSON.parse(localStorage.getItem('zhongyao-plan-wrong') || '[]');
    let h = planQuizList[planQuizIdx];
    if (!wrong.includes(h.name)) {
      wrong.push(h.name);
      localStorage.setItem('zhongyao-plan-wrong', JSON.stringify(wrong));
    }
  }

  document.getElementById('planQuizTotal').textContent = total;
  document.getElementById('planQuizCorrect').textContent = planQuizCorrect;
  document.getElementById('planQuizWrong').textContent = planQuizWrong;
  document.getElementById('planQuizRate').textContent = Math.round(planQuizCorrect/total*100) + '%';

  planQuizIdx++;
  renderPlanQuiz();
}

function nextPlanQuiz() {
  if (planQuizIdx >= planQuizList.length) {
    restartPlanQuiz();
    return;
  }
  planQuizIdx++;
  renderPlanQuiz();
}

// Init plan quiz chapters on load
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(initPlanQuizChapters, 500);
});

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
