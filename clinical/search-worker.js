let entries = [];

function fieldText(entry, fieldName) {
  return entry.fields
    .filter((field) => field.name === fieldName)
    .map((field) => field.text)
    .join("\n");
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKC");
}

function matchScore(entry, token) {
  const value = normalize(token);
  if (!value) return 0;

  let score = 0;
  const title = normalize(entry.title);
  const pinyin = normalize(entry.pinyin);
  const eTitle = normalize(entry.eTitle);
  const section = normalize(entry.section);
  const path = normalize(entry.path.join(" "));
  const text = normalize(entry.fields.map((field) => field.text).join("\n"));

  if (title === value) score += 1400;
  else if (title.startsWith(value)) score += 1050;
  else if (title.includes(value)) score += 750;

  if (pinyin.includes(value)) score += 520;
  if (eTitle.includes(value)) score += 430;
  if (section.includes(value) || path.includes(value)) score += 220;

  for (const field of entry.fields) {
    const name = normalize(field.name);
    const body = normalize(field.text);
    if (name.includes(value)) score += 120;
    if (body.includes(value)) score += 70;
  }

  if (!score && text.includes(value)) score += 35;
  return score;
}

function makeSnippet(entry, tokens) {
  const text = entry.fields.map((field) => field.text).join(" ").replace(/\s+/g, " ").trim();
  if (!tokens.length) return text.slice(0, 180);

  const positions = tokens
    .map((token) => text.toLowerCase().indexOf(token.toLowerCase()))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b);

  if (!positions.length) return text.slice(0, 180);

  const start = Math.max(0, positions[0] - 70);
  const end = Math.min(text.length, positions[0] + 130);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function search(query, filter) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  let results = entries;

  if (filter && filter !== "all") {
    results = results.filter((entry) => entry.type === filter);
  }

  if (tokens.length) {
    results = results
      .map((entry) => {
        const scores = tokens.map((token) => matchScore(entry, token));
        const total = scores.reduce((sum, value) => sum + value, 0);
        const zeroCount = scores.filter((value) => value === 0).length;
        return {
          entry,
          score: zeroCount ? total * 0.15 : total,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "zh-Hans-CN"))
      .map((item) => item.entry);
  } else {
    results = [...results].sort((a, b) =>
      a.section.localeCompare(b.section, "zh-Hans-CN") || a.title.localeCompare(b.title, "zh-Hans-CN")
    );
  }

  return {
    total: results.length,
    results: results.slice(0, 120).map((entry) => ({
      id: entry.id,
      title: entry.title,
      pinyin: entry.pinyin,
      eTitle: entry.eTitle,
      page: entry.page,
      section: entry.section,
      type: entry.type,
      snippet: makeSnippet(entry, tokens),
      clinical: {
        性味与归经: fieldText(entry, "性味与归经"),
        功能与主治: fieldText(entry, "功能与主治"),
        用法与用量: fieldText(entry, "用法与用量"),
        注意: fieldText(entry, "注意"),
      },
    })),
  };
}

function detail(id) {
  return entries.find((entry) => entry.id === Number(id)) || null;
}

self.onmessage = async (event) => {
  const message = event.data;

  try {
    if (message.type === "load") {
      const response = await fetch("../data/pharmacopoeia.jsonl");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      entries = source
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      self.postMessage({ type: "loaded", total: entries.length });
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
