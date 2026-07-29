const DAY_CONFIG = [
  { key: "all", label: "All days", date: null },
  { key: "sunday", label: "Sunday, August 2nd, 2026", date: "2026-08-02" },
  { key: "monday", label: "Monday, August 3rd, 2026", date: "2026-08-03" },
  { key: "tuesday", label: "Tuesday, August 4th, 2026", date: "2026-08-04" },
  { key: "wednesday", label: "Wednesday, August 5th, 2026", date: "2026-08-05" },
];

const DAY_LOOKUP = new Map(DAY_CONFIG.filter((day) => day.date).map((day) => [day.label, day]));
const STORAGE_KEY = "icibm2026.savedBlocks";
const CONFERENCE_TZ = "America/New_York";

const START_TIME_RE = /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[–-]/i;
const TIME_ONLY_RE = /^(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
const ROOM_RE = /\bRoom\s+\d{4}[A-Z](?:&[A-Z])?/i;

const state = {
  activeDay: "all",
  search: "",
  savedOnly: false,
  saved: loadSavedBlocks(),
  blocks: [],
  filtered: [],
};

const elements = {
  dayTabs: document.getElementById("dayTabs"),
  scheduleList: document.getElementById("scheduleList"),
  savedList: document.getElementById("savedList"),
  searchInput: document.getElementById("searchInput"),
  savedOnlyToggle: document.getElementById("savedOnlyToggle"),
  clearSavedButton: document.getElementById("clearSavedButton"),
  exportIcsButton: document.getElementById("exportIcsButton"),
  blockCount: document.getElementById("blockCount"),
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
  state.blocks = parseScheduleText(rawText);
  state.blocks = fillMissingEndTimes(state.blocks);

  elements.blockCount.textContent = String(state.blocks.length);
  renderAll();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderAll();
  });

  elements.savedOnlyToggle.addEventListener("change", (event) => {
    state.savedOnly = event.target.checked;
    renderAll();
  });

  elements.clearSavedButton.addEventListener("click", () => {
    if (!state.saved.size) {
      return;
    }
    state.saved.clear();
    persistSavedBlocks();
    renderAll();
  });

  elements.exportIcsButton.addEventListener("click", () => {
    if (!state.saved.size) {
      window.alert("Save a few sessions first, then export them as an .ics file.");
      return;
    }
    const exportedBlocks = state.blocks.filter((block) => state.saved.has(block.id));
    downloadFile("icibm2026_schedule.ics", buildIcs(exportedBlocks), "text/calendar;charset=utf-8");
  });
}

function renderAll() {
  const activeDay = DAY_CONFIG.find((day) => day.key === state.activeDay) || DAY_CONFIG[0];
  const filtered = state.blocks.filter((block) => {
    const matchesDay = state.activeDay === "all" || block.dayKey === state.activeDay;
    const haystack = block.searchText;
    const matchesSearch = !state.search || haystack.includes(state.search);
    const matchesSaved = !state.savedOnly || state.saved.has(block.id);
    return matchesDay && matchesSearch && matchesSaved;
  });

  state.filtered = filtered;
  renderBlocks(filtered);
  renderSavedList();
  renderTabs();

  elements.activeDayTitle.textContent = activeDay.key === "all" ? "All conference days" : activeDay.label;
  elements.resultSummary.textContent = `${filtered.length} matching block${filtered.length === 1 ? "" : "s"} • ${state.saved.size} saved`;
  elements.savedCount.textContent = String(state.saved.size);
  elements.exportIcsButton.disabled = state.saved.size === 0;
  elements.clearSavedButton.disabled = state.saved.size === 0;
}

function renderDayTabs() {
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

function renderTabs() {
  for (const tab of elements.dayTabs.querySelectorAll(".day-tab")) {
    tab.classList.toggle("is-active", tab.dataset.day === state.activeDay);
  }
}

function renderBlocks(blocks) {
  elements.scheduleList.innerHTML = "";

  if (!blocks.length) {
    elements.scheduleList.innerHTML = `<p class="empty-state">No matching sessions. Try a broader search or switch days.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const block of blocks) {
    fragment.appendChild(createBlockCard(block));
  }
  elements.scheduleList.appendChild(fragment);
}

function renderSavedList() {
  elements.savedList.innerHTML = "";
  const savedBlocks = state.blocks.filter((block) => state.saved.has(block.id));

  if (!savedBlocks.length) {
    elements.savedList.innerHTML = `<p class="empty-state">Saved sessions will appear here.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const block of savedBlocks) {
    const item = document.createElement("div");
    item.className = "saved-item";
    item.innerHTML = `
      <div class="session-badge">${escapeHtml(shortDayLabel(block.date))}</div>
      <h3>${escapeHtml(block.title)}</h3>
      <p>${escapeHtml(`${block.dayLabel}${block.room ? ` • ${block.room}` : ""}`)}</p>
      <p>${escapeHtml(`${block.startTime}${block.endTime ? ` — ${block.endTime}` : ""}`)}</p>
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-ghost";
    button.textContent = "Remove";
    button.addEventListener("click", () => {
      state.saved.delete(block.id);
      persistSavedBlocks();
      renderAll();
    });
    item.appendChild(button);
    fragment.appendChild(item);
  }

  elements.savedList.appendChild(fragment);
}

function createBlockCard(block) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const saveButton = card.querySelector(".save-button");
  const timeChip = card.querySelector(".time-chip");
  const title = card.querySelector(".session-title");
  const meta = card.querySelector(".session-meta");
  const body = card.querySelector(".session-body");

  const isSaved = state.saved.has(block.id);

  timeChip.textContent = `${shortDayLabel(block.date)} · ${block.startTime}${block.endTime ? `–${block.endTime}` : ""}`;
  saveButton.textContent = isSaved ? "Saved" : "Save";
  saveButton.classList.toggle("is-saved", isSaved);
  saveButton.addEventListener("click", () => {
    toggleSaved(block.id);
  });

  title.textContent = block.title;
  const metaParts = [block.kindLabel, block.room, block.dayLabel];
  meta.textContent = metaParts.filter(Boolean).join(" • ");
  body.textContent = block.body;

  return card;
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
    blocks.push({
      ...currentBlock,
      dayKey: currentDay.key,
      dayLabel: currentDay.label,
      date: currentDay.date,
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

  return blocks.map((block, index) => {
    const normalizedLines = block.lines.map((line) => line.replace(/\s+$/g, "").trimEnd());
    const cleanedLines = normalizedLines.map((line) => line.replace(/\s+/g, " ").trim());
    const bodyLines = cleanedLines.filter(Boolean);
    const title = deriveTitle(bodyLines);
    const room = deriveRoom(bodyLines.join(" "));
    const kindLabel = classifyBlock(bodyLines.join(" "), title);
    const endTime = extractEndTime(block.lines);
    const body = bodyLines.slice(1).join("\n");
    const startMinutes = timeToMinutes(block.startTime);
    const searchText = [
      block.dayLabel,
      block.startTime,
      endTime,
      title,
      room,
      kindLabel,
      bodyLines.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      id: `${block.date}-${String(index).padStart(3, "0")}`,
      dayKey: block.dayKey,
      dayLabel: block.dayLabel,
      date: block.date,
      title,
      room,
      kindLabel,
      startTime: block.startTime,
      endTime,
      startMinutes,
      body: body || bodyLines.join("\n"),
      searchText,
    };
  });
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
  for (const [dayKey, dayBlocks] of grouped.entries()) {
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

function deriveTitle(lines) {
  const candidates = lines.filter((line) => {
    if (!line) {
      return false;
    }
    if (TIME_ONLY_RE.test(line)) {
      return false;
    }
    if (/^Room\s/i.test(line)) {
      return false;
    }
    if (/^Chair/i.test(line)) {
      return false;
    }
    if (/^Sunday,|^Monday,|^Tuesday,|^Wednesday,/i.test(line)) {
      return false;
    }
    if (/^SCHEDULE$/i.test(line)) {
      return false;
    }
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

function buildIcs(blocks) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICIBM 2026 Schedule Explorer//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const stamp = toUtcStamp(new Date());
  for (const block of blocks) {
    if (!block.date || !block.startTime) {
      continue;
    }
    const start = toIcsDateTime(block.date, block.startTime);
    const end = toIcsDateTime(block.date, block.endTime || addMinutes(block.startTime, 60));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${block.id}@icibm2026`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${CONFERENCE_TZ}:${start}`,
      `DTEND;TZID=${CONFERENCE_TZ}:${end}`,
      `SUMMARY:${escapeIcsText(block.title)}`,
      `DESCRIPTION:${escapeIcsText([block.dayLabel, block.room, block.body].filter(Boolean).join(" | "))}`,
      "LOCATION:Jacobs School of Medicine and Biomedical Sciences, Buffalo, NY",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function toIcsDateTime(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [clock, period] = time.split(" ");
  let [hours, minutes] = clock.split(":").map(Number);
  if (period === "PM" && hours !== 12) {
    hours += 12;
  }
  if (period === "AM" && hours === 12) {
    hours = 0;
  }
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`;
}

function toUtcStamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
    // ignore storage failures
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
