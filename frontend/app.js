const API_BASE = "";

// ── Helpers ───────────────────────────────────────────────────
function getToday() {
  return new Date().toISOString().split("T")[0];
}

function formatDateLabel(isoDate) {
  return new Date(isoDate + "T12:00:00")
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Streak ────────────────────────────────────────────────────
const STREAK_KEY = "quizler_streak";

function getStreak() {
  try {
    return JSON.parse(
      localStorage.getItem(STREAK_KEY) ||
      '{"count":0,"bestStreak":0,"lastCompleted":null,"lastScore":null,"history":[]}'
    );
  } catch {
    return { count: 0, bestStreak: 0, lastCompleted: null, lastScore: null, history: [] };
  }
}

function hasCompletedToday() {
  return getStreak().lastCompleted === getToday();
}

function recordDailyCompletion(score, total) {
  const streak = getStreak();
  const today = getToday();
  if (streak.lastCompleted === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const newCount = streak.lastCompleted === yesterday ? streak.count + 1 : 1;
  const history = (streak.history || []).filter(d => d !== today);
  history.push(today);
  localStorage.setItem(STREAK_KEY, JSON.stringify({
    count: newCount,
    bestStreak: Math.max(streak.bestStreak || 0, newCount),
    lastCompleted: today,
    lastScore: { score, total },
    history: history.slice(-100),
  }));
}

// ── Stats ─────────────────────────────────────────────────────
const STATS_KEY = "quizler_stats";

function getStats() {
  try {
    return JSON.parse(
      localStorage.getItem(STATS_KEY) ||
      '{"totalAnswered":0,"totalCorrect":0,"byCategory":{},"games":[]}'
    );
  } catch {
    return { totalAnswered: 0, totalCorrect: 0, byCategory: {}, games: [] };
  }
}

function recordGame(mode, categoryName, score, total) {
  const stats = getStats();
  stats.totalAnswered += total;
  stats.totalCorrect += score;
  if (!stats.byCategory[categoryName]) stats.byCategory[categoryName] = { answered: 0, correct: 0 };
  stats.byCategory[categoryName].answered += total;
  stats.byCategory[categoryName].correct += score;
  stats.games.unshift({ mode, category: categoryName, score, total, date: getToday() });
  stats.games = stats.games.slice(0, 30);
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ── Bookmarks ─────────────────────────────────────────────────
const BOOKMARKS_KEY = "quizler_bookmarks";

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
  } catch {
    return [];
  }
}

function bookmarkCurrentQuestion() {
  if (!currentQuestionData) return false;
  const bookmarks = getBookmarks();
  if (bookmarks.some(b => b.question === currentQuestionData.question)) return false;
  bookmarks.unshift({
    question: currentQuestionData.question,
    answer: lastCorrectAnswer,
    category: quizCategory,
    date: getToday(),
  });
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks.slice(0, 200)));
  return true;
}

function removeBookmark(index) {
  const bookmarks = getBookmarks();
  bookmarks.splice(index, 1);
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

// ── Sudden Death personal best ────────────────────────────────
const SD_BEST_KEY = "quizler_sd_best";

function getSdBest() {
  return parseInt(localStorage.getItem(SD_BEST_KEY) || "0", 10);
}

function updateSdBest(score) {
  if (score > getSdBest()) {
    localStorage.setItem(SD_BEST_KEY, String(score));
    return true;
  }
  return false;
}

// ── Categories ────────────────────────────────────────────────
const CATEGORIES = [
  { id: 22, name: "Geography",  desc: "Countries, capitals & landmarks" },
  { id: 17, name: "Science",    desc: "Biology, physics & space" },
  { id: 23, name: "History",    desc: "Events, figures & timelines" },
  { id: 11, name: "Film & TV",  desc: "Movies, shows & pop culture" },
  { id: 21, name: "Sports",     desc: "Teams, records & athletes" },
  { id: 18, name: "Technology", desc: "Computing, internet & gadgets" },
  { id: 10, name: "Books",      desc: "Authors, novels & literature" },
  { id: 12, name: "Music",      desc: "Artists, albums & songs" },
];

// ── Router ────────────────────────────────────────────────────
function navigate(hash) {
  window.location.hash = hash;
}

function router() {
  clearAutoNext();
  clearQuestionTimer();
  clearSessionTimer();
  const hash = window.location.hash || "#home";
  if (hash.startsWith("#category/")) {
    const id = parseInt(hash.split("/")[1]);
    const cat = CATEGORIES.find(c => c.id === id);
    cat ? renderCategoryConfig(cat) : renderHome();
  } else {
    const pages = {
      "#home":         renderHome,
      "#daily":        renderDaily,
      "#categories":   renderCategories,
      "#quick":        renderQuickConfig,
      "#stats":        renderStats,
      "#jeopardy":     renderJeopardyConfig,
      "#sudden-death": renderSuddenDeathConfig,
      "#timed":        renderTimedConfig,
      "#numbers":      renderNumbersConfig,
      "#saved":        renderSaved,
    };
    (pages[hash] || renderHome)();
  }
  const root = document.getElementById("pageRoot");
  if (root) root.focus({ preventScroll: true });
}

let _suppressNextHashChange = false;

window.addEventListener("hashchange", (e) => {
  if (_suppressNextHashChange) { _suppressNextHashChange = false; return; }
  if (sessionId !== null) {
    if (!confirm("Leave this quiz? Your progress will be lost.")) {
      _suppressNextHashChange = true;
      const oldHash = e.oldURL.includes("#") ? "#" + e.oldURL.split("#")[1] : "#home";
      window.location.hash = oldHash;
      return;
    }
    sessionId = null;
    clearAutoNext();
    clearQuestionTimer();
    clearSessionTimer();
  }
  router();
});
window.addEventListener("load", router);

window.addEventListener("beforeunload", (e) => {
  if (sessionId !== null) e.preventDefault();
});

document.body.addEventListener("click", (e) => {
  const navTarget = e.target.closest("[data-nav]");
  if (navTarget) { navigate(navTarget.dataset.nav); return; }
  const removeTarget = e.target.closest("[data-remove]");
  if (removeTarget) doRemoveBookmark(parseInt(removeTarget.dataset.remove));
});

document.body.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    const navTarget = e.target.closest("[data-nav]");
    if (navTarget) { e.preventDefault(); navigate(navTarget.dataset.nav); }
  }
});

// ── Card keyboard support ─────────────────────────────────────
function applyCardKeyboardSupport() {
  document.querySelectorAll(".mode-card, .category-card").forEach(card => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
  });
}

// ── Header helpers ────────────────────────────────────────────
function setBackBtn(show, targetHash) {
  const btn = document.getElementById("backBtn");
  btn.style.display = show ? "block" : "none";
  if (show) btn.onclick = () => navigate(targetHash || "#home");
}

function updateStreakBadge() {
  const streak = getStreak();
  const el = document.getElementById("streakDisplay");
  el.innerHTML = streak.count > 0
    ? `<span class="streak-badge">STREAK&nbsp;&nbsp;${streak.count}</span>`
    : "";
}

// ═══════════════════════════════════════════════════════════════
// PAGE: HOME
// ═══════════════════════════════════════════════════════════════
function renderHome() {
  updateStreakBadge();
  setBackBtn(false);
  document.getElementById("pageRoot").innerHTML = `
    <div class="home-sections">

      <div class="mode-card" data-nav="#daily">
        <div class="mode-card-name">Daily Challenge</div>
        <div class="mode-card-desc">10 questions · refreshes at midnight</div>
      </div>

      <div class="home-section">
        <div class="home-section-label">CHALLENGE MODES</div>
        <div class="home-section-grid">
          <div class="mode-card" data-nav="#sudden-death">
            <div class="mode-card-name">Sudden Death</div>
            <div class="mode-card-desc">One wrong answer ends everything</div>
          </div>
          <div class="mode-card" data-nav="#timed">
            <div class="mode-card-name">Timed Challenge</div>
            <div class="mode-card-desc">Race the clock per question</div>
          </div>
          <div class="mode-card" data-nav="#jeopardy">
            <div class="mode-card-name">Jeopardy</div>
            <div class="mode-card-desc">Real clues · type your answer</div>
          </div>
        </div>
      </div>

      <div class="home-section">
        <div class="home-section-label">EXPLORE</div>
        <div class="home-section-grid">
          <div class="mode-card" data-nav="#categories">
            <div class="mode-card-name">Categories</div>
            <div class="mode-card-desc">8 rooms · choose your topic</div>
          </div>
          <div class="mode-card" data-nav="#quick">
            <div class="mode-card-name">Quick Play</div>
            <div class="mode-card-desc">Random questions · any topic · no setup</div>
          </div>
          <div class="mode-card" data-nav="#numbers">
            <div class="mode-card-name">Number Facts</div>
            <div class="mode-card-desc">Fill in the blank · number trivia</div>
          </div>
        </div>
      </div>

      <div class="home-section">
        <div class="home-section-label">PERSONAL</div>
        <div class="home-section-grid">
          <div class="mode-card" data-nav="#stats">
            <div class="mode-card-name">Stats</div>
            <div class="mode-card-desc">Your record &amp; history</div>
          </div>
          <div class="mode-card" data-nav="#saved">
            <div class="mode-card-name">Saved Questions</div>
            <div class="mode-card-desc">${getBookmarks().length} bookmarked</div>
          </div>
        </div>
      </div>

    </div>
  `;
  applyCardKeyboardSupport();
}

// ═══════════════════════════════════════════════════════════════
// PAGE: DAILY CHALLENGE
// ═══════════════════════════════════════════════════════════════
function renderDaily() {
  setBackBtn(true, "#home");
  updateStreakBadge();
  const streak = getStreak();
  const completed = hasCompletedToday();
  const todayLabel = formatDateLabel(getToday());

  if (completed) {
    const { score, total } = streak.lastScore || { score: 0, total: 10 };
    document.getElementById("pageRoot").innerHTML = `
      <div class="daily-page">
        <div class="daily-date">${todayLabel}</div>
        <div class="daily-title">Daily Challenge</div>
        <span class="daily-streak-count">STREAK&nbsp;&nbsp;${streak.count}</span>
        <div class="daily-done-score">${score} / ${total}</div>
        <div class="daily-done-msg">Completed. Come back tomorrow.</div>
        <button class="btn-primary" data-nav="#home">Back to Home</button>
      </div>
    `;
  } else {
    document.getElementById("pageRoot").innerHTML = `
      <div class="daily-page">
        <div class="daily-date">${todayLabel}</div>
        <div class="daily-title">Daily Challenge</div>
        <span class="daily-streak-count">STREAK&nbsp;&nbsp;${streak.count}</span>
        <div class="daily-done-msg">10 questions · refreshes at midnight</div>
        <button class="btn-primary" id="startDailyBtn">Start Today's Quiz</button>
        <div id="dailyError" class="error-msg" style="display:none;"></div>
      </div>
    `;
    document.getElementById("startDailyBtn").addEventListener("click", startDailyQuiz);
  }
}

async function startDailyQuiz() {
  const btn = document.getElementById("startDailyBtn");
  const errEl = document.getElementById("dailyError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  try {
    const res = await fetch(`${API_BASE}/api/daily/start`, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "daily", "General Knowledge", "#daily");
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startDailyBtn");
    if (b) { b.disabled = false; b.innerText = "Start Today's Quiz"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: CATEGORIES
// ═══════════════════════════════════════════════════════════════
function renderCategories() {
  setBackBtn(true, "#home");
  document.getElementById("pageRoot").innerHTML = `
    <div class="categories-grid">
      ${CATEGORIES.map(cat => `
        <div class="category-card" data-nav="#category/${cat.id}">
          <div class="category-card-name">${cat.name}</div>
          <div class="category-card-desc">${cat.desc}</div>
        </div>
      `).join("")}
    </div>
  `;
  applyCardKeyboardSupport();
}

// ═══════════════════════════════════════════════════════════════
// PAGE: CATEGORY CONFIG
// ═══════════════════════════════════════════════════════════════
let selectedDifficulty = "medium";
let selectedAmount = 10;

function renderCategoryConfig(cat) {
  setBackBtn(true, "#categories");
  selectedDifficulty = "medium"; selectedAmount = 10;
  document.getElementById("pageRoot").innerHTML = `
    <div class="cat-config">
      <div class="cat-config-name">${cat.name}</div>
      <div class="cat-config-desc">${cat.desc}</div>
      <div class="config-section">
        <label>Difficulty</label>
        <div class="tab-group" id="diffTabs">
          <button class="tab-btn" data-val="easy">Easy</button>
          <button class="tab-btn active" data-val="medium">Medium</button>
          <button class="tab-btn" data-val="hard">Hard</button>
        </div>
      </div>
      <div class="config-section">
        <label>Questions</label>
        <div class="tab-group" id="amountTabs">
          <button class="tab-btn" data-val="5">5</button>
          <button class="tab-btn active" data-val="10">10</button>
          <button class="tab-btn" data-val="15">15</button>
          <button class="tab-btn" data-val="20">20</button>
        </div>
      </div>
      <button class="btn-primary config-start-btn" id="startCatBtn">Start Quiz</button>
      <div id="catError" class="error-msg" style="display:none;"></div>
    </div>
  `;
  document.querySelectorAll("#diffTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#diffTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedDifficulty = btn.dataset.val;
    });
  });
  document.querySelectorAll("#amountTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#amountTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedAmount = parseInt(btn.dataset.val);
    });
  });
  document.getElementById("startCatBtn").addEventListener("click", () => startCategoryQuiz(cat));
}

async function startCategoryQuiz(cat) {
  const btn = document.getElementById("startCatBtn");
  const errEl = document.getElementById("catError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  const url = `${API_BASE}/api/start?amount=${selectedAmount}&q_type=multiple&category=${cat.id}&difficulty=${selectedDifficulty}`;
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "category", cat.name, `#category/${cat.id}`);
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startCatBtn");
    if (b) { b.disabled = false; b.innerText = "Start Quiz"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: QUICK PLAY CONFIG
// ═══════════════════════════════════════════════════════════════
let selectedQuickType = "boolean";

function renderQuickConfig() {
  setBackBtn(true, "#home");
  selectedAmount = 10;
  selectedQuickType = "boolean";
  document.getElementById("pageRoot").innerHTML = `
    <div class="cat-config">
      <div class="cat-config-name">Quick Play</div>
      <div class="cat-config-desc">Random questions · any topic · no setup</div>
      <div class="config-section">
        <label>Format</label>
        <div class="tab-group" id="typeTabs">
          <button class="tab-btn active" data-val="boolean">True / False</button>
          <button class="tab-btn" data-val="multiple">Multiple Choice</button>
        </div>
      </div>
      <div class="config-section">
        <label>Questions</label>
        <div class="tab-group" id="amountTabs">
          <button class="tab-btn" data-val="5">5</button>
          <button class="tab-btn active" data-val="10">10</button>
          <button class="tab-btn" data-val="15">15</button>
          <button class="tab-btn" data-val="20">20</button>
        </div>
      </div>
      <button class="btn-primary config-start-btn" id="startQuickBtn">Start Quiz</button>
      <div id="quickError" class="error-msg" style="display:none;"></div>
    </div>
  `;
  document.querySelectorAll("#typeTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#typeTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedQuickType = btn.dataset.val;
    });
  });
  document.querySelectorAll("#amountTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#amountTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedAmount = parseInt(btn.dataset.val);
    });
  });
  document.getElementById("startQuickBtn").addEventListener("click", startQuickQuiz);
}

async function startQuickQuiz() {
  const btn = document.getElementById("startQuickBtn");
  const errEl = document.getElementById("quickError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  try {
    const res = await fetch(`${API_BASE}/api/start?amount=${selectedAmount}&q_type=${selectedQuickType}`, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "quick", "General", "#quick");
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startQuickBtn");
    if (b) { b.disabled = false; b.innerText = "Start Quiz"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: JEOPARDY CONFIG
// ═══════════════════════════════════════════════════════════════
let selectedJeopardyCount = 10;

function renderJeopardyConfig() {
  setBackBtn(true, "#home");
  selectedJeopardyCount = 10;
  document.getElementById("pageRoot").innerHTML = `
    <div class="cat-config">
      <div class="cat-config-name">Jeopardy</div>
      <div class="cat-config-desc">Real clues from the Jeopardy archive · type your answer · no multiple choice</div>
      <div class="config-section">
        <label>Clues</label>
        <div class="tab-group" id="jeopardyCountTabs">
          <button class="tab-btn" data-val="5">5</button>
          <button class="tab-btn active" data-val="10">10</button>
          <button class="tab-btn" data-val="15">15</button>
          <button class="tab-btn" data-val="20">20</button>
        </div>
      </div>
      <button class="btn-primary config-start-btn" id="startJeopardyBtn">Start Jeopardy</button>
      <div id="jeopardyError" class="error-msg" style="display:none;"></div>
    </div>
  `;
  document.querySelectorAll("#jeopardyCountTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#jeopardyCountTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedJeopardyCount = parseInt(btn.dataset.val);
    });
  });
  document.getElementById("startJeopardyBtn").addEventListener("click", startJeopardyQuiz);
}

async function startJeopardyQuiz() {
  const btn = document.getElementById("startJeopardyBtn");
  const errEl = document.getElementById("jeopardyError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  try {
    const res = await fetch(`${API_BASE}/api/jeopardy/start?count=${selectedJeopardyCount}`, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "jeopardy", "Jeopardy", "#jeopardy", { format: "jeopardy" });
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startJeopardyBtn");
    if (b) { b.disabled = false; b.innerText = "Start Jeopardy"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: SUDDEN DEATH CONFIG
// ═══════════════════════════════════════════════════════════════
function renderSuddenDeathConfig() {
  setBackBtn(true, "#home");
  document.getElementById("pageRoot").innerHTML = `
    <div class="cat-config">
      <div class="cat-config-name">Sudden Death</div>
      <div class="cat-config-desc">One wrong answer ends the game. No second chances.</div>
      <div class="sd-best">Personal best: ${getSdBest()} correct</div>
      <button class="btn-primary config-start-btn" id="startSdBtn">Start</button>
      <div id="sdError" class="error-msg" style="display:none;"></div>
    </div>
  `;
  document.getElementById("startSdBtn").addEventListener("click", startSuddenDeathQuiz);
}

async function startSuddenDeathQuiz() {
  const btn = document.getElementById("startSdBtn");
  const errEl = document.getElementById("sdError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  try {
    const res = await fetch(`${API_BASE}/api/start?amount=30&q_type=multiple`, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "sudden-death", "General", "#sudden-death", { suddenDeath: true });
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startSdBtn");
    if (b) { b.disabled = false; b.innerText = "Start"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: TIMED CHALLENGE CONFIG
// ═══════════════════════════════════════════════════════════════
let selectedTimedSeconds = 60;

function renderTimedConfig() {
  setBackBtn(true, "#home");
  selectedTimedSeconds = 60;
  document.getElementById("pageRoot").innerHTML = `
    <div class="cat-config">
      <div class="cat-config-name">Timed Challenge</div>
      <div class="cat-config-desc">Answer as many questions as you can before time runs out.</div>
      <div class="config-section">
        <label>Total time</label>
        <div class="tab-group" id="timedSecsTabs">
          <button class="tab-btn active" data-val="60">60s</button>
          <button class="tab-btn" data-val="90">90s</button>
          <button class="tab-btn" data-val="120">120s</button>
        </div>
      </div>
      <button class="btn-primary config-start-btn" id="startTimedBtn">Start</button>
      <div id="timedError" class="error-msg" style="display:none;"></div>
    </div>
  `;
  document.querySelectorAll("#timedSecsTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#timedSecsTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedTimedSeconds = parseInt(btn.dataset.val);
    });
  });
  document.getElementById("startTimedBtn").addEventListener("click", startTimedQuiz);
}

async function startTimedQuiz() {
  const btn = document.getElementById("startTimedBtn");
  const errEl = document.getElementById("timedError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  try {
    const res = await fetch(`${API_BASE}/api/start?amount=50&q_type=multiple`, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "timed", "General", "#timed", { timedSeconds: selectedTimedSeconds });
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startTimedBtn");
    if (b) { b.disabled = false; b.innerText = "Start"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: NUMBERS CONFIG
// ═══════════════════════════════════════════════════════════════
let selectedNumbersCount = 8;

function renderNumbersConfig() {
  setBackBtn(true, "#home");
  selectedNumbersCount = 8;
  document.getElementById("pageRoot").innerHTML = `
    <div class="cat-config">
      <div class="cat-config-name">Number Facts</div>
      <div class="cat-config-desc">Fill in the missing number from real number trivia facts.</div>
      <div class="config-section">
        <label>Questions</label>
        <div class="tab-group" id="numbersCountTabs">
          <button class="tab-btn" data-val="5">5</button>
          <button class="tab-btn active" data-val="8">8</button>
          <button class="tab-btn" data-val="12">12</button>
        </div>
      </div>
      <button class="btn-primary config-start-btn" id="startNumbersBtn">Start</button>
      <div id="numbersError" class="error-msg" style="display:none;"></div>
    </div>
  `;
  document.querySelectorAll("#numbersCountTabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#numbersCountTabs .tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active"); selectedNumbersCount = parseInt(btn.dataset.val);
    });
  });
  document.getElementById("startNumbersBtn").addEventListener("click", startNumbersQuiz);
}

async function startNumbersQuiz() {
  const btn = document.getElementById("startNumbersBtn");
  const errEl = document.getElementById("numbersError");
  btn.disabled = true; btn.innerText = "Loading..."; errEl.style.display = "none";
  try {
    const res = await fetch(`${API_BASE}/api/numbers/start?count=${selectedNumbersCount}`, { method: "POST" });
    if (!res.ok) { const e = await res.json(); errEl.innerText = e.detail || "Failed."; errEl.style.display = "block"; return; }
    startQuiz(await res.json(), "numbers", "Numbers", "#numbers");
  } catch {
    errEl.innerText = "Could not reach the server."; errEl.style.display = "block";
  } finally {
    const b = document.getElementById("startNumbersBtn");
    if (b) { b.disabled = false; b.innerText = "Start"; }
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE: SAVED QUESTIONS
// ═══════════════════════════════════════════════════════════════
function renderSaved() {
  setBackBtn(true, "#home");
  const bookmarks = getBookmarks();
  if (bookmarks.length === 0) {
    document.getElementById("pageRoot").innerHTML = `
      <div class="saved-page">
        <div class="stat-empty">No saved questions yet.<br>Bookmark questions during a quiz to see them here.</div>
      </div>
    `;
    return;
  }
  const items = bookmarks.map((b, i) => `
    <div class="saved-item">
      <div class="saved-question">${escapeHtml(b.question)}</div>
      <div class="saved-answer">Answer: ${escapeHtml(b.answer)}</div>
      <div class="saved-meta"><span class="saved-category">${escapeHtml(b.category)}</span><span class="saved-date">${b.date}</span></div>
      <button class="saved-remove" data-remove="${i}">Remove</button>
    </div>
  `).join("");
  document.getElementById("pageRoot").innerHTML = `
    <div class="saved-page">
      <div class="stat-section-label">${bookmarks.length} Saved Question${bookmarks.length !== 1 ? "s" : ""}</div>
      ${items}
    </div>
  `;
}

function doRemoveBookmark(index) {
  removeBookmark(index);
  renderSaved();
}

// ═══════════════════════════════════════════════════════════════
// PAGE: STATS
// ═══════════════════════════════════════════════════════════════
function renderStats() {
  setBackBtn(true, "#home");
  const stats = getStats();
  const streak = getStreak();
  const accuracy = stats.totalAnswered > 0
    ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;
  const modeLabel = m => ({ daily: "Daily", quick: "Quick Play", "sudden-death": "Sudden Death",
    timed: "Timed", jeopardy: "Jeopardy", numbers: "Numbers" }[m] || m);
  const recentRows = stats.games.slice(0, 10).map(g => `
    <div class="stat-game-row">
      <span class="stat-game-mode">${modeLabel(g.mode) || g.category}</span>
      <span class="stat-game-score">${g.score}&nbsp;/&nbsp;${g.total}</span>
      <span class="stat-game-date">${g.date}</span>
    </div>
  `).join("") || `<div class="stat-empty">No games played yet.</div>`;
  document.getElementById("pageRoot").innerHTML = `
    <div class="stats-page">
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-value">${stats.totalAnswered}</div><div class="stat-label">Questions Answered</div></div>
        <div class="stat-item"><div class="stat-value">${accuracy}%</div><div class="stat-label">Accuracy</div></div>
        <div class="stat-item"><div class="stat-value">${streak.count}</div><div class="stat-label">Current Streak</div></div>
        <div class="stat-item"><div class="stat-value">${streak.bestStreak || 0}</div><div class="stat-label">Best Streak</div></div>
      </div>
      <div class="stat-section-label">Recent Games</div>
      <div class="stat-games">${recentRows}</div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// QUIZ ENGINE
// ═══════════════════════════════════════════════════════════════
let sessionId           = null;
let totalQuestions      = 0;
let scoreTracker        = 0;
let pendingNext         = null;
let autoNextTimer       = null;
let quizMode            = "quick";
let quizCategory        = "General";
let quizReturnHash      = "#home";
let quizFormat          = "standard"; // "standard" | "jeopardy"
let quizSuddenDeath     = false;
let quizTimedSeconds    = 0;
let questionTimer       = null;
let lastCorrectAnswer   = "";
let currentQuestionData = null;
// session timer (timed challenge)
let sessionTimerInterval = null;
let sessionEnd           = 0;
let sessionAttempted     = 0;
let sessionActive        = false;

function clearAutoNext() {
  if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; }
}

function clearQuestionTimer() {
  if (questionTimer) { clearTimeout(questionTimer); questionTimer = null; }
}

function clearSessionTimer() {
  if (sessionTimerInterval) { clearInterval(sessionTimerInterval); sessionTimerInterval = null; }
  sessionActive = false;
}

function startQuiz(data, mode, categoryName, returnHash, options = {}) {
  clearAutoNext();
  clearQuestionTimer();
  clearSessionTimer();
  sessionId        = data.session_id;
  totalQuestions   = data.total;
  scoreTracker     = 0;
  sessionAttempted = 0;
  quizMode         = mode || "quick";
  quizCategory     = categoryName || "General";
  quizReturnHash   = returnHash || "#home";
  quizFormat       = options.format || "standard";
  quizSuddenDeath  = options.suddenDeath || false;
  quizTimedSeconds = options.timedSeconds || 0;

  setBackBtn(false);

  const timerHtml = quizMode === "timed"
    ? `<div id="timerBar"><div id="timerFill"></div></div>` : "";

  document.getElementById("pageRoot").innerHTML = `
    <div id="progressArea">
      <div id="questionCounter"></div>
      <div id="questionDots"></div>
    </div>
    <div id="quizActive">
      ${timerHtml}
      <div id="jeopardyMeta" class="jeopardy-category" style="display:none;"></div>
      <div class="quiz-meta"><span id="score"></span></div>
      <div id="question">Loading...</div>
      <div id="feedback"></div>
      <div id="booleanButtons">
        <button id="trueBtn" class="answer-btn">True</button>
        <button id="falseBtn" class="answer-btn">False</button>
      </div>
      <div id="multipleButtons" style="display:none;"></div>
      <div id="jeopardyArea" style="display:none;">
        <div id="jeopardyInput">
          <input type="text" id="jeopardyAnswer" placeholder="Your answer..." autocomplete="off" />
          <button id="jeopardySubmit" class="btn-primary">Submit</button>
        </div>
        <div id="jeopardyCorrectAnswer" style="display:none;"></div>
      </div>
      <div id="bookmarkArea" style="display:none;">
        <button id="bookmarkBtn" class="bookmark-btn">&#9733; Save question</button>
      </div>
      <button id="nextBtn" style="display:none;">Next →</button>
    </div>
    <div id="quizSummary" style="display:none;">
      <div class="summary-divider"></div>
      <div id="summaryScore" class="summary-score"></div>
      <div id="summaryMessage" class="summary-message"></div>
      <button id="playAgainBtn">Play Again</button>
      <button id="restartBtn">Back to Home</button>
    </div>
  `;

  document.getElementById("trueBtn").addEventListener("click", e => submitAnswer("True", e.currentTarget));
  document.getElementById("falseBtn").addEventListener("click", e => submitAnswer("False", e.currentTarget));
  document.getElementById("restartBtn").addEventListener("click", () => navigate("#home"));

  if (quizFormat === "jeopardy") {
    document.getElementById("jeopardySubmit").addEventListener("click", () => {
      const val = document.getElementById("jeopardyAnswer").value.trim();
      if (val) submitAnswer(val, null);
    });
    document.getElementById("jeopardyAnswer").addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const val = e.target.value.trim();
        if (val) submitAnswer(val, null);
      }
    });
  }

  if (quizMode === "timed") {
    // No dots for 50-question pool; session timer updates the counter
    document.getElementById("questionDots").style.display = "none";
    displayQuestion(data);
    startSessionTimer();
  } else {
    initProgressDots(data.total);
    displayQuestion(data);
  }
}

// ── Progress dots ─────────────────────────────────────────────
function initProgressDots(total) {
  const container = document.getElementById("questionDots");
  container.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = "q-dot";
    container.appendChild(dot);
  }
}

function updateProgressDots(currentNumber) {
  document.querySelectorAll(".q-dot").forEach((dot, i) => {
    if (i === currentNumber - 1) {
      dot.classList.remove("dot-correct", "dot-wrong");
      dot.classList.add("active");
    }
  });
  if (quizMode !== "timed") {
    document.getElementById("questionCounter").innerText = `Q ${currentNumber} / ${totalQuestions}`;
  }
}

function markCurrentDot(isCorrect) {
  const dot = document.querySelector(".q-dot.active");
  if (dot) {
    dot.classList.remove("active");
    dot.classList.add(isCorrect ? "dot-correct" : "dot-wrong");
  }
}

// ── Question timer ────────────────────────────────────────────
function startQuestionTimer() {
  if (!quizTimedSeconds || quizMode === "timed") return;
  clearQuestionTimer();
  const fill = document.getElementById("timerFill");
  if (!fill) return;
  fill.style.transition = "none";
  fill.style.width = "100%";
  fill.getBoundingClientRect(); // force reflow
  fill.style.transition = `width ${quizTimedSeconds}s linear`;
  fill.style.width = "0%";
  questionTimer = setTimeout(() => {
    questionTimer = null;
    submitAnswer("__timeout__", null);
  }, quizTimedSeconds * 1000);
}

// ── Session timer (timed challenge) ──────────────────────────
function startSessionTimer() {
  sessionActive = true;
  sessionEnd = Date.now() + quizTimedSeconds * 1000;
  const fill = document.getElementById("timerFill");
  if (fill) {
    fill.style.transition = "none";
    fill.style.width = "100%";
    fill.getBoundingClientRect();
    fill.style.transition = `width ${quizTimedSeconds}s linear`;
    fill.style.width = "0%";
  }
  sessionTimerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((sessionEnd - Date.now()) / 1000));
    const counter = document.getElementById("questionCounter");
    if (counter) counter.innerText = `${remaining}s · ${scoreTracker} correct`;
    if (remaining <= 0) {
      clearSessionTimer();
      endTimedSession();
    }
  }, 200);
}

function endTimedSession() {
  sessionId = null;
  disableAnswerButtons();
  clearAutoNext();
  recordGame(quizMode, quizCategory, scoreTracker, sessionAttempted);
  document.getElementById("quizActive").style.display = "none";
  document.getElementById("progressArea").style.display = "none";
  const pct = sessionAttempted > 0 ? Math.round((scoreTracker / sessionAttempted) * 100) : 0;
  document.getElementById("summaryScore").innerText = `${scoreTracker} / ${sessionAttempted}`;
  document.getElementById("summaryMessage").innerText = sessionAttempted === 0
    ? "No questions answered."
    : `${pct}% accuracy · ${quizTimedSeconds} seconds`;
  const playAgainBtn = document.getElementById("playAgainBtn");
  playAgainBtn.innerText = "Try Again";
  playAgainBtn.onclick = () => navigate("#timed");
  document.getElementById("quizSummary").style.display = "block";
}

// ── Question display ──────────────────────────────────────────
function displayQuestion(data) {
  clearQuestionTimer();
  currentQuestionData = data;
  document.getElementById("question").innerText = data.question;
  const feedback = document.getElementById("feedback");
  feedback.innerText = ""; feedback.className = "";
  document.getElementById("nextBtn").style.display = "none";

  const bookmarkArea = document.getElementById("bookmarkArea");
  bookmarkArea.style.display = "none";
  const bookmarkBtn = document.getElementById("bookmarkBtn");
  bookmarkBtn.disabled = false;
  bookmarkBtn.innerHTML = "&#9733; Save question";

  const jeopardyMeta = document.getElementById("jeopardyMeta");
  if (data.metadata && data.metadata.category) {
    jeopardyMeta.innerText = data.metadata.category;
    jeopardyMeta.style.display = "block";
  } else {
    jeopardyMeta.style.display = "none";
  }

  if (quizFormat === "jeopardy") {
    const input = document.getElementById("jeopardyAnswer");
    const correctEl = document.getElementById("jeopardyCorrectAnswer");
    input.value = ""; input.disabled = false;
    correctEl.style.display = "none"; correctEl.innerText = "";
    document.getElementById("jeopardySubmit").disabled = false;
  }

  updateProgressDots(data.number);
  renderAnswerButtons(data);
  startQuestionTimer();
}

function renderAnswerButtons(data) {
  const boolBtns     = document.getElementById("booleanButtons");
  const multiBtns    = document.getElementById("multipleButtons");
  const jeopardyArea = document.getElementById("jeopardyArea");

  if (quizFormat === "jeopardy") {
    boolBtns.style.display = "none";
    multiBtns.style.display = "none";
    jeopardyArea.style.display = "block";
    document.getElementById("jeopardyAnswer").focus();
  } else if (data.options) {
    boolBtns.style.display = "none";
    jeopardyArea.style.display = "none";
    multiBtns.style.display = "grid";
    multiBtns.innerHTML = "";
    data.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "answer-btn";
      btn.innerText = opt;
      btn.addEventListener("click", () => submitAnswer(opt, btn));
      multiBtns.appendChild(btn);
    });
  } else {
    jeopardyArea.style.display = "none";
    boolBtns.style.display = "";
    multiBtns.style.display = "none";
    document.getElementById("trueBtn").disabled = false;
    document.getElementById("falseBtn").disabled = false;
    document.getElementById("trueBtn").className = "answer-btn";
    document.getElementById("falseBtn").className = "answer-btn";
  }
}

function disableAnswerButtons() {
  clearQuestionTimer();
  ["trueBtn", "falseBtn"].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = true; });
  document.getElementById("multipleButtons").querySelectorAll("button").forEach(b => b.disabled = true);
  if (quizFormat === "jeopardy") {
    const input = document.getElementById("jeopardyAnswer");
    const sub = document.getElementById("jeopardySubmit");
    if (input) input.disabled = true;
    if (sub) sub.disabled = true;
  }
}

function highlightCorrectButton(correctAnswer) {
  [
    document.getElementById("trueBtn"),
    document.getElementById("falseBtn"),
    ...document.getElementById("multipleButtons").querySelectorAll("button"),
  ].filter(Boolean).forEach(btn => {
    if (btn.innerText.toLowerCase() === correctAnswer.toLowerCase()) btn.classList.add("correct");
  });
}

// ── Submit answer ─────────────────────────────────────────────
async function submitAnswer(answer, clickedBtn) {
  if (quizMode === "timed" && !sessionActive) return;
  disableAnswerButtons();
  const isTimeout = answer === "__timeout__";

  try {
    const res = await fetch(`${API_BASE}/api/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, answer: isTimeout ? "" : answer, timeout: isTimeout }),
    });
    const data = await res.json();
    if (!res.ok) { document.getElementById("feedback").innerText = data.detail || "Error."; return; }
    if (quizMode === "timed" && !sessionActive) return; // session ended while awaiting

    if (quizMode === "timed") sessionAttempted++;
    scoreTracker = data.score;
    lastCorrectAnswer = data.correct_answer;
    const feedback = document.getElementById("feedback");

    if (isTimeout) {
      feedback.innerText = `Time's up — ${data.correct_answer}`;
      feedback.className = "incorrect";
      markCurrentDot(false);
    } else if (data.correct) {
      feedback.innerText = "Correct";
      feedback.className = "correct";
      if (clickedBtn) clickedBtn.classList.add("correct");
      markCurrentDot(true);
    } else {
      feedback.innerText = `Wrong — ${data.correct_answer}`;
      feedback.className = "incorrect";
      if (clickedBtn) clickedBtn.classList.add("incorrect");
      if (quizFormat !== "jeopardy") highlightCorrectButton(data.correct_answer);
      markCurrentDot(false);
    }

    if (quizFormat === "jeopardy" && !data.correct) {
      const correctEl = document.getElementById("jeopardyCorrectAnswer");
      correctEl.innerText = `Correct answer: ${data.correct_answer}`;
      correctEl.style.display = "block";
    }

    // Show bookmark button after answering
    const bookmarkArea = document.getElementById("bookmarkArea");
    bookmarkArea.style.display = "block";
    document.getElementById("bookmarkBtn").onclick = () => {
      const saved = bookmarkCurrentQuestion();
      const btn = document.getElementById("bookmarkBtn");
      btn.innerHTML = saved ? "&#9733; Saved" : "&#9733; Already saved";
      btn.disabled = true;
    };

    const isCorrect = !isTimeout && data.correct;

    // Sudden death: wrong answer ends immediately
    if (quizSuddenDeath && !isCorrect) {
      const questionsPlayed = currentQuestionData ? currentQuestionData.number : 1;
      const nextBtn = document.getElementById("nextBtn");
      nextBtn.innerText = "See Result →";
      nextBtn.style.display = "block";
      nextBtn.onclick = () => { nextBtn.style.display = "none"; showSuddenDeathSummary(data.score, questionsPlayed); };
      return;
    }

    const nextBtn = document.getElementById("nextBtn");
    if (data.quiz_finished) {
      if (quizMode === "timed") {
        // exhausted all 50 questions before time — end session now
        clearSessionTimer();
        endTimedSession();
        return;
      }
      recordGame(quizMode, quizCategory, data.score, data.total);
      if (quizMode === "daily") recordDailyCompletion(data.score, data.total);
      nextBtn.innerText = "See Results →";
      nextBtn.style.display = "block";
      nextBtn.onclick = () => { nextBtn.style.display = "none"; showSummary(data.score, data.total); };
    } else if (quizMode === "timed") {
      // advance quickly — no 3s countdown in timed mode
      pendingNext = data.next_question;
      autoNextTimer = setTimeout(() => {
        clearAutoNext();
        displayQuestion(pendingNext);
        pendingNext = null;
      }, 700);
    } else {
      pendingNext = data.next_question;
      nextBtn.innerText = "Next →";
      nextBtn.classList.add("countdown");
      nextBtn.style.display = "block";
      nextBtn.onclick = () => {
        clearAutoNext();
        nextBtn.classList.remove("countdown");
        nextBtn.style.display = "none";
        displayQuestion(pendingNext);
        pendingNext = null;
      };
      autoNextTimer = setTimeout(() => nextBtn.click(), 3000);
    }
  } catch (e) {
    console.error(e);
    document.getElementById("feedback").innerText = "Error submitting answer.";
  }
}

// ── Sudden Death summary ──────────────────────────────────────
function showSuddenDeathSummary(score, questionsPlayed) {
  sessionId = null;
  document.getElementById("quizActive").style.display = "none";
  document.getElementById("progressArea").style.display = "none";
  const isNewBest = updateSdBest(score);
  recordGame(quizMode, quizCategory, score, questionsPlayed);
  document.getElementById("summaryScore").innerText = `${score} correct`;
  document.getElementById("summaryMessage").innerText = isNewBest
    ? "New personal best!"
    : `Personal best: ${getSdBest()} correct. ${score === 0 ? "No luck this time." : "Keep pushing."}`;
  const playAgainBtn = document.getElementById("playAgainBtn");
  playAgainBtn.innerText = "Try Again";
  playAgainBtn.onclick = () => navigate("#sudden-death");
  document.getElementById("quizSummary").style.display = "block";
}

// ── Summary ───────────────────────────────────────────────────
function showSummary(score, total) {
  sessionId = null;
  document.getElementById("quizActive").style.display = "none";
  document.getElementById("progressArea").style.display = "none";
  const pct = Math.round((score / total) * 100);
  document.getElementById("summaryScore").innerText = `${pct}%`;
  document.getElementById("summaryMessage").innerText = getSummaryMessage(pct);
  const playAgainBtn = document.getElementById("playAgainBtn");
  if (quizMode === "daily") {
    playAgainBtn.innerText = "Back to Menu";
    playAgainBtn.onclick = () => navigate("#home");
  } else {
    playAgainBtn.innerText = "Play Again";
    playAgainBtn.onclick = () => navigate(quizReturnHash);
  }
  document.getElementById("quizSummary").style.display = "block";
  updateStreakBadge();
}

function getSummaryMessage(pct) {
  if (pct === 100) return "Perfect score — absolutely flawless.";
  if (pct >= 80)   return "Strong performance. Well done.";
  if (pct >= 60)   return "Solid effort. Keep it up.";
  if (pct >= 40)   return "Room to improve — try again?";
  return "Keep practicing. You'll get there.";
}
