const API_URL = "http://127.0.0.1:8000/api/generate";
const API_URL_MULTIMODAL = "http://127.0.0.1:8000/api/generate-multimodal";
const SRS_KEY = "srs_flashcard_data";
const GAMIFICATION_KEY = "study_gamification";

// ── XP / Level config ────────────────────────────────────────────
const XP_PER_GOT_IT   = 10;
const XP_PER_CORRECT  = 15;
const XP_PER_GENERATE = 5;

function xpToLevel(xp) {
  // Level thresholds: 0,50,150,300,500,750,1050,...  (triangular growth)
  let lvl = 1;
  let threshold = 50;
  let step = 100;
  while (xp >= threshold) {
    lvl++;
    threshold += step;
    step += 50;
  }
  return lvl;
}

// ── State ────────────────────────────────────────────────────────

const state = {
  studyMaterial: null,
  quizIndex: 0,
  quizScore: 0,
  quizAnswered: false,
  flashcardStats: { mastered: 0, total: 0 },
  selectedFile: null,
  srsFilterDueOnly: false,
};

// ── DOM references ───────────────────────────────────────────────

const studyInput      = document.getElementById("study-input");
const generateBtn     = document.getElementById("generate-btn");
const btnLabel        = document.getElementById("btn-label");
const btnSpinner      = document.getElementById("btn-spinner");
const btnIcon         = document.getElementById("btn-icon");
const errorMsg        = document.getElementById("error-msg");
const summaryContent  = document.getElementById("summary-content");
const flashcardsGrid  = document.getElementById("flashcards-grid");
const flashcardProgress = document.getElementById("flashcard-progress");
const quizContent     = document.getElementById("quiz-content");
const quizScore       = document.getElementById("quiz-score");
const quizScoreBar    = document.getElementById("quiz-score-bar");
const themeToggle     = document.getElementById("theme-toggle");
const themeLabel      = document.getElementById("theme-label");

// File upload elements
const fileDropZone   = document.getElementById("file-drop-zone");
const fileInput      = document.getElementById("file-input");
const fileDropPrompt = document.getElementById("file-drop-prompt");
const filePreview    = document.getElementById("file-preview");
const fileName       = document.getElementById("file-name");
const fileSize       = document.getElementById("file-size");
const fileRemoveBtn  = document.getElementById("file-remove-btn");

// SRS + CSV elements
const csvExportBtn     = document.getElementById("csv-export-btn");
const srsDashboard     = document.getElementById("srs-dashboard");
const srsDueCount      = document.getElementById("srs-due-count");
const srsSoonCount     = document.getElementById("srs-soon-count");
const srsMasteredCount = document.getElementById("srs-mastered-count");
const srsReviewDueBtn  = document.getElementById("srs-review-due-btn");
const srsShowAllBtn    = document.getElementById("srs-show-all-btn");

// HUD elements
const hudXp          = document.getElementById("hud-xp");
const hudStreak      = document.getElementById("hud-streak");
const hudLevelBadge  = document.getElementById("hud-level-badge");

// ── Init ─────────────────────────────────────────────────────────

initTheme();
initFileUpload();
initSRSButtons();
initHUD();

themeToggle.addEventListener("click", toggleTheme);
generateBtn.addEventListener("click", handleGenerate);
csvExportBtn.addEventListener("click", exportFlashcardsCSV);

// ── Theme ─────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = saved !== "light" && (saved === "dark" || prefersDark);
  setTheme(isDark);
}

function toggleTheme() {
  setTheme(!document.documentElement.classList.contains("dark"));
}

function setTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  themeToggle.setAttribute("aria-checked", String(isDark));
  themeLabel.textContent = isDark ? "Light" : "Dark";
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

// ── Gamification / HUD ───────────────────────────────────────────

function loadGamification() {
  try {
    const raw = localStorage.getItem(GAMIFICATION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return { xp: 0, streak: 0, lastStudyDate: null };
}

function saveGamification(data) {
  localStorage.setItem(GAMIFICATION_KEY, JSON.stringify(data));
}

function initHUD() {
  const g = loadGamification();
  refreshStreak(g);
  renderHUD(g);
}

function refreshStreak(g) {
  const today = new Date().toDateString();
  if (!g.lastStudyDate) return;
  const lastDate = new Date(g.lastStudyDate);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  // Reset streak if more than one day has passed
  if (lastDate.toDateString() !== today && lastDate.toDateString() !== yesterday.toDateString()) {
    g.streak = 0;
    saveGamification(g);
  }
}

function awardXP(amount, label = "") {
  const g = loadGamification();
  const today = new Date().toDateString();

  if (g.lastStudyDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = g.lastStudyDate && new Date(g.lastStudyDate).toDateString() === yesterday.toDateString();
    g.streak = wasYesterday ? g.streak + 1 : 1;
    g.lastStudyDate = today;
  }

  g.xp += amount;
  saveGamification(g);
  renderHUD(g);
  animateXP();
}

function renderHUD(g) {
  const lvl = xpToLevel(g.xp);
  if (hudXp) hudXp.textContent = g.xp;
  if (hudStreak) hudStreak.textContent = g.streak;
  if (hudLevelBadge) hudLevelBadge.textContent = `Lvl ${lvl}`;
}

function animateXP() {
  if (!hudXp) return;
  hudXp.classList.remove("xp-gained");
  void hudXp.offsetWidth;
  hudXp.classList.add("xp-gained");
  setTimeout(() => hudXp.classList.remove("xp-gained"), 600);
}

// ── Confetti ─────────────────────────────────────────────────────

function triggerConfetti(opts = {}) {
  if (typeof confetti !== "function") return;
  confetti({
    particleCount: opts.particleCount || 90,
    spread: opts.spread || 70,
    origin: opts.origin || { y: 0.6 },
    colors: ["#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e", "#ec4899"],
    scalar: 0.9,
    ...opts,
  });
}

function triggerSmallBurst(el) {
  if (typeof confetti !== "function" || !el) return;
  const rect = el.getBoundingClientRect();
  confetti({
    particleCount: 30,
    spread: 50,
    origin: {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height / 2) / window.innerHeight,
    },
    colors: ["#8b5cf6", "#22c55e", "#06b6d4"],
    scalar: 0.75,
    ticks: 80,
  });
}

// ── File Upload ──────────────────────────────────────────────────

function initFileUpload() {
  fileDropZone.addEventListener("click", (e) => {
    if (e.target.closest("#file-remove-btn")) return;
    fileInput.click();
  });

  fileDropZone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) setSelectedFile(fileInput.files[0]);
  });

  fileRemoveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  fileDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDropZone.classList.add("drag-over");
  });

  fileDropZone.addEventListener("dragleave", () => {
    fileDropZone.classList.remove("drag-over");
  });

  fileDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length > 0) setSelectedFile(e.dataTransfer.files[0]);
  });
}

function setSelectedFile(file) {
  state.selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  fileDropPrompt.classList.add("hidden");
  filePreview.classList.remove("hidden");
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function clearSelectedFile() {
  state.selectedFile = null;
  fileInput.value = "";
  fileDropPrompt.classList.remove("hidden");
  filePreview.classList.add("hidden");
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ── Generate ─────────────────────────────────────────────────────

async function handleGenerate() {
  const content = studyInput.value.trim();
  const file = state.selectedFile;

  if (!content && !file) {
    showError("Please paste some study material or upload a file first.");
    return;
  }

  clearError();
  setLoading(true);
  showSkeletons();

  try {
    let data;
    if (file) {
      data = await fetchStudyMaterialMultimodal(content, file);
    } else {
      data = await fetchStudyMaterial(content);
    }

    state.studyMaterial = data;
    state.quizIndex = 0;
    state.quizScore = 0;
    state.quizAnswered = false;
    state.flashcardStats = { mastered: 0, total: data.flashcards?.length || 0 };

    renderSummary(data.summary);
    renderFlashcards(data.flashcards);
    renderQuiz();

    if (data.flashcards?.length > 0) {
      csvExportBtn.classList.remove("hidden");
    } else {
      csvExportBtn.classList.add("hidden");
    }

    // Award XP for generating
    awardXP(XP_PER_GENERATE);

  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
    resetEmptyStates();
  } finally {
    setLoading(false);
  }
}

async function fetchStudyMaterial(content) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody.detail) {
        detail = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch { /* use default */ }
    throw new Error(detail);
  }

  return response.json();
}

async function fetchStudyMaterialMultimodal(content, file) {
  const formData = new FormData();
  if (content) formData.append("content", content);
  if (file)    formData.append("file", file);

  const response = await fetch(API_URL_MULTIMODAL, { method: "POST", body: formData });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody.detail) {
        detail = typeof errBody.detail === "string" ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch { /* use default */ }
    throw new Error(detail);
  }

  return response.json();
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  btnSpinner.classList.toggle("hidden", !isLoading);
  if (btnIcon) btnIcon.style.display = isLoading ? "none" : "";
  btnLabel.textContent = isLoading ? "Generating..." : "Generate Study Guide";
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}

function clearError() {
  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");
}

function showSkeletons() {
  summaryContent.innerHTML = buildSkeletonLines(6);
  flashcardsGrid.innerHTML = Array.from({ length: 3 }, () =>
    '<div class="skeleton skeleton-card"></div>'
  ).join("");
  flashcardProgress.classList.add("hidden");
  quizContent.innerHTML = `
    <div class="skeleton skeleton-line long mb-3"></div>
    <div class="skeleton skeleton-line medium mb-4"></div>
    ${Array.from({ length: 4 }, () => '<div class="skeleton skeleton-quiz-option"></div>').join("")}
  `;
  quizScoreBar.classList.add("hidden");
  srsDashboard.classList.add("hidden");
  csvExportBtn.classList.add("hidden");
}

function buildSkeletonLines(count) {
  const widths = ["long", "long", "medium", "long", "short", "medium"];
  return widths.slice(0, count).map((w) => `<div class="skeleton skeleton-line ${w}"></div>`).join("");
}

function resetEmptyStates() {
  summaryContent.innerHTML = '<p class="empty-state">Your generated summary will appear here.</p>';
  flashcardsGrid.innerHTML  = '<p class="empty-state col-span-full">Your flashcards will appear here. Click a card to flip it.</p>';
  flashcardProgress.classList.add("hidden");
  quizContent.innerHTML = '<p class="empty-state">Your quiz questions will appear here.</p>';
  quizScoreBar.classList.add("hidden");
  srsDashboard.classList.add("hidden");
  csvExportBtn.classList.add("hidden");
}

// ── Summary ──────────────────────────────────────────────────────

function renderSummary(markdown) {
  summaryContent.innerHTML = renderMarkdown(markdown);
  renderMath(summaryContent);
}

/**
 * Render Markdown → HTML via marked.js (with GFM tables & breaks).
 * Falls back to a plain <br>-joined string if the CDN fails.
 */
function renderMarkdown(text) {
  if (!text) return "<p>No content available.</p>";

  if (typeof marked === "undefined") {
    // Graceful fallback if CDN fails to load
    return `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`;
  }

  return marked.parse(text, {
    gfm: true,
    breaks: true,
    mangle: false,
    headerIds: false,
  });
}

/**
 * Run KaTeX auto-render on a DOM element after innerHTML is set.
 * Supports $$...$$, \\[...\\] (display) and $...$, \\(...\\) (inline).
 */
function renderMath(el) {
  if (!el || typeof renderMathInElement === "undefined") return;
  renderMathInElement(el, {
    delimiters: [
      { left: "$$",  right: "$$",  display: true  },
      { left: "\\[", right: "\\]", display: true  },
      { left: "$",   right: "$",   display: false },
      { left: "\\(", right: "\\)", display: false },
    ],
    throwOnError: false,
  });
}

// ── Spaced Repetition System (SM-2) ──────────────────────────────

function loadSRSData() {
  try {
    const raw = localStorage.getItem(SRS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSRSData(data) {
  localStorage.setItem(SRS_KEY, JSON.stringify(data));
}

function getSRSCard(srsData, cardId) {
  const key = String(cardId);
  if (!srsData[key]) {
    srsData[key] = {
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date().toISOString(),
    };
  }
  return srsData[key];
}

function recordSRSResponse(cardId, quality) {
  const srsData = loadSRSData();
  const card    = getSRSCard(srsData, cardId);

  if (quality >= 3) {
    if (card.repetitions === 0)      card.interval = 1;
    else if (card.repetitions === 1) card.interval = 6;
    else card.interval = Math.round(card.interval * card.easeFactor);
    card.repetitions += 1;
  } else {
    card.repetitions = 0;
    card.interval    = 1;
  }

  card.easeFactor = Math.max(
    1.3,
    card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  const next = new Date();
  next.setDate(next.getDate() + card.interval);
  card.nextReviewDate = next.toISOString();

  saveSRSData(srsData);
  return card;
}

function getCardSRSStatus(cardId) {
  const srsData = loadSRSData();
  const card    = srsData[String(cardId)];
  if (!card) return "new";

  const now        = new Date();
  const reviewDate = new Date(card.nextReviewDate);

  if (reviewDate <= now) return "due";

  const hoursUntilDue = (reviewDate - now) / (1000 * 60 * 60);
  if (hoursUntilDue <= 24) return "soon";

  return "mastered";
}

function getSRSCounts(flashcards) {
  let due = 0, soon = 0, mastered = 0;
  if (!flashcards) return { due, soon, mastered };
  for (const card of flashcards) {
    const s = getCardSRSStatus(card.id);
    if (s === "due" || s === "new") due++;
    else if (s === "soon") soon++;
    else mastered++;
  }
  return { due, soon, mastered };
}

function initSRSButtons() {
  srsReviewDueBtn.addEventListener("click", () => {
    state.srsFilterDueOnly = true;
    renderFlashcards(state.studyMaterial?.flashcards);
  });

  srsShowAllBtn.addEventListener("click", () => {
    state.srsFilterDueOnly = false;
    renderFlashcards(state.studyMaterial?.flashcards);
  });
}

function updateSRSDashboard() {
  const flashcards = state.studyMaterial?.flashcards;
  if (!flashcards || flashcards.length === 0) {
    srsDashboard.classList.add("hidden");
    return;
  }

  const counts = getSRSCounts(flashcards);
  srsDueCount.textContent      = counts.due;
  srsSoonCount.textContent     = counts.soon;
  srsMasteredCount.textContent = counts.mastered;
  srsDashboard.classList.remove("hidden");

  srsReviewDueBtn.classList.toggle("active", state.srsFilterDueOnly);
  srsShowAllBtn.classList.toggle("active", !state.srsFilterDueOnly);
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function buildSRSBadge(cardId) {
  const status = getCardSRSStatus(cardId);
  const badges = {
    new:      '<span class="srs-badge srs-badge-due">New</span>',
    due:      '<span class="srs-badge srs-badge-due">Due</span>',
    soon:     '<span class="srs-badge srs-badge-soon">Soon</span>',
    mastered: '<span class="srs-badge srs-badge-mastered">Mastered</span>',
  };
  return badges[status] || "";
}

// ── Flashcards ───────────────────────────────────────────────────

function updateFlashcardProgress() {
  const { mastered, total } = state.flashcardStats;
  if (total === 0) { flashcardProgress.classList.add("hidden"); return; }
  flashcardProgress.classList.remove("hidden");
  flashcardProgress.textContent = `${mastered} / ${total} mastered`;
}

function renderFlashcards(flashcards) {
  flashcardsGrid.innerHTML = "";

  if (!flashcards || flashcards.length === 0) {
    flashcardsGrid.innerHTML = '<p class="empty-state col-span-full">No flashcards were generated.</p>';
    flashcardProgress.classList.add("hidden");
    srsDashboard.classList.add("hidden");
    return;
  }

  let cardsToRender = flashcards;
  if (state.srsFilterDueOnly) {
    cardsToRender = flashcards.filter((c) => {
      const s = getCardSRSStatus(c.id);
      return s === "due" || s === "new";
    });
    if (cardsToRender.length === 0) {
      flashcardsGrid.innerHTML = '<p class="empty-state col-span-full">No cards due right now. Great job!</p>';
    }
  }

  state.flashcardStats = { mastered: 0, total: flashcards.length };
  updateFlashcardProgress();
  updateSRSDashboard();

  for (const card of cardsToRender) {
    const el = document.createElement("div");
    const srsStatus = getCardSRSStatus(card.id);
    el.className = `flashcard ${srsStatus === "mastered" ? "mastered" : "needs-work"}`;
    el.dataset.cardId = String(card.id);
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", `Flashcard ${card.id}: click to flip`);

    if (srsStatus === "mastered") state.flashcardStats.mastered += 1;

    el.innerHTML = `
      <div class="flashcard-inner">
        <div class="flashcard-face flashcard-front">
          ${buildSRSBadge(card.id)}
          <div class="flashcard-md-content">${renderMarkdown(card.question)}</div>
        </div>
        <div class="flashcard-face flashcard-back">
          <div class="flashcard-answer">
            <div class="flashcard-md-content">${renderMarkdown(card.answer)}</div>
          </div>
          <div class="flashcard-actions">
            <button type="button" class="flashcard-btn flashcard-btn-got-it" data-action="got-it">Got it</button>
            <button type="button" class="flashcard-btn flashcard-btn-needs-work" data-action="needs-work">Needs Work</button>
          </div>
        </div>
      </div>
    `;

    // Render math inside each face after DOM injection
    renderMath(el.querySelector(".flashcard-front"));
    renderMath(el.querySelector(".flashcard-back"));

    el.addEventListener("click", (e) => {
      if (e.target.closest(".flashcard-btn")) return;
      el.classList.toggle("flipped");
    });

    el.addEventListener("keydown", (e) => {
      if (e.target.closest(".flashcard-btn")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.classList.toggle("flipped");
      }
    });

    el.querySelector('[data-action="got-it"]').addEventListener("click", (e) => {
      e.stopPropagation();
      recordSRSResponse(card.id, 5);
      markFlashcardMastered(el);
      updateSRSDashboard();
      // Gamification
      awardXP(XP_PER_GOT_IT);
      triggerSmallBurst(el);
      // Check if all cards mastered
      checkDeckCompletion();
    });

    el.querySelector('[data-action="needs-work"]').addEventListener("click", (e) => {
      e.stopPropagation();
      recordSRSResponse(card.id, 1);
      const wasMastered = el.classList.contains("mastered");
      el.classList.remove("mastered");
      el.classList.add("needs-work");
      if (wasMastered) {
        state.flashcardStats.mastered -= 1;
        updateFlashcardProgress();
      }
      const frontFace = el.querySelector(".flashcard-front");
      const existingBadge = frontFace.querySelector(".srs-badge");
      if (existingBadge) existingBadge.remove();
      frontFace.insertAdjacentHTML("afterbegin", buildSRSBadge(card.id));
      flashcardsGrid.prepend(el);
      updateSRSDashboard();
    });

    flashcardsGrid.appendChild(el);
  }

  updateFlashcardProgress();
}

function markFlashcardMastered(el) {
  if (el.classList.contains("mastered")) return;

  el.classList.add("mastered");
  el.classList.remove("needs-work");
  state.flashcardStats.mastered += 1;
  updateFlashcardProgress();

  const frontFace = el.querySelector(".flashcard-front");
  const existingBadge = frontFace.querySelector(".srs-badge");
  if (existingBadge) existingBadge.remove();
  frontFace.insertAdjacentHTML("afterbegin", buildSRSBadge(el.dataset.cardId));

  flashcardsGrid.appendChild(el);
}

function checkDeckCompletion() {
  const { mastered, total } = state.flashcardStats;
  if (total > 0 && mastered === total) {
    setTimeout(() => {
      triggerConfetti({ particleCount: 150, spread: 80 });
    }, 200);
  }
}

// ── CSV Export ───────────────────────────────────────────────────

function exportFlashcardsCSV() {
  const flashcards = state.studyMaterial?.flashcards;
  if (!flashcards || flashcards.length === 0) return;

  const rows = [["ID", "Question", "Answer"]];
  for (const card of flashcards) {
    rows.push([String(card.id), csvEscape(card.question), csvEscape(card.answer)]);
  }

  const csvContent = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "flashcards.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  if (typeof value !== "string") return value;
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ── Quiz ─────────────────────────────────────────────────────────

function updateQuizScoreDisplay(total) {
  quizScore.textContent = `Score: ${state.quizScore} / ${total}`;
  quizScoreBar.classList.remove("hidden");
  quizScore.classList.remove("score-updated");
  void quizScore.offsetWidth;
  quizScore.classList.add("score-updated");
}

function renderQuiz() {
  const quizzes = state.studyMaterial?.quizzes;

  if (!quizzes || quizzes.length === 0) {
    quizScoreBar.classList.add("hidden");
    quizContent.innerHTML = '<p class="empty-state">No quiz questions were generated.</p>';
    return;
  }

  if (state.quizIndex >= quizzes.length) {
    renderQuizResults(quizzes.length);
    return;
  }

  const quiz = quizzes[state.quizIndex];
  state.quizAnswered = false;

  updateQuizScoreDisplay(quizzes.length);

  quizContent.innerHTML = `
    <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
      Question ${state.quizIndex + 1} of ${quizzes.length}
    </p>
    <div class="mb-5 text-base font-semibold leading-relaxed text-slate-100 quiz-md-question">${renderMarkdown(quiz.question)}</div>
    <div id="quiz-options" class="space-y-2"></div>
    <p id="quiz-explanation" class="mt-4 hidden rounded-xl border border-white/[0.07] bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-400"></p>
    <button
      id="quiz-next-btn"
      type="button"
      class="mt-5 hidden inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-violet-600 hover:to-indigo-500 focus:outline-none"
    >
      ${state.quizIndex < quizzes.length - 1 ? "Next Question" : "See Results"}
    </button>
  `;

  renderMath(quizContent.querySelector(".quiz-md-question"));

  const optionsEl = document.getElementById("quiz-options");

  quiz.options.forEach((option, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option w-full rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5 text-left text-sm font-medium text-slate-300 backdrop-blur-sm hover:border-violet-500/50 hover:bg-violet-500/[0.07] focus:outline-none transition";
    btn.textContent = option;
    btn.addEventListener("click", () => handleQuizAnswer(index, quiz));
    optionsEl.appendChild(btn);
  });

  document.getElementById("quiz-next-btn").addEventListener("click", () => {
    state.quizIndex += 1;
    renderQuiz();
  });
}

function handleQuizAnswer(selectedIndex, quiz) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;

  const isCorrect = selectedIndex === quiz.correct_index;
  if (isCorrect) {
    state.quizScore += 1;
    awardXP(XP_PER_CORRECT);
  }

  const optionBtns = document.querySelectorAll(".quiz-option");
  optionBtns.forEach((btn, index) => {
    btn.disabled = true;
    if (index === quiz.correct_index) {
      btn.classList.add(isCorrect ? "correct" : "reveal-correct");
    } else if (index === selectedIndex && !isCorrect) {
      btn.classList.add("incorrect");
    }
  });

  const explanationEl = document.getElementById("quiz-explanation");
  explanationEl.textContent = quiz.explanation;
  explanationEl.classList.remove("hidden");

  const total = state.studyMaterial.quizzes.length;
  updateQuizScoreDisplay(total);

  document.getElementById("quiz-next-btn").classList.remove("hidden");
}

function renderQuizResults(total) {
  const pct = Math.round((state.quizScore / total) * 100);

  updateQuizScoreDisplay(total);
  quizScore.textContent = `Final Score: ${state.quizScore} / ${total}`;

  quizContent.innerHTML = `
    <div class="rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-6 py-8 text-center">
      <p class="text-5xl font-bold text-transparent bg-gradient-to-br from-violet-400 to-cyan-400 bg-clip-text">${state.quizScore} / ${total}</p>
      <p class="mt-2 text-lg font-semibold text-slate-200">${pct}% correct</p>
      <p class="mt-3 text-sm leading-relaxed text-slate-400">
        ${pct >= 80 ? "🏆 Outstanding! You've mastered this material." : pct >= 50 ? "👍 Solid effort. Review your flashcards to level up." : "📚 Keep going. Every rep builds the neural pathways."}
      </p>
      <button
        id="quiz-restart-btn"
        type="button"
        class="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-violet-600 hover:to-indigo-500 focus:outline-none"
      >
        Retake Quiz
      </button>
    </div>
  `;

  // Trigger confetti for high scores
  if (pct >= 80) {
    setTimeout(() => triggerConfetti({ particleCount: 200, spread: 100 }), 300);
  }

  document.getElementById("quiz-restart-btn").addEventListener("click", () => {
    state.quizIndex   = 0;
    state.quizScore   = 0;
    state.quizAnswered = false;
    renderQuiz();
  });
}

// ── Utilities ────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
