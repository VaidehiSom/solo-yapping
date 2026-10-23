(() => {
  "use strict";

  const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT_KCdSaPifOP9Q8Bp0W1Rrvh4gwoOVdtqsAm_OIiHvh1EmiwlHCOIr42xSf8rGP4pq2AFWFqQrFFQ6/pub?gid=708601777&single=true&output=csv";

  const STORAGE_KEY = "solo-yapping-progress-v1";
  const state = { missions: [], completed: new Set(), bookmarked: new Set() };
  const $ = (id) => document.getElementById(id);
  const els = {
    completed: $("completed-count"),
    bookmarked: $("bookmarked-count"),
    available: $("available-count"),
    total: $("mission-total"),
    grid: $("mission-grid"),
    empty: $("empty-state"),
    search: $("search-input"),
    onlyBookmarks: $("bookmarked-filter"),
    hideCompleted: $("hide-completed-filter")
  };

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.completed = new Set(saved.completed || []);
      state.bookmarked = new Set(saved.bookmarked || []);
    } catch (_) {
      state.completed = new Set();
      state.bookmarked = new Set();
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        completed: [...state.completed],
        bookmarked: [...state.bookmarked]
      }));
    } catch (_) {
      // Progress remains usable for the current page session.
    }
    renderStats();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function normalize(row, index) {
    const get = (...keys) => {
      for (const key of keys) {
        const found = Object.keys(row).find(k => k.trim().toLowerCase() === key.toLowerCase());
        if (found && row[found] !== undefined) return String(row[found]).trim();
      }
      return "";
    };
    return {
      id: get("id", "mission id") || `mission-${index + 1}`,
      title: get("title", "mission title") || "",
      description: get("description", "task", "mission") || ""
    };
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(value => value.trim() !== "")) rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(header => header.trim().replace(/^\uFEFF/, ""));
    return rows.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
  }

  async function loadMissions() {
    if (!SHEET_CSV_URL.trim()) {
      state.missions = [];
      renderAll();
      return;
    }
    try {
      const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Sheet request failed");
      const rows = parseCSV(await response.text());
      state.missions = rows.map(normalize).filter(mission => mission.title);
    } catch (_) {
      state.missions = [];
    }
    renderAll();
  }

  function renderStats() {
    els.completed.textContent = state.completed.size;
    els.bookmarked.textContent = state.bookmarked.size;
    els.available.textContent = state.missions.length;
    els.total.textContent = `${state.missions.length} mission${state.missions.length === 1 ? "" : "s"}`;
  }

  function filteredMissions() {
    const query = els.search.value.trim().toLowerCase();
    return state.missions.filter(mission => {
      const matchesSearch = `${mission.title} ${mission.description}`.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (els.onlyBookmarks.checked && !state.bookmarked.has(mission.id)) return false;
      if (els.hideCompleted.checked && state.completed.has(mission.id)) return false;
      return true;
    });
  }

  function missionCard(mission) {
    const done = state.completed.has(mission.id);
    const saved = state.bookmarked.has(mission.id);
    return `
      <article class="mission-card${done ? " is-complete" : ""}">
        <div class="card-top">
          <button class="bookmark-button${saved ? " is-active" : ""}" data-action="bookmark" data-id="${escapeHtml(mission.id)}"
            aria-label="${saved ? "Remove bookmark from" : "Bookmark"} ${escapeHtml(mission.title)}" title="${saved ? "Remove bookmark" : "Bookmark"}">
            ${saved ? "★" : "☆"}
          </button>
        </div>
        <h2>${escapeHtml(mission.title)}</h2>
        <p class="description">${escapeHtml(mission.description)}</p>
        <div class="card-bottom">
          <button class="complete-button${done ? " done" : ""}" data-action="complete" data-id="${escapeHtml(mission.id)}">
            ${done ? "✓ Completed" : "Mark complete"}
          </button>
        </div>
      </article>`;
  }

  function renderGrid() {
    const missions = filteredMissions();
    els.grid.innerHTML = missions.map(missionCard).join("");
    els.empty.classList.toggle("hidden", missions.length !== 0);
  }

  function renderAll() {
    renderStats();
    renderGrid();
  }

  function toggleCompleted(id) {
    if (state.completed.has(id)) state.completed.delete(id);
    else state.completed.add(id);
    saveProgress();
    renderGrid();
  }

  function toggleBookmark(id) {
    if (state.bookmarked.has(id)) state.bookmarked.delete(id);
    else state.bookmarked.add(id);
    saveProgress();
    renderGrid();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "complete") toggleCompleted(id);
    if (action === "bookmark") toggleBookmark(id);
  });

  [els.search, els.onlyBookmarks, els.hideCompleted].forEach(element => {
    element.addEventListener("input", renderGrid);
    element.addEventListener("change", renderGrid);
  });

  $("refresh-button").addEventListener("click", loadMissions);

  readProgress();
  loadMissions();
})();
