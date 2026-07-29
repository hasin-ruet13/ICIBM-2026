const DAY_CONFIG = [
  { key: "all", label: "All days", date: null },
  { key: "sunday", label: "Sunday, August 2nd, 2026", date: "2026-08-02" },
  { key: "monday", label: "Monday, August 3rd, 2026", date: "2026-08-03" },
  { key: "tuesday", label: "Tuesday, August 4th, 2026", date: "2026-08-04" },
  { key: "wednesday", label: "Wednesday, August 5th, 2026", date: "2026-08-05" },
];

const DAY_LOOKUP = new Map(DAY_CONFIG.filter((day) => day.date).map((day) => [day.label, day]));
const STORAGE_KEY = "icibm2026.savedBlocks";

const START_TIME_RE = /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]/i;
const TIME_ONLY_RE = /^(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
const ROOM_RE = /\bRoom\s+\d{4}[A-Z](?:&[A-Z])?/i;

const THEME_RULES = [
  { label: "AI & ML", patterns: [/ai\b/i, /machine learning/i, /deep learning/i, /foundation model/i, /large language model/i, /\bllm\b/i, /generative ai/i, /transformer/i, /neural/i] },
  { label: "Clinical", patterns: [/clinical/i, /\bpatient\b/i, /\bicu\b/i, /\behr\b/i, /medical/i, /health/i, /disease/i] },
  { label: "CRISPR", patterns: [/crispr/i, /perturb/i] },
  { label: "Cancer", patterns: [/cancer/i, /tumou?r/i, /oncology/i] },
  { label: "Drug discovery", patterns: [/drug/i, /repurpos/i, /adverse drug/i, /pharmac/i] },
  { label: "Epigenetics", patterns: [/chromatin/i, /methylation/i, /epigenetic/i, /histone/i] },
  { label: "Genomics", patterns: [/genom/i, /genetic/i, /\bsnp\b/i, /sequence/i, /\bdna\b/i] },
  { label: "Methods", patterns: [/benchmark/i, /framework/i, /tool/i, /method/i, /algorithm/i, /optimization/i, /inference/i, /statistical/i] },
  { label: "Multi-omics", patterns: [/multi-omics/i, /multiomic/i, /multi-modal/i, /multimodal/i, /integration/i, /cross-modal/i] },
  { label: "Proteomics", patterns: [/protein/i, /proteome/i, /antibody/i, /alphafold/i] },
  { label: "Single-cell", patterns: [/single-cell/i, /scRNA/i, /single cell/i] },
  { label: "Spatial biology", patterns: [/spatial/i, /histology/i, /microenvironment/i] },
];

const state = {
  activeDay: "all",
  activeTheme: "all",
  search: "",
  concurrentOnly: false,
  saved: loadSavedBlocks(),
  blocks: [],
  filtered: [],
  themeStats: [],
};

const elements = {
  dayTabs: document.getElementById("dayTabs"),
  scheduleList: document.getElementById("scheduleList"),
  themeChips: document.getElementById("themeChips"),
  themeSummary: document.getElementById("themeSummary"),
  themeList: document.getElementById("themeList"),
  savedList: document.getElementById("savedList"),
  searchInput: document.getElementById("searchInput"),
  concurrentOnlyToggle: document.getElementById("concurrentOnlyToggle"),
  resetFiltersButton: document.getElementById("resetFiltersButton"),
  clearSavedButton: document.getElementById("clearSavedButton"),
  blockCount: document.getElementById("blockCount"),
  themeCount: document.getElementById("themeCount"),
  savedCount: document.getElementById("savedCount"),
  activeDayTitle: document.getElementById("activeDayTitle"),
  resultSummary: document.getElementById("resultSummary"),
};

const cardTemplate = document.getElementById("cardTemplate");

init().catch((error) => {
  console.error(error);
  elements.scheduleList.innerHTML = `<p class="error-state">I couldn’t load the schedule text. ${escapeHtml(error.message)}</p>`;
});

async function init() {
  renderDayTabs();
  bindEvents();

  const response = await fetch("icibm2026_program_schedule.txt");
  if (!response.ok) {
    throw new Error(`Schedule source not found (${response.status})`);
  }

  const rawText = await response.text();
  state.blocks = fillMissingEndTimes(parseScheduleText(rawText));
  state.themeStats = buildThemeStats(state.blocks);

  elements.blockCount.textContent = String(state.blocks.length);
  elements.themeCount.textContent = String(state.themeStats.length);
  renderAll();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderAll();
  });

  elements.concurrentOnlyToggle.addEventListener("change", (event) => {
    state.concurrentOnly = event.target.checked;
    renderAll();
  });

  elements.resetFiltersButton.addEventListener("click", () => {
    state.activeDay = "all";
    state.activeTheme = "all";
    state.search = "";
    state.concurrentOnly = false;
    elements.searchInput.value = "";
    elements.concurrentOnlyToggle.checked = false;
    renderAll();
  });

  elements.clearSavedButton?.addEventListener("click", () => {
    if (!state.saved.size) {
      return;
    }
    state.saved.clear();
    persistSavedBlocks();
    renderAll();
  });
}

function renderAll() {
  const activeDay = DAY_CONFIG.find((day) => day.key === state.activeDay) || DAY_CONFIG[0];

  const filtered = state.blocks.filter((block) => {
    const matchesDay = state.activeDay === "all" || block.dayKey === state.activeDay;
    const matchesTheme = state.activeTheme === "all" || block.themes.includes(state.activeTheme);
    const matchesSearch = !state.search || block.searchText.includes(state.search);
    const matchesConcurrent = !state.concurrentOnly || block.isConcurrent;
    return matchesDay && matchesTheme && matchesSearch && matchesConcurrent;
  });

  state.filtered = filtered;
  renderBlocks(filtered);
  renderDayTabs();
  renderThemeChips();
  renderThemeList();
  renderSavedList();

  elements.activeDayTitle.textContent = activeDay.key === "all" ? "All conference days" : activeDay.label;
  elements.resultSummary.textContent = `${filtered.length} matching block${filtered.length === 1 ? "" : "s"} • ${state.saved.size} saved`;
  elements.savedCount.textContent = String(state.saved.size);
  if (elements.clearSavedButton) {
    elements.clearSavedButton.disabled = state.saved.size === 0;
  }
  elements.themeSummary.textContent = buildThemeSummary();
}

function renderDayTabs() {
  if (!elements.dayTabs.hasChildNodes()) {
    elements.dayTabs.innerHTML = "";
    for (const day of DAY_CONFIG) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-tab";
      button.dataset.day = day.key;
      button.textContent = day.label;
      button.addEventListener("click", () => {
        state.activeDay = day.key;
        renderAll();
        elements.scheduleList.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      elements.dayTabs.appendChild(button);
    }
  }

  for (const tab of elements.dayTabs.querySelectorAll(".day-tab")) {
    tab.classList.toggle("is-active", tab.dataset.day === state.activeDay);
  }
}

function renderThemeChips() {
  elements.themeChips.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "theme-chip";
  allButton.textContent = "All themes";
  allButton.classList.toggle("is-active", state.activeTheme === "all");
  allButton.addEventListener("click", () => {
    state.activeTheme = "all";
    renderAll();
  });
  elements.themeChips.appendChild(allButton);

  for (const theme of state.themeStats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-chip";
    button.textContent = `${theme.label} (${theme.count})`;
    button.classList.toggle("is-active", state.activeTheme === theme.label);
    button.addEventListener("click", () => {
      state.activeTheme = state.activeTheme === theme.label ? "all" : theme.label;
      renderAll();
    });
    elements.themeChips.appendChild(button);
  }
}

function renderThemeList() {
  elements.themeList.innerHTML = "";

  if (!state.themeStats.length) {
    elements.themeList.innerHTML = `<p class="empty-state">Themes will appear here once the schedule loads.</p>`;
    return;
  }

  const visibleThemes = state.themeStats.slice(0, 8);
  const fragment = document.createDocumentFragment();

  for (const theme of visibleThemes) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "theme-row";
    item.innerHTML = `
      <span>
        <strong>${escapeHtml(theme.label)}</strong>
        <small>${theme.sample}</small>
      </span>
      <span class="theme-row-count">${theme.count}</span>
    `;
    item.addEventListener("click", () => {
      state.activeTheme = state.activeTheme === theme.label ? "all" : theme.label;
      renderAll();
    });
    fragment.appendChild(item);
  }

  elements.themeList.appendChild(fragment);
}

function renderSavedList() {
  elements.savedList.innerHTML = "";

  const savedBlocks = state.blocks
    .filter((block) => state.saved.has(block.id))
    .sort((left, right) => left.date.localeCompare(right.date) || left.startMinutes - right.startMinutes);

  if (!savedBlocks.length) {
    elements.savedList.innerHTML = `<p class="empty-state">Tap the star on any session to keep it in this browser.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const block of savedBlocks) {
    const item = document.createElement("div");
    item.className = "saved-item";
    item.innerHTML = `
      <div class="saved-item-head">
        <span class="time-chip">${escapeHtml(shortDayLabel(block.date))} · ${escapeHtml(block.startTime)}${block.endTime ? `–${escapeHtml(block.endTime)}` : ""}</span>
        <button type="button" class="button button-ghost saved-remove">Remove</button>
      </div>
      <strong>${escapeHtml(block.title)}</strong>
      <p>${escapeHtml([block.dayLabel, block.room].filter(Boolean).join(" • "))}</p>
      <div class="session-themes">${renderThemePills(block.themes)}</div>
    `;

    item.querySelector(".saved-remove").addEventListener("click", () => {
      state.saved.delete(block.id);
      persistSavedBlocks();
      renderAll();
    });

    fragment.appendChild(item);
  }

  elements.savedList.appendChild(fragment);
}

function renderBlocks(blocks) {
  elements.scheduleList.innerHTML = "";

  if (!blocks.length) {
    elements.scheduleList.innerHTML = `<p class="empty-state">No matching sessions. Try a broader search or switch filters.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const block of blocks) {
    fragment.appendChild(createBlockCard(block));
  }
  elements.scheduleList.appendChild(fragment);
}

function createBlockCard(block) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const bookmarkButton = card.querySelector(".bookmark-button");
  const timeChip = card.querySelector(".time-chip");
  const title = card.querySelector(".session-title");
  const meta = card.querySelector(".session-meta");
  const body = card.querySelector(".session-body");
  const themeWrap = card.querySelector(".session-themes");

  const isSaved = state.saved.has(block.id);

  timeChip.textContent = `${shortDayLabel(block.date)} · ${block.startTime}${block.endTime ? `–${block.endTime}` : ""}`;
  bookmarkButton.textContent = isSaved ? "★ Saved" : "☆ Save";
  bookmarkButton.classList.toggle("is-saved", isSaved);
  bookmarkButton.setAttribute("aria-pressed", String(isSaved));
  bookmarkButton.setAttribute("aria-label", isSaved ? "Remove bookmark" : "Save bookmark");
  bookmarkButton.addEventListener("click", () => {
    toggleSaved(block.id);
  });

  title.textContent = block.title;
  meta.textContent = [block.kindLabel, block.room, block.dayLabel].filter(Boolean).join(" • ");
  body.textContent = block.body;
  themeWrap.innerHTML = renderThemePills(block.themes);

  return card;
}

function renderThemePills(themes) {
  if (!themes.length) {
    return `<span class="theme-pill theme-pill-muted">Other</span>`;
  }
  return themes.map((theme) => `<span class="theme-pill">${escapeHtml(theme)}</span>`).join("");
}

function toggleSaved(blockId) {
  if (state.saved.has(blockId)) {
    state.saved.delete(blockId);
  } else {
    state.saved.add(blockId);
  }
  persistSavedBlocks();
  renderAll();
}

function parseScheduleText(rawText) {
  const lines = rawText.replace(/\r/g, "").replace(/\f/g, "\n").split("\n");
  const blocks = [];
  let currentDay = null;
  let currentBlock = null;

  const flushBlock = () => {
    if (!currentBlock || !currentDay) {
      currentBlock = null;
      return;
    }

    const normalizedLines = currentBlock.lines.map((line) => line.replace(/\s+$/g, "").trimEnd());
    const cleanedLines = normalizedLines.map((line) => line.replace(/\s+/g, " ").trim());
    const bodyLines = cleanedLines.filter(Boolean);
    const bodyText = bodyLines.join(" ");
    const title = deriveTitle(bodyLines);
    const room = deriveRoom(bodyText);
    const kindLabel = classifyBlock(bodyText, title);
    const themes = detectThemes(`${title} ${room} ${kindLabel} ${bodyText}`);
    const endTime = extractEndTime(currentBlock.lines);
    const startMinutes = timeToMinutes(currentBlock.startTime);
    const isConcurrent = Boolean(room) && !/^(Registration|Opening|Lunch|Coffee Break|Keynote)$/i.test(kindLabel);
    const searchText = [
      currentDay.label,
      currentBlock.startTime,
      endTime,
      title,
      room,
      kindLabel,
      themes.join(" "),
      bodyText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    blocks.push({
      id: `${currentDay.date}-${String(blocks.length).padStart(3, "0")}`,
      dayKey: currentDay.key,
      dayLabel: currentDay.label,
      date: currentDay.date,
      title,
      room,
      kindLabel,
      themes,
      startTime: currentBlock.startTime,
      endTime,
      startMinutes,
      body: bodyLines.slice(1).join("\n") || bodyLines.join("\n"),
      searchText,
      isConcurrent,
    });

    currentBlock = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentBlock) {
        currentBlock.lines.push("");
      }
      continue;
    }

    const dayMatch = DAY_LOOKUP.get(trimmed);
    if (dayMatch) {
      flushBlock();
      currentDay = dayMatch;
      continue;
    }

    if (START_TIME_RE.test(trimmed)) {
      flushBlock();
      currentBlock = {
        lines: [line],
        startTime: extractStartTime(trimmed),
      };
      continue;
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
    }
  }

  flushBlock();
  return blocks;
}

function fillMissingEndTimes(blocks) {
  const grouped = new Map();
  for (const block of blocks) {
    if (!grouped.has(block.dayKey)) {
      grouped.set(block.dayKey, []);
    }
    grouped.get(block.dayKey).push(block);
  }

  const result = [];
  for (const dayBlocks of grouped.values()) {
    for (let index = 0; index < dayBlocks.length; index += 1) {
      const block = { ...dayBlocks[index] };
      if (!block.endTime) {
        const nextBlock = dayBlocks[index + 1];
        block.endTime = nextBlock?.startTime || addMinutes(block.startTime, 60);
      }
      result.push(block);
    }
  }

  return result;
}

function buildThemeStats(blocks) {
  const themeMap = new Map();

  for (const block of blocks) {
    for (const theme of block.themes) {
      if (!themeMap.has(theme)) {
        themeMap.set(theme, { label: theme, count: 0, sample: block.title });
      }
      const entry = themeMap.get(theme);
      entry.count += 1;
    }
  }

  return [...themeMap.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((theme) => ({
      ...theme,
      sample: theme.sample.length > 56 ? `${theme.sample.slice(0, 56)}…` : theme.sample,
    }));
}

function buildThemeSummary() {
  if (!state.themeStats.length) {
    return "No themes detected yet.";
  }

  if (state.activeTheme !== "all") {
    const theme = state.themeStats.find((entry) => entry.label === state.activeTheme);
    return theme
      ? `Focused on ${theme.label}. ${theme.count} blocks mention this theme.`
      : `Focused on ${state.activeTheme}.`;
  }

  return `${state.themeStats.length} themes detected across ${state.blocks.length} blocks. Pick one to narrow the list.`;
}

function deriveTitle(lines) {
  const candidates = lines.filter((line) => {
    if (!line) return false;
    if (TIME_ONLY_RE.test(line)) return false;
    if (/^Room\s/i.test(line)) return false;
    if (/^Chair/i.test(line)) return false;
    if (/^Sunday,|^Monday,|^Tuesday,|^Wednesday,/i.test(line)) return false;
    if (/^SCHEDULE$/i.test(line)) return false;
    return true;
  });

  const preferred = candidates.find((line) =>
    /(Registration|Opening Remarks|Keynote|Lunch Break|Coffee Break|Concurrent Sessions\/Workshops)/i.test(line),
  );
  if (preferred) {
    return preferred;
  }

  const firstStrong = candidates.find((line) => line.length > 18 && /[A-Za-z]/.test(line));
  return firstStrong || "ICIBM session block";
}

function deriveRoom(text) {
  const match = text.match(ROOM_RE);
  return match ? match[0] : "";
}

function classifyBlock(text, title) {
  if (/Coffee Break/i.test(text)) return "Break";
  if (/Lunch Break/i.test(text)) return "Lunch";
  if (/Registration/i.test(text)) return "Registration";
  if (/Opening Remarks/i.test(text)) return "Opening";
  if (/Keynote/i.test(text)) return "Keynote";
  if (/Concurrent Sessions\/Workshops/i.test(text)) return "Concurrent";
  if (/Workshop/i.test(text)) return "Workshop";
  if (/Poster/i.test(text)) return "Poster";
  if (title) return "Session";
  return "Block";
}

function detectThemes(text) {
  const matches = [];
  for (const theme of THEME_RULES) {
    if (theme.patterns.some((pattern) => pattern.test(text))) {
      matches.push(theme.label);
    }
  }

  return matches.length ? [...new Set(matches)].slice(0, 4) : ["Other"];
}

function extractStartTime(line) {
  const match = line.match(START_TIME_RE);
  return match ? match[1].toUpperCase() : "";
}

function extractEndTime(lines) {
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const match = trimmed.match(TIME_ONLY_RE);
    if (match) {
      return match[1].toUpperCase();
    }
    const sameLineTimes = trimmed.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi);
    if (sameLineTimes && sameLineTimes.length > 1) {
      return sameLineTimes[1].toUpperCase();
    }
  }
  return "";
}

function timeToMinutes(time) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return 0;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) {
    hours += 12;
  }
  if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

function addMinutes(time, amount) {
  const totalMinutes = timeToMinutes(time) + amount;
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function shortDayLabel(date) {
  const config = DAY_CONFIG.find((day) => day.date === date);
  if (!config) {
    return "";
  }

  return config.label
    .replace(", 2026", "")
    .replace("Sunday", "Sun")
    .replace("Monday", "Mon")
    .replace("Tuesday", "Tue")
    .replace("Wednesday", "Wed")
    .replace("August ", "Aug ");
}

function loadSavedBlocks() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function persistSavedBlocks() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.saved]));
  } catch {
    // Ignore storage failures on locked-down browsers.
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
