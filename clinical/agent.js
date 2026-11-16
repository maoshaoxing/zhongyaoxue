/**
 * agent.js —— 中药学学习助手（页面内嵌 Agent）
 *
 * 悬浮在药典检索 / 方药研习两个页面右下角，复用同一个检索 Worker（rpc.js），
 * 支持四类问答：
 *   1. 查药        「黄连」「益母草的功效」→ 药典摘要卡，点击可开详情抽屉
 *   2. 病症找药    「高血压有什么药」→ 病症检索 Top 结果 + 跳转检索页
 *   3. 配伍禁忌    「人参和藜芦」→ 药典十八反十九畏核查
 *   4. 用药安全    「孕妇能吃益母草吗」「附子有毒吗」→ 毒性 / 妊娠禁忌
 * 全部回答基于《中国药典》2025 年版一部原文，不构成诊疗建议。
 */
(function () {
  "use strict";

  /* ---------------- 常量与工具 ---------------- */

  var STARTER_CHIPS = ["高血压有什么药", "失眠用什么药", "黄连的功效", "孕妇能吃益母草吗", "人参和藜芦"];

  var DRUG_QUERY_NOISE = [
    "请问", "查询", "帮我查", "查一下", "查查看", "告诉我", "介绍一下", "了解",
    "搜索", "搜下", "想了解", "什么是", "是什么", "多少钱", "价格", "图片",
    "的功效", "功效", "的作用", "作用", "主治什么", "主治", "性味归经", "归经",
    "用法用量", "用量", "怎么用", "怎么服用", "服用方法", "能治什么", "治什么",
    "是什么药", "这个药", "药性", "药效", "简介", "的介绍", "有什么用",
  ];

  var SAFETY_NOISE = [
    "孕妇", "怀孕", "妊娠", "备孕", "哺乳", "哺乳期", "哺乳期妇女",
    "能不能", "能不能吃", "可以吃", "可不可以", "能不能用", "能不能服用",
    "能吃", "能用", "能服用", "可以服用", "可以用吗", "吃吗", "服用吗", "用吗",
    "可以吗", "行吗", "吗", "？", "?", "了", "的", "有", "没",
  ];

  var TOXIC_NOISE = ["有毒", "毒性", "毒副作用", "副作用", "安全性", "安全", "大不大", "强不强", "吗", "？", "?", "有", "的", "不"];

  // 问句噪音：把「高血压有什么药」清洗成「高血压」再做检索
  var QUESTION_NOISE = [
    "有什么药", "有什么中药", "有什么中成药", "用什么药", "用什么中药",
    "吃什么药", "吃什么中药", "有什么方子", "有什么方", "有什么成药",
    "有哪些药", "有那些药", "有哪些中药", "有哪些成药", "有哪些",
    "怎么治疗", "怎么治", "咋治", "怎么调理", "如何调理", "怎么调",
    "怎么办", "怎么办呀", "怎么用药", "如何治", "如何治疗",
    "求推荐", "推荐一下", "推荐", "帮我找", "帮我查一下", "找一下", "查一下",
    "能不能治", "能治吗", "可以治吗", "能治",
    "什么药", "什么方", "什么中药", "哪些药", "几种药",
    "帮个忙", "看看", "谢谢", "请问", "帮我", "一下",
    "药", "中药", "方子", "处方", "成药", "中成药", "方剂",
    "治疗", "调治", "医治", "调养", "的", "了", "我", "想", "要",
    "？", "?", "。", "，", "!", "！",
  ];

  function trimNoise(text, noiseList) {
    var out = String(text || "");
    // 长词先替换，避免「能不能吃」被「能吃」截断后残留
    var list = noiseList.slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < list.length; i++) {
      out = out.split(list[i]).join("");
    }
    return out.trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function excerpt(text, term, len) {
    var body = String(text || "").replace(/\s+/g, " ");
    var at = body.indexOf(term);
    if (at < 0) at = 0;
    var start = Math.max(0, at - 10);
    var end = Math.min(body.length, start + (len || 90));
    return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
  }

  var CLINICAL_PAGE = "index.html";

  function searchPageLink(query, mode) {
    var url = CLINICAL_PAGE + "?q=" + encodeURIComponent(query);
    if (mode === "symptom") url += "&mode=symptom";
    return url;
  }

  function typeLabel(type) {
    return type === "formula" ? "成方制剂" : type === "extract" ? "提取物" : "药材饮片";
  }

  /* ---------------- UI 构建（自渲染，页面只需引两个 script） ---------------- */

  var ui = {};

  function buildUI() {
    var fab = document.createElement("button");
    fab.id = "agent-fab";
    fab.className = "agent-fab";
    fab.setAttribute("aria-label", "打开学习助手");
    fab.innerHTML = '<span class="agent-fab-icon">问</span><span class="agent-fab-text">学习助手</span>';

    var panel = document.createElement("aside");
    panel.id = "agent-panel";
    panel.className = "agent-panel";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = [
      '<header class="agent-head">',
      '  <div><h3>中医学习助手</h3><p>药典问答 · 病症找药 · 配伍核查</p></div>',
      '  <button class="agent-close" aria-label="收起">收起</button>',
      '</header>',
      '<div class="agent-body" id="agent-messages"></div>',
      '<div class="agent-chiprow" id="agent-chiprow"></div>',
      '<form class="agent-form" id="agent-form">',
      '  <input id="agent-input" type="text" autocomplete="off" placeholder="如：高血压有什么药 / 黄连 / 人参和藜芦">',
      '  <button type="submit">发送</button>',
      '</form>',
      '<p class="agent-foot">回答摘自《中国药典》2025 年版一部，仅供学习，不构成诊疗建议。</p>',
    ].join("");

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    ui.fab = fab;
    ui.panel = panel;
    ui.body = panel.querySelector("#agent-messages");
    ui.chiprow = panel.querySelector("#agent-chiprow");
    ui.form = panel.querySelector("#agent-form");
    ui.input = panel.querySelector("#agent-input");

    fab.addEventListener("click", open);
    panel.querySelector(".agent-close").addEventListener("click", close);

    ui.form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = ui.input.value.trim();
      if (!text) return;
      ui.input.value = "";
      userSaid(text);
      think(function () { answer(text); });
    });

    renderChips(STARTER_CHIPS);
  }

  function open() {
    ui.panel.classList.add("open");
    ui.panel.setAttribute("aria-hidden", "false");
    ui.fab.classList.add("hidden");
    if (!ui.body.children.length) {
      botSay(
        "你好，我是基于《中国药典》2025 年版一部（2290 条）的学习助手。可以问我：<br>" +
          "· <b>病症找药</b>：高血压、失眠、跌打损伤……<br>" +
          "· <b>查药</b>：黄连、田七（俗名也认）……<br>" +
          "· <b>配伍核查</b>：人参和藜芦能同用吗……<br>" +
          "· <b>用药安全</b>：孕妇能吃益母草吗……",
        true
      );
    }
    if (ZySearch.offline) {
      botSay("APK 离线包内暂不支持药典问答，请使用在线版：maoshaoxing.github.io/zhongyaoxue");
      ui.input.disabled = true;
      return;
    }
    think(function () { ZySearch.ensure(); });
    ui.input.focus();
  }

  function close() {
    ui.panel.classList.remove("open");
    ui.panel.setAttribute("aria-hidden", "true");
    ui.fab.classList.remove("hidden");
  }

  function renderChips(chips) {
    if (!chips || !chips.length) {
      ui.chiprow.innerHTML = "";
      return;
    }
    ui.chiprow.innerHTML = chips
      .map(function (c) { return '<button class="agent-chip" data-chip="' + escapeHtml(c) + '">' + escapeHtml(c) + "</button>"; })
      .join("");
  }

  ui.chipClick = function (text) { userSaid(text); think(function () { answer(text); }); };

  /* ---------------- 消息渲染 ---------------- */

  function scrollDown() {
    ui.body.scrollTop = ui.body.scrollHeight;
  }

  function userSaid(text) {
    var div = document.createElement("div");
    div.className = "agent-msg user";
    div.innerHTML = "<div class=\"agent-bubble\">" + escapeHtml(text) + "</div>";
    ui.body.appendChild(div);
    scrollDown();
  }

  function botSay(html, isIntro) {
    var div = document.createElement("div");
    div.className = "agent-msg bot";
    div.innerHTML = '<div class="agent-avatar">典</div><div class="agent-bubble">' + html + "</div>";
    ui.body.appendChild(div);
    if (!isIntro) renderChips(STARTER_CHIPS.slice(0, 3));
    scrollDown();
    return div;
  }

  function botThinking() {
    var div = document.createElement("div");
    div.className = "agent-msg bot";
    div.innerHTML = '<div class="agent-avatar">典</div><div class="agent-bubble agent-typing">正在核对药典…</div>';
    ui.body.appendChild(div);
    scrollDown();
    return div;
  }

  function think(fn) {
    var div = botThinking();
    // 让「正在核对」先渲染一帧
    setTimeout(function () {
      fn(div);
      div.remove();
    }, 200);
  }

  function drugCard(entry) {
    var effect = entry.clinical && entry.clinical["功能与主治"] ? excerpt(entry.clinical["功能与主治"], "", 110) : "";
    var safetyHtml = "";
    if (entry.safety) {
      var flags = [];
      if (entry.safety.toxic) flags.push('<span class="sflag sflag-toxic">' + escapeHtml(entry.safety.toxicity || "有毒") + "</span>");
      if (entry.safety.pregnancy) flags.push('<span class="sflag sflag-preg">孕妇' + escapeHtml(entry.safety.pregnancy) + "</span>");
      if (flags.length) safetyHtml = '<div class="sflag-row">' + flags.join("") + "</div>";
    }
    var clickable = typeof window.__zyDetail === "function";
    return (
      '<div class="agent-drug" data-id="' + entry.id + '" role="button" tabindex="0">' +
      '<div class="agent-drug-top"><b>' + escapeHtml(entry.title) + "</b>" +
      '<span class="agent-drug-type">' + typeLabel(entry.type) + "</span></div>" +
      (effect ? '<div class="agent-drug-eff">' + escapeHtml(effect) + "</div>" : "") +
      safetyHtml +
      (clickable ? '<div class="agent-drug-link">点击查看完整药典条文 →</div>' : "") +
      "</div>"
    );
  }

  /* ---------------- 意图识别与回答 ---------------- */

  function answer(text) {
    var q = String(text || "").trim();
    if (!q) return;

    // 妊娠 / 哺乳安全、毒性 / 配伍三类先按原句判断（依赖关键词，不受清洗影响）
    if (/孕妇|怀孕|妊娠|备孕|哺乳/.test(q)) return answerPregnancy(q);
    if (/毒性|有毒|毒副|副作用|安全性|安全吗/.test(q)) return answerToxic(q);

    var parts = q
      .split(/[和与跟同及、,，加]|一起|同用|配伍|合用|相配|配着/g)
      .map(function (s) { return s.replace(/[?？。！的能用吃服可吗个味种药片丸汤膏散冲剂水]/g, "").trim(); })
      .filter(function (s) { return s.length >= 2; });
    if (parts.length >= 2) {
      var distinct = [];
      parts.forEach(function (p) { if (!distinct.includes(p)) distinct.push(p); });
      if (distinct.length >= 2 && distinct.length <= 6) return answerConflict(distinct);
    }

    // 清洗问句噪音后再定位药物 / 病症
    var cleaned = trimNoise(q, QUESTION_NOISE);
    if (!cleaned) cleaned = q;

    // 查药（去掉口水词后按名字定位）
    var drugQuery = trimNoise(cleaned, DRUG_QUERY_NOISE);
    if (drugQuery.length >= 2 && drugQuery.length <= 8) {
      ZySearch.lookup(drugQuery).then(function (message) {
        var entry = message && message.entry;
        if (entry) return answerDrug(entry, q);
        answerSymptomOrFallback(q, cleaned);
      });
      return;
    }

    // 病症找药 / 兜底
    answerSymptomOrFallback(q, cleaned);
  }

  function answerPregnancy(q) {
    var name = trimNoise(q, SAFETY_NOISE);
    ZySearch.lookup(name).then(function (message) {
      var entry = message && message.entry;
      if (!entry) {
        botSay("没在药典里定位到「" + escapeHtml(name || q) + "」。试试输入正名，比如：益母草、红花、桃仁。");
        return;
      }
      ZySearch.conflict([entry.title]).then(function (res) {
        var info = res && res.resolved && res.resolved[0] && res.resolved[0].info;
        var pregnancy = info && info.pregnancy;
        var caution = info && info.caution;
        var html = "<b>" + escapeHtml(entry.title) + "</b>（" + typeLabel(entry.type) + "）的妊娠安全信息：<br>";
        if (pregnancy) {
          html += '<div class="sflag-row" style="margin-top:8px"><span class="sflag sflag-preg">孕妇' + escapeHtml(pregnancy) + "</span></div>";
        } else {
          html += '<div style="margin-top:8px">药典【注意】项未载明明确的妊娠禁忌。</div>';
        }
        if (caution) html += '<div class="agent-caution">【注意】' + escapeHtml(caution) + "</div>";
        html += '<div class="agent-caution">⚠️ 妊娠期用药必须由执业医师决定，药典「未载明」不等于安全。</div>';
        if (typeof window.__zyDetail === "function") {
          html += drugCard(entry);
        }
        botSay(html);
      });
    });
  }

  function answerToxic(q) {
    var name = trimNoise(q, TOXIC_NOISE);
    ZySearch.lookup(name).then(function (message) {
      var entry = message && message.entry;
      if (!entry) {
        botSay("没在药典里定位到「" + escapeHtml(name || q) + "」。可以换个写法，或直接点下方「在检索页搜索」询问。");
        return;
      }
      ZySearch.conflict([entry.title]).then(function (res) {
        var info = res && res.resolved && res.resolved[0] && res.resolved[0].info;
        var html = "<b>" + escapeHtml(entry.title) + "</b> 的安全性（药典【注意】项）：<br>";
        var flags = [];
        if (info) {
          if (info.toxic) flags.push('<span class="sflag sflag-toxic">' + escapeHtml(info.toxicity || "有毒") + "</span>");
          if (info.pregnancy) flags.push('<span class="sflag sflag-preg">孕妇' + escapeHtml(info.pregnancy) + "</span>");
        }
        html += flags.length
          ? '<div class="sflag-row" style="margin-top:8px">' + flags.join("") + "</div>"
          : '<div style="margin-top:8px">药典未将其标注为毒剧药。</div>';
        if (info && info.caution) html += '<div class="agent-caution">【注意】' + escapeHtml(info.caution) + "</div>";
        html += drugCard(entry);
        botSay(html);
      });
    });
  }

  function answerConflict(names) {
    ZySearch.conflict(names).then(function (res) {
      if (!res) {
        botSay("离线状态无法核查配伍，请联网后重试。");
        return;
      }
      var resolved = res.resolved || [];
      var known = resolved.filter(function (r) { return r.name; });
      if (known.length < 2) {
        var missNames = names.filter(function (n, i) { return !resolved[i] || !resolved[i].name; });
        botSay(
          "这几个名字里没能在药典里定位到：" +
            escapeHtml(missNames.join("、")) +
            "。请用正名（如人参、藜芦、五灵脂），俗名可以问我（田七→三七、国老→甘草）。"
        );
        return;
      }
      var hits = res.conflicts || [];
      var html = "核对 <b>" + known.map(function (r) { return escapeHtml(r.name); }).join("、") + "</b> 的配伍：<br>";
      if (hits.length) {
        html +=
          '<div class="agent-conflict"><span class="sflag sflag-toxic">配伍禁忌</span>' +
          hits.map(function (h) { return escapeHtml(h.a) + " × " + escapeHtml(h.b); }).join("；") +
          "</div>" +
          '<div class="agent-caution">药典【注意】明示不宜同用，属十八反 / 十九畏范畴。</div>';
      } else {
        html += '<div style="margin-top:8px">药典【注意】项未检出这组药味明示的配伍禁忌。</div>';
        html += '<div class="agent-caution">「未检出」不等于安全：药典只收录部分禁忌，临床还受剂量、煎法、个体影响。</div>';
      }
      var safetyNotes = known.filter(function (r) { return r.info && (r.info.toxic || r.info.pregnancy); });
      if (safetyNotes.length) {
        html += "<div style=\"margin-top:8px\">另附安全提示：</div>";
        safetyNotes.forEach(function (r) {
          var flags = [];
          if (r.info.toxic) flags.push('<span class="sflag sflag-toxic">' + escapeHtml(r.name) + "：" + escapeHtml(r.info.toxicity || "有毒") + "</span>");
          if (r.info.pregnancy) flags.push('<span class="sflag sflag-preg">' + escapeHtml(r.name) + "：孕妇" + escapeHtml(r.info.pregnancy) + "</span>");
          html += '<div class="sflag-row" style="margin-top:6px">' + flags.join("") + "</div>";
        });
      }
      html += '<a class="agent-link" href="bench.html">去方药研习台做完整组方自查 →</a>';
      botSay(html);
    });
  }

  function answerDrug(entry, originalQuery) {
    var html = "<b>" + escapeHtml(entry.title) + "</b>" + (entry.pinyin ? "（" + escapeHtml(entry.pinyin) + "）" : "") + " · " + typeLabel(entry.type) + "<br>";
    var c = entry.clinical || {};
    if (c["性味与归经"]) html += '<div class="agent-kv"><span>性味归经</span>' + escapeHtml(excerpt(c["性味与归经"], "", 60)) + "</div>";
    if (c["功能与主治"]) html += '<div class="agent-kv"><span>功能主治</span>' + escapeHtml(excerpt(c["功能与主治"], "", 120)) + "</div>";
    if (c["用法与用量"]) html += '<div class="agent-kv"><span>用法用量</span>' + escapeHtml(excerpt(c["用法与用量"], "", 70)) + "</div>";
    if (entry.safety) {
      var flags = [];
      if (entry.safety.toxic) flags.push('<span class="sflag sflag-toxic">' + escapeHtml(entry.safety.toxicity || "有毒") + "</span>");
      if (entry.safety.pregnancy) flags.push('<span class="sflag sflag-preg">孕妇' + escapeHtml(entry.safety.pregnancy) + "</span>");
      if (flags.length) html += '<div class="sflag-row" style="margin-top:6px">' + flags.join("") + "</div>";
    }
    if (c["注意"]) html += '<div class="agent-caution">【注意】' + escapeHtml(c["注意"]) + "</div>";
    html += drugCard(entry);
    botSay(html);
  }

  function answerSymptomOrFallback(q, cleaned) {
    var symptomQuery = cleaned || q;
    ZySearch.search(symptomQuery, "all", "symptom").then(function (symptomMsg) {
      if (symptomMsg && symptomMsg.results && symptomMsg.results.length) {
        answerSymptom(q, symptomMsg);
        return;
      }
      ZySearch.search(symptomQuery, "all", "text").then(function (textMsg) {
        if (textMsg && textMsg.results && textMsg.results.length) {
          var html =
            "药典【功能与主治】里没有直接匹配「" + escapeHtml(q) +
            "」的条目，但全文检索命中 <b>" + textMsg.total + "</b> 条：<br>";
          html += textMsg.results.slice(0, 4).map(drugCard).join("");
          html += '<a class="agent-link" href="' + searchPageLink(q, "text") + '">在检索页查看全部 ' + textMsg.total + " 条 →</a>";
          botSay(html);
          return;
        }
        botSay(
          "这个说法我在药典里没找到对应条目。可以换个说法试试：<br>" +
            "· 用中医病名：胸痹（冠心病）、消渴（糖尿病）、不寐（失眠）<br>" +
            "· 直接查药名：黄连、三七、小柴胡汤<br>" +
            "· 或点下方示例问我"
        );
      });
    });
  }

  function answerSymptom(q, msg) {
    var singles = msg.results.filter(function (e) { return e.type === "herb" || e.type === "extract"; });
    var formulas = msg.results.filter(function (e) { return e.type === "formula"; });
    var html =
      "按「<b>" + escapeHtml(q) + "</b>」" +
      (msg.expanded && msg.expanded.length ? "（含同义词：" + msg.expanded.map(escapeHtml).join("、") + "）" : "") +
      "在药典【功能与主治】里共命中 <b>" + msg.total + "</b> 条：<br>";

    function group(title, list) {
      if (!list.length) return "";
      return (
        '<div class="agent-group-title">' + title + " · " + list.length + "</div>" +
        list.slice(0, 5).map(drugCard).join("") +
        (list.length > 5 ? '<div class="agent-more">… 还有 ' + (list.length - 5) + " 条</div>" : "")
      );
    }

    html += group("单味药", singles);
    html += group("成方制剂", formulas);
    html += '<a class="agent-link" href="' + searchPageLink(q, "symptom") + '">在检索页查看全部结果 →</a>';
    botSay(html);
  }

  /* ---------------- 交互事件（气泡内点击） ---------------- */

  document.addEventListener("click", function (event) {
    var chip = event.target.closest(".agent-chip");
    if (chip) {
      ui.chipClick(chip.dataset.chip);
      return;
    }
    var drug = event.target.closest(".agent-drug[data-id]");
    if (drug) {
      var id = Number(drug.dataset.id);
      if (typeof window.__zyDetail === "function") {
        window.__zyDetail(id); // 检索页：直接开抽屉
      } else {
        ZySearch.detail(id).then(function (message) {
          if (message && message.entry) answerDrug(message.entry);
        });
      }
      return;
    }
    if (event.target.closest("#agent-fab")) return; // fab 有自己的监听
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && ui.panel && ui.panel.classList.contains("open")) close();
    if (event.key === "Enter" && event.target.classList && event.target.classList.contains("agent-drug")) {
      event.target.click();
    }
  });

  buildUI();
})();
