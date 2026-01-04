/* CSV Multiple-Choice Quiz (Client-side)
   - Import CSV
   - Group by optional "quiz" column
   - MCQ: one correct answer (correct_letter A-D or correct_index 0-based)
*/
const els = {
  csvFile: document.getElementById("csvFile"),
  dropzone: document.getElementById("dropzone"),
  fileName: document.getElementById("fileName"),
  csvText: document.getElementById("csvText"),
  importTextBtn: document.getElementById("importTextBtn"),
  clearTextBtn: document.getElementById("clearTextBtn"),
  demoBtn: document.getElementById("demoBtn"),
  quizSelect: document.getElementById("quizSelect"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  filterCount: document.getElementById("filterCount"),
  filterError: document.getElementById("filterError"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  importStatus: document.getElementById("importStatus"),
  shuffleQuestions: document.getElementById("shuffleQuestions"),
  shuffleAnswers: document.getElementById("shuffleAnswers"),
  autoNext: document.getElementById("autoNext"),
  quizMode: document.getElementById("quizMode"),
  themeSelect: document.getElementById("themeSelect"),
  resumeBanner: document.getElementById("resumeBanner"),
  resumeTitle: document.getElementById("resumeTitle"),
  resumeText: document.getElementById("resumeText"),
  resumeContinueBtn: document.getElementById("resumeContinueBtn"),
  resumeDiscardBtn: document.getElementById("resumeDiscardBtn"),
  importCard: document.getElementById("importCard"),
  quizCard: document.getElementById("quizCard"),
  resultCard: document.getElementById("resultCard"),
  quizTitle: document.getElementById("quizTitle"),
  quizMeta: document.getElementById("quizMeta"),
  timeText: document.getElementById("timeText"),
  scoreLabel: document.getElementById("scoreLabel"),
  scoreText: document.getElementById("scoreText"),
  progressBar: document.getElementById("progressBar"),
  qCounter: document.getElementById("qCounter"),
  questionText: document.getElementById("questionText"),
  flagBtn: document.getElementById("flagBtn"),
  hintBtn: document.getElementById("hintBtn"),
  hintText: document.getElementById("hintText"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishBtn: document.getElementById("finishBtn"),
  resultSummary: document.getElementById("resultSummary"),
  reviewSummary: document.getElementById("reviewSummary"),
  reviewList: document.getElementById("reviewList"),
  flaggedList: document.getElementById("flaggedList"),
  restartBtn: document.getElementById("restartBtn"),
  backToImportBtn: document.getElementById("backToImportBtn"),
  copyResultBtn: document.getElementById("copyResultBtn"),
  exportWrongBtn: document.getElementById("exportWrongBtn"),
};

let bank = {};
let currentQuizName = "";
let questions = [];
let idx = 0;
let answers = [];
let flaggedIds = new Set();
let activeSettings = null;
let currentSearchQuery = "";
let quizStartedAtMs = 0;
let timerIntervalId = null;
let autoNextTimeoutId = null;
let lastResult = null;
let themeMode = "system";
let quizMode = "practice";
let pendingSession = null;

const DEMO_CSV = `quiz;question;choice_A;choice_B;choice_C;choice_D;correct_letter;hint
Demo;Was ist 2 + 2?;3;4;5;;B;Grundrechenart
Demo;Welche Farbe hat der Himmel bei gutem Wetter?;Grün;Blau;Rot;;B;
Demo;Welche Taste bringt dich zur nächsten Frage?;ArrowLeft;Enter;Escape;;B;Tipp: Enter`;

function setStatus(msg, type = "info") {
  els.importStatus.textContent = msg;
  els.importStatus.classList.remove("ok", "error", "info");
  els.importStatus.classList.add(type);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateTimeText(nowMs = Date.now()) {
  if (!els.timeText) return;
  els.timeText.textContent = formatDuration(nowMs - quizStartedAtMs);
}

function startTimer(elapsedMs = 0) {
  quizStartedAtMs = Date.now() - Math.max(0, Number(elapsedMs) || 0);
  updateTimeText();
  if (timerIntervalId != null) window.clearInterval(timerIntervalId);
  timerIntervalId = window.setInterval(updateTimeText, 1000);
}

function stopTimer() {
  if (timerIntervalId != null) window.clearInterval(timerIntervalId);
  timerIntervalId = null;
}

function setProgress(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  els.progressBar.style.width = `${p}%`;
  const progressRoot = els.progressBar.parentElement;
  if (progressRoot && progressRoot.getAttribute("role") === "progressbar") {
    progressRoot.setAttribute("aria-valuenow", String(p));
  }
}

const PREFS_KEY = "csv-mcq-quiz:prefs:v1";
const SESSION_KEY = "csv-mcq-quiz:session:v1";
const SESSION_VERSION = 1;

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

function sanitizeSettings(s) {
  const quizMode = s && s.quizMode === "exam" ? "exam" : "practice";
  return {
    quizMode,
    shuffleQuestions: !!s?.shuffleQuestions,
    shuffleAnswers: !!s?.shuffleAnswers,
    autoNext: !!s?.autoNext,
  };
}

function isValidSession(session) {
  if (!session || typeof session !== "object") return false;
  if (session.version !== SESSION_VERSION) return false;
  if (typeof session.quizName !== "string" || session.quizName.trim().length === 0) return false;
  if (!Array.isArray(session.questions) || session.questions.length === 0) return false;
  if (!Array.isArray(session.answers) || session.answers.length !== session.questions.length) return false;
  if (!Number.isFinite(session.idx) || session.idx < 0 || session.idx >= session.questions.length) return false;
  if (!Number.isFinite(session.elapsedMs) || session.elapsedMs < 0) return false;
  for (const q of session.questions) {
    if (!q || typeof q !== "object") return false;
    if (typeof q.id !== "string" || q.id.trim().length === 0) return false;
    if (typeof q.question !== "string" || q.question.trim().length === 0) return false;
    if (!Array.isArray(q.choices) || q.choices.length < 2) return false;
    if (!Number.isFinite(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.choices.length) return false;
  }
  return true;
}

function buildSessionState() {
  if (!currentQuizName || questions.length === 0) return null;
  const elapsedMs = Date.now() - quizStartedAtMs;
  return {
    version: SESSION_VERSION,
    savedAtMs: Date.now(),
    quizName: currentQuizName,
    idx,
    startedAtMs: quizStartedAtMs,
    elapsedMs,
    settings: activeSettings || getSettingsSnapshot(),
    questionOrder: questions.map((q) => q.id),
    questions: questions.map((q) => ({
      id: q.id,
      quiz: q.quiz,
      question: q.question,
      hint: q.hint,
      choices: q.choices,
      correctIndex: q.correctIndex,
    })),
    answers: answers.map((a) => ({
      selectedDisplayIndex: a?.selectedDisplayIndex ?? null,
      shuffledMap: Array.isArray(a?.shuffledMap) ? a.shuffledMap : null,
    })),
    flaggedIds: Array.from(flaggedIds),
  };
}

function saveSession() {
  const session = buildSessionState();
  if (!session) return;
  writeSession(session);
}

function showResumeBanner(session) {
  if (!els.resumeBanner || !els.resumeText) return;
  const s = sanitizeSettings(session.settings);
  const modeLabel = s.quizMode === "exam" ? "Prüfung" : "Üben";
  els.resumeText.textContent = `${session.quizName} · Frage ${session.idx + 1}/${session.questions.length} · Zeit ${formatDuration(session.elapsedMs)} · ${modeLabel}`;
  els.resumeBanner.classList.remove("hidden");
}

function hideResumeBanner() {
  if (!els.resumeBanner) return;
  els.resumeBanner.classList.add("hidden");
}

function applySession(session) {
  if (!isValidSession(session)) return false;
  activeSettings = sanitizeSettings(session.settings);
  currentQuizName = session.quizName;
  questions = session.questions.map((q) => ({ ...q }));
  answers = session.answers.map((a) => ({
    selectedDisplayIndex: a?.selectedDisplayIndex ?? null,
    shuffledMap: Array.isArray(a?.shuffledMap) ? a.shuffledMap : null,
  }));
  flaggedIds = new Set(Array.isArray(session.flaggedIds) ? session.flaggedIds : []);
  idx = Math.max(0, Math.min(session.idx, Math.max(0, questions.length - 1)));

  bank = { [currentQuizName]: questions.slice() };
  populateQuizSelect([currentQuizName], bank);
  if (els.resetBtn) els.resetBtn.disabled = false;
  if (els.searchInput) els.searchInput.disabled = false;
  updateFilterUI();

  if (els.quizMode) els.quizMode.value = activeSettings.quizMode;
  if (els.shuffleQuestions) els.shuffleQuestions.checked = activeSettings.shuffleQuestions;
  if (els.shuffleAnswers) els.shuffleAnswers.checked = activeSettings.shuffleAnswers;
  if (els.autoNext) els.autoNext.checked = activeSettings.autoNext;

  clearAutoNext();
  startTimer(session.elapsedMs);
  showQuiz();
  renderQuestion();
  saveSession();
  return true;
}

function initSessionPrompt() {
  const session = readSession();
  if (!session) return;
  if (!isValidSession(session)) {
    clearSession();
    return;
  }
  pendingSession = session;
  showResumeBanner(session);
}

function getSystemTheme() {
  try {
    const mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");
    return mql && mql.matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(mode) {
  const effective = (mode === "system" || !mode) ? getSystemTheme() : mode;
  document.documentElement.dataset.theme = effective;
  const themeColor = effective === "light" ? "#f6f8fc" : "#0b0d10";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColor);
}

function savePrefs() {
  writePrefs({
    themeMode,
    quizMode,
    shuffleQuestions: !!els.shuffleQuestions?.checked,
    shuffleAnswers: !!els.shuffleAnswers?.checked,
    autoNext: !!els.autoNext?.checked,
  });
}

function initPrefs() {
  const prefs = readPrefs();
  if (typeof prefs.themeMode === "string") themeMode = prefs.themeMode;
  if (typeof prefs.quizMode === "string") quizMode = prefs.quizMode;
  if (typeof prefs.shuffleQuestions === "boolean" && els.shuffleQuestions) els.shuffleQuestions.checked = prefs.shuffleQuestions;
  if (typeof prefs.shuffleAnswers === "boolean" && els.shuffleAnswers) els.shuffleAnswers.checked = prefs.shuffleAnswers;
  if (typeof prefs.autoNext === "boolean" && els.autoNext) els.autoNext.checked = prefs.autoNext;
  if (els.themeSelect) els.themeSelect.value = themeMode;
  if (els.quizMode) els.quizMode.value = quizMode;

  applyTheme(themeMode);

  if (els.themeSelect) {
    els.themeSelect.addEventListener("change", () => {
      themeMode = els.themeSelect.value;
      applyTheme(themeMode);
      savePrefs();
    });
  }
  [els.shuffleQuestions, els.shuffleAnswers, els.autoNext].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", savePrefs);
  });
  if (els.quizMode) {
    els.quizMode.addEventListener("change", () => {
      quizMode = els.quizMode.value;
      savePrefs();
    });
  }

  const mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (themeMode !== "system") return;
    applyTheme(themeMode);
  };
  if (mql) {
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
    else if (typeof mql.addListener === "function") mql.addListener(onChange);
  }
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function stripBOM(s) {
  if (!s) return s;
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function countDelimiterOutsideQuotes(line, delim) {
  let inQuotes = false, count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delim) count++;
  }
  return count;
}

function detectDelimiter(firstLine) {
  const candidates = [";", ",", "\t"];
  const counts = candidates.map(d => countDelimiterOutsideQuotes(firstLine, d));
  let best = 0;
  for (let i = 1; i < candidates.length; i++) if (counts[i] > counts[best]) best = i;
  return candidates[best];
}

function parseCSV(text) {
  const raw = stripBOM(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = raw.split("\n").find(l => l.trim().length > 0) || "";
  const delim = detectDelimiter(firstLine);

  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i], next = raw[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim) { row.push(field); field = ""; continue; }
    if (!inQuotes && ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  row.push(field); rows.push(row);
  return { rows: rows.filter(r => r.some(c => String(c).trim() !== "")), delimiter: delim };
}

function toIntOrNull(x) {
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : null;
}
function letterToIndex(letter) {
  const map = { A:0, B:1, C:2, D:3 };
  const L = String(letter || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(map, L) ? map[L] : null;
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
}

function fnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function makeQuestionId({ quiz, question, choices, correctIndex }) {
  const payload = [
    String(quiz || ""),
    String(question || ""),
    ...Array.isArray(choices) ? choices.map(String) : [],
    String(correctIndex ?? ""),
  ].join("\u001f");
  return `q_${fnv1a32(payload)}`;
}

function buildQuestionBank(csvText) {
  const { rows, delimiter } = parseCSV(csvText);
  if (rows.length < 2) throw new Error("CSV enthält zu wenige Zeilen (Header + mind. 1 Frage benötigt).");

  const header = rows[0].map(normalizeHeader);
  const dataRows = rows.slice(1);

  const get = (obj, ...keys) => {
    for (const k of keys) if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
    return "";
  };

  const bankLocal = {};

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const obj = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = row[c] ?? "";

    const quizName = String(get(obj, "quiz", "quiz_name", "set", "set_name") || "Standard").trim() || "Standard";
    const question = String(get(obj, "question", "frage", "prompt", "q")).trim();

    const a = String(get(obj, "choice_a", "a", "antwort_a")).trim();
    const b = String(get(obj, "choice_b", "b", "antwort_b")).trim();
    const c = String(get(obj, "choice_c", "c", "antwort_c")).trim();
    const d = String(get(obj, "choice_d", "d", "antwort_d")).trim();

    const hint = String(get(obj, "hint", "hinweis", "clue", "tip")).trim();

    let correctIndex = null;

    const ciRaw = get(obj, "correct_index", "korrekt_index");
    if (String(ciRaw).trim() !== "") {
      const n = toIntOrNull(ciRaw);
      if (n !== null) correctIndex = n;
    }
    if (correctIndex === null) {
      const cl = get(obj, "correct_letter", "korrekt_buchstabe");
      const li = letterToIndex(cl);
      if (li !== null) correctIndex = li;
    }
    if (correctIndex === null) {
      const ct = String(get(obj, "correct_text", "korrekt_text")).trim();
      if (ct) {
        const choices = [a,b,c,d];
        const found = choices.findIndex(x => String(x).trim() === ct);
        if (found >= 0) correctIndex = found;
      }
    }

    const rawChoices = [a,b,c,d];
    const presentChoices = rawChoices.map((t,i)=>({t,i})).filter(x=>x.t.trim() !== "");

    if (!question) continue;
    if (presentChoices.length < 2) throw new Error(`Zeile ${r+2}: Frage hat weniger als 2 Antwortoptionen.`);
    if (correctIndex === null) throw new Error(`Zeile ${r+2}: Keine korrekte Antwort gefunden (correct_index oder correct_letter oder correct_text).`);

    const mappedCorrectPos = presentChoices.findIndex(x => x.i === correctIndex);
    if (mappedCorrectPos < 0) throw new Error(`Zeile ${r+2}: Korrekte Antwort zeigt auf eine leere/nicht vorhandene Option.`);

    const q = {
      quiz: quizName,
      question,
      hint,
      choices: presentChoices.map(x=>x.t),
      correctIndex: mappedCorrectPos,
    };
    q.id = makeQuestionId(q);
    if (!bankLocal[quizName]) bankLocal[quizName] = [];
    bankLocal[quizName].push(q);
  }

  const quizNames = Object.keys(bankLocal);
  if (quizNames.length === 0) throw new Error("Keine gültigen Fragen gefunden. Prüfe Header und Spalten.");
  quizNames.sort((x,y)=>x.localeCompare(y,"de"));
  return { bank: bankLocal, quizNames, delimiter };
}

function clearAutoNext() {
  if (autoNextTimeoutId != null) window.clearTimeout(autoNextTimeoutId);
  autoNextTimeoutId = null;
}

function showImport(){
  stopTimer();
  clearAutoNext();
  els.importCard.classList.remove("hidden");
  els.quizCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
}
function showQuiz(){
  els.importCard.classList.add("hidden");
  els.quizCard.classList.remove("hidden");
  els.resultCard.classList.add("hidden");
}
function showResults(){
  stopTimer();
  clearAutoNext();
  els.importCard.classList.add("hidden");
  els.quizCard.classList.add("hidden");
  els.resultCard.classList.remove("hidden");
}

function resetAll() {
  bank = {}; currentQuizName = ""; questions = []; answers = []; idx = 0;
  flaggedIds = new Set();
  activeSettings = null;
  currentSearchQuery = "";
  lastResult = null;
  stopTimer();
  clearAutoNext();
  if (els.copyResultBtn) els.copyResultBtn.disabled = true;
  if (els.exportWrongBtn) els.exportWrongBtn.disabled = true;
  els.quizSelect.innerHTML = `<option value="">(erst CSV importieren)</option>`;
  els.quizSelect.disabled = true;
  if (els.searchInput) { els.searchInput.value = ""; els.searchInput.disabled = true; }
  if (els.clearSearchBtn) els.clearSearchBtn.disabled = true;
  if (els.filterCount) els.filterCount.textContent = "0 Fragen";
  if (els.filterError) { els.filterError.textContent = ""; els.filterError.classList.add("hidden"); }
  els.startBtn.disabled = true;
  els.resetBtn.disabled = true;
  els.csvFile.value = "";
  if (els.csvText) els.csvText.value = "";
  if (els.fileName) els.fileName.textContent = "Keine Datei ausgewählt";
  if (els.timeText) els.timeText.textContent = "0:00";
  if (els.reviewSummary) els.reviewSummary.textContent = "Review";
  if (els.reviewList) els.reviewList.innerHTML = "";
  if (els.flaggedList) els.flaggedList.innerHTML = "";
  setStatus("Bereit. Bitte CSV auswählen.", "info");
  showImport();
}

function getSettingsSnapshot() {
  const modeRaw = String(els.quizMode?.value || quizMode || "practice");
  const mode = modeRaw === "exam" ? "exam" : "practice";
  return {
    quizMode: mode,
    shuffleQuestions: !!els.shuffleQuestions?.checked,
    shuffleAnswers: !!els.shuffleAnswers?.checked,
    autoNext: !!els.autoNext?.checked,
  };
}

function getRunSettings() {
  return activeSettings || getSettingsSnapshot();
}

function isExamMode() {
  return getRunSettings().quizMode === "exam";
}

function ensureAnswer(index) {
  if (!answers[index]) answers[index] = { selectedDisplayIndex: null, shuffledMap: null };
  return answers[index];
}

function identityMap(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = i;
  return arr;
}

function getChoiceMap(index, createIfMissing = true) {
  const q = questions[index];
  const a = ensureAnswer(index);
  const shuffle = !!getRunSettings().shuffleAnswers;

  if (!shuffle) {
    a.shuffledMap = null;
    return identityMap(q.choices.length);
  }

  if (Array.isArray(a.shuffledMap) && a.shuffledMap.length === q.choices.length) return a.shuffledMap;
  if (!createIfMissing) return identityMap(q.choices.length);

  const indices = identityMap(q.choices.length);
  shuffleArray(indices);
  a.shuffledMap = indices;
  return indices;
}

function evaluateAnswer(q, a) {
  const map = Array.isArray(a?.shuffledMap) ? a.shuffledMap : identityMap(q.choices.length);
  const selectedDisplayIndex = a?.selectedDisplayIndex ?? null;
  const selectedOriginalIndex = selectedDisplayIndex == null ? null : (map[selectedDisplayIndex] ?? null);
  const correctOriginalIndex = q.correctIndex;
  const correctDisplayIndex = map.findIndex((x) => x === correctOriginalIndex);
  const isCorrect = selectedOriginalIndex != null && selectedOriginalIndex === correctOriginalIndex;
  const selectedText = selectedOriginalIndex == null ? "(keine Antwort)" : q.choices[selectedOriginalIndex];
  const correctText = q.choices[correctOriginalIndex];
  return {
    map,
    selectedDisplayIndex,
    selectedOriginalIndex,
    correctDisplayIndex,
    isCorrect,
    selectedText,
    correctText,
  };
}

function computeCounts() {
  let answered = 0;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = answers[i];
    if (!q || !a || a.selectedDisplayIndex == null) continue;
    answered++;
    if (evaluateAnswer(q, a).isCorrect) correct++;
  }
  return { answered, correct, total: questions.length };
}

function updateScoreDisplay() {
  const { answered, correct, total } = computeCounts();
  const exam = isExamMode();
  if (els.scoreLabel) els.scoreLabel.textContent = exam ? "Beantwortet" : "Score";
  if (els.scoreText) els.scoreText.textContent = exam ? `${answered} / ${total}` : `${correct} / ${total}`;
  return { answered, correct, total };
}

function updateFlagButton() {
  if (!els.flagBtn) return;
  const q = questions[idx];
  const isOn = !!(q && q.id && flaggedIds.has(q.id));
  els.flagBtn.setAttribute("aria-pressed", String(isOn));
  els.flagBtn.classList.toggle("toggled", isOn);
  els.flagBtn.textContent = isOn ? "Markiert" : "Markieren";
}

function toggleFlag() {
  const q = questions[idx];
  if (!q || !q.id) return;
  if (flaggedIds.has(q.id)) flaggedIds.delete(q.id);
  else flaggedIds.add(q.id);
  updateFlagButton();
  saveSession();
}

function renderQuestion() {
  const q = questions[idx];
  const a = answers[idx];
  const total = questions.length;
  const exam = isExamMode();
  const hasAnswer = !!(a && a.selectedDisplayIndex != null);

  els.quizTitle.textContent = currentQuizName;
  els.quizMeta.textContent = `${total} Fragen · ${exam ? "Prüfung" : "Üben"}`;
  els.qCounter.textContent = `Frage ${idx+1} / ${total}`;
  els.questionText.textContent = q.question;
  updateFlagButton();

  const hasHint = !!(q.hint && q.hint.trim());
  els.hintBtn.disabled = !hasHint;
  els.hintBtn.textContent = hasHint ? "Hinweis anzeigen" : "Hinweis";
  els.hintBtn.setAttribute("aria-expanded", "false");
  els.hintText.textContent = hasHint ? q.hint : "";
  els.hintText.classList.toggle("hidden", true);

  setProgress(total ? ((hasAnswer ? (idx + 1) : idx) / total) * 100 : 0);
  updateScoreDisplay();

  els.prevBtn.disabled = idx === 0;
  els.nextBtn.disabled = !hasAnswer;
  els.nextBtn.textContent = (idx === total - 1) ? "Ergebnis" : "Weiter";
  if (!hasAnswer) {
    els.feedback.textContent = "";
  } else if (exam) {
    els.feedback.textContent = "Antwort gewählt.";
  } else {
    const evalA = evaluateAnswer(q, a);
    els.feedback.textContent = evalA.isCorrect ? "Richtig." : `Falsch. Richtig: ${evalA.correctText}`;
  }
  els.choices.innerHTML = "";

  const map = getChoiceMap(idx);
  const correctDisplayIndex = map.findIndex((x) => x === q.correctIndex);

  map.forEach((originalIndex, displayIndex) => {
    const keyLabel = String.fromCharCode(65 + displayIndex);
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.dataset.displayIndex = String(displayIndex);

    const keyEl = document.createElement("span");
    keyEl.className = "choice-key";
    keyEl.textContent = keyLabel;
    const textEl = document.createElement("span");
    textEl.className = "choice-text";
    textEl.textContent = q.choices[originalIndex];
    btn.appendChild(keyEl);
    btn.appendChild(textEl);

    const isSelected = hasAnswer && displayIndex === a.selectedDisplayIndex;
    if (exam) {
      if (isSelected) btn.classList.add("selected");
      btn.addEventListener("click", () => selectAnswer(displayIndex));
    } else if (hasAnswer) {
      if (displayIndex === correctDisplayIndex) btn.classList.add("correct");
      if (isSelected && displayIndex !== correctDisplayIndex) btn.classList.add("wrong");
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => selectAnswer(displayIndex));
    }
    els.choices.appendChild(btn);
  });

  const raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb) => window.setTimeout(cb, 0);
  raf(() => {
    if (els.quizCard.classList.contains("hidden")) return;
    if (exam && hasAnswer) {
      const sel = els.choices.querySelector(`.choice[data-display-index="${a.selectedDisplayIndex}"]`);
      if (sel) sel.focus();
      return;
    }
    if (!hasAnswer) {
      const first = els.choices.querySelector(".choice:not(:disabled)");
      if (first) first.focus();
      return;
    }
    if (!els.nextBtn.disabled) els.nextBtn.focus();
  });
}

function selectAnswer(selectedDisplayIndex) {
  clearAutoNext();
  const q = questions[idx];
  const a = ensureAnswer(idx);
  const exam = isExamMode();
  if (!exam && a.selectedDisplayIndex != null) return;

  getChoiceMap(idx);
  a.selectedDisplayIndex = selectedDisplayIndex;

  const evalA = evaluateAnswer(q, a);

  els.choices.querySelectorAll(".choice").forEach((btn) => {
    const di = Number(btn.dataset.displayIndex);
    btn.classList.remove("selected", "correct", "wrong");
    if (exam) {
      btn.classList.toggle("selected", di === selectedDisplayIndex);
    } else {
      btn.disabled = true;
      if (di === evalA.correctDisplayIndex) btn.classList.add("correct");
      if (di === selectedDisplayIndex && di !== evalA.correctDisplayIndex) btn.classList.add("wrong");
    }
  });

  if (exam) els.feedback.textContent = "Antwort gewählt.";
  else els.feedback.textContent = evalA.isCorrect ? "Richtig." : `Falsch. Richtig: ${evalA.correctText}`;
  els.nextBtn.disabled = false;
  els.nextBtn.textContent = (idx === questions.length - 1) ? "Ergebnis" : "Weiter";
  updateScoreDisplay();
  setProgress(questions.length ? ((idx + 1) / questions.length) * 100 : 0);
  saveSession();

  if (getRunSettings().autoNext) {
    const thisIdx = idx;
    autoNextTimeoutId = window.setTimeout(() => {
      if (els.quizCard.classList.contains("hidden")) return;
      if (idx !== thisIdx) return;
      if (els.nextBtn.disabled) return;
      goNext();
    }, 450);
  } else {
    els.nextBtn.focus();
  }
}

function startQuiz() {
  const snapshot = getSettingsSnapshot();
  const { quizName, filtered } = updateFilterUI();
  if (!quizName) return;
  if (!filtered || filtered.length === 0) {
    setFilterError("Keine Fragen zum Starten. Bitte Suche anpassen.");
    return;
  }

  clearSession();
  pendingSession = null;
  hideResumeBanner();
  activeSettings = snapshot;
  currentQuizName = quizName;
  questions = filtered.slice();
  if (snapshot.shuffleQuestions) shuffleArray(questions);

  idx = 0;
  answers = questions.map(() => ({ selectedDisplayIndex: null, shuffledMap: null }));
  flaggedIds = new Set();
  lastResult = null;
  if (els.copyResultBtn) els.copyResultBtn.disabled = true;
  if (els.exportWrongBtn) els.exportWrongBtn.disabled = true;

  clearAutoNext();
  startTimer();
  showQuiz();
  renderQuestion();
  saveSession();
}

function finishQuiz() {
  clearAutoNext();
  stopTimer();
  clearSession();
  pendingSession = null;

  const total = questions.length;
  const evals = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = answers[i] || { selectedDisplayIndex: null, shuffledMap: null };
    const e = evaluateAnswer(q, a);
    evals.push({ i, q, ...e });
  }

  const answeredCount = evals.filter(e => e.selectedDisplayIndex != null).length;
  const correctCount = evals.filter(e => e.isCorrect).length;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;
  const durationMs = Date.now() - quizStartedAtMs;
  const durationText = formatDuration(durationMs);
  const answeredPart = (answeredCount < total) ? ` Beantwortet: ${answeredCount}/${total}.` : "";
  els.resultSummary.textContent = `Du hast ${correctCount} von ${total} richtig (${pct}%). Zeit: ${durationText}.${answeredPart}`;

  els.reviewList.innerHTML = "";
  const wrong = evals
    .filter((e) => !e.isCorrect)
    .map((e) => ({ i: e.i, q: e.q, selectedText: e.selectedText, correctText: e.correctText }));

  lastResult = {
    quizName: currentQuizName,
    score: correctCount,
    total,
    pct,
    answeredCount,
    durationMs,
    durationText,
    wrong,
    quizMode: getRunSettings().quizMode,
  };
  if (els.copyResultBtn) els.copyResultBtn.disabled = false;
  if (els.exportWrongBtn) els.exportWrongBtn.disabled = wrong.length === 0;

  const exam = getRunSettings().quizMode === "exam";
  if (els.reviewSummary) els.reviewSummary.textContent = exam ? "Review (alle Fragen)" : "Review (falsche Antworten)";

  const reviewItems = exam ? evals : evals.filter((e) => !e.isCorrect);
  if (reviewItems.length === 0) {
    els.reviewList.innerHTML = `<p class="muted">Keine falschen Antworten. Sehr gut.</p>`;
  } else {
    reviewItems.forEach((e) => {
      const div = document.createElement("div");
      div.className = "review-item";
      div.innerHTML = `
        <strong>Frage ${e.i + 1}: ${escapeHTML(e.q.question)}</strong>
        ${exam ? `<div class="line">${e.isCorrect ? "Richtig" : "Falsch"}</div>` : ""}
        <div class="line">Deine Antwort: ${escapeHTML(e.selectedText)}</div>
        <div class="line">Richtig: ${escapeHTML(e.correctText)}</div>
        ${e.q.hint ? `<div class="line">Hinweis: ${escapeHTML(e.q.hint)}</div>` : ""}
      `;
      els.reviewList.appendChild(div);
    });
  }

  if (els.flaggedList) {
    els.flaggedList.innerHTML = "";
    const flagged = evals.filter((e) => e.q && e.q.id && flaggedIds.has(e.q.id));
    if (flagged.length === 0) {
      els.flaggedList.innerHTML = `<p class="muted">Keine markierten Fragen.</p>`;
    } else {
      flagged.forEach((e) => {
        const div = document.createElement("div");
        div.className = "review-item";
        div.innerHTML = `
          <strong>Frage ${e.i + 1}: ${escapeHTML(e.q.question)}</strong>
          <div class="line">Deine Antwort: ${escapeHTML(e.selectedText)}</div>
          <div class="line">Richtig: ${escapeHTML(e.correctText)}</div>
          ${e.q.hint ? `<div class="line">Hinweis: ${escapeHTML(e.q.hint)}</div>` : ""}
        `;
        els.flaggedList.appendChild(div);
      });
    }
  }
  showResults();
}

function toggleHint() {
  if (els.hintBtn.disabled) return;
  const willOpen = els.hintText.classList.contains("hidden");
  els.hintText.classList.toggle("hidden", !willOpen);
  els.hintBtn.setAttribute("aria-expanded", String(willOpen));
  els.hintBtn.textContent = willOpen ? "Hinweis ausblenden" : "Hinweis anzeigen";
}

function requestFinish() {
  const total = questions.length;
  const answeredCount = answers.filter(a => a && a.selectedDisplayIndex != null).length;
  const msg = answeredCount < total
    ? `Quiz jetzt beenden und Ergebnis anzeigen?\nBeantwortet: ${answeredCount}/${total}`
    : "Quiz beenden und Ergebnis anzeigen?";
  if (!window.confirm(msg)) return;
  finishQuiz();
}

function buildResultText(res) {
  if (!res) return "";
  const parts = [
    `${res.quizName}: ${res.score}/${res.total} (${res.pct}%)`,
    `Zeit: ${res.durationText || formatDuration(res.durationMs || 0)}`
  ];
  if (res.answeredCount != null && res.answeredCount < res.total) {
    parts.push(`Beantwortet: ${res.answeredCount}/${res.total}`);
  }
  if (Array.isArray(res.wrong)) parts.push(`Falsch: ${res.wrong.length}`);
  return parts.join(" · ");
}

function flashButtonText(btn, text, ms = 1200) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = text;
  window.setTimeout(() => {
    btn.textContent = prev;
  }, ms);
}

async function copyToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function csvEscape(value) {
  const s = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${s.replace(/"/g, '""')}"`;
}

function safeFileName(name) {
  return String(name || "quiz")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "quiz";
}

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function goNext(){
  clearAutoNext();
  if (idx < questions.length - 1) { idx++; saveSession(); renderQuestion(); }
  else finishQuiz();
}
function goPrev(){
  clearAutoNext();
  if (idx > 0) { idx--; saveSession(); renderQuestion(); }
}

function setFileName(name) {
  if (!els.fileName) return;
  els.fileName.textContent = name ? name : "Keine Datei ausgewählt";
}

function populateQuizSelect(quizNames, bankRef) {
  els.quizSelect.innerHTML = "";
  quizNames.forEach((name) => {
    const count = (bankRef[name] || []).length;
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (${count})`;
    els.quizSelect.appendChild(opt);
  });
  els.quizSelect.disabled = false;
}

function normalizeForSearch(s) {
  return String(s || "").toLowerCase();
}

function filterQuestions(list, query) {
  const q = normalizeForSearch(query).trim();
  if (!q) return list.slice();
  return list.filter((item) => {
    const hay = normalizeForSearch(item.question) + "\n" + normalizeForSearch((item.choices || []).join("\n"));
    return hay.includes(q);
  });
}

function getSelectedQuizName() {
  const v = String(els.quizSelect?.value || "").trim();
  if (v) return v;
  const first = Object.keys(bank)[0];
  return String(first || "").trim();
}

function setFilterError(msg) {
  if (!els.filterError) return;
  const m = String(msg || "").trim();
  els.filterError.textContent = m;
  els.filterError.classList.toggle("hidden", m.length === 0);
}

function updateFilterUI() {
  const quizName = getSelectedQuizName();
  const base = (quizName && bank[quizName]) ? bank[quizName] : [];

  const query = String(els.searchInput?.value || "").trim();
  currentSearchQuery = query;
  const filtered = filterQuestions(base, query);

  if (els.filterCount) {
    els.filterCount.textContent = query ? `${filtered.length} von ${base.length} Fragen` : `${base.length} Fragen`;
  }
  if (els.clearSearchBtn) els.clearSearchBtn.disabled = !query || !!els.searchInput?.disabled;

  if (base.length > 0 && filtered.length === 0) {
    setFilterError("Keine Fragen für diese Suche gefunden.");
    els.startBtn.disabled = true;
  } else {
    setFilterError("");
    els.startBtn.disabled = els.quizSelect.disabled || base.length === 0;
  }

  return { quizName, base, filtered, query };
}

function importBuilt(built, sourceLabel = "") {
  bank = built.bank;
  populateQuizSelect(built.quizNames, bank);

  els.resetBtn.disabled = false;
  if (els.searchInput) els.searchInput.disabled = false;
  if (els.searchInput) els.searchInput.value = "";
  updateFilterUI();

  const totalQuestions = Object.values(bank).reduce((acc, arr) => acc + arr.length, 0);
  const sourcePart = sourceLabel ? ` (${sourceLabel})` : "";
  setStatus(
    `Import erfolgreich${sourcePart}: ${built.quizNames.length} Set(s), ${totalQuestions} Frage(n). Trennzeichen: "${built.delimiter === "\t" ? "\\t" : built.delimiter}".`,
    "ok"
  );
}

async function importFromFile(file) {
  if (!file) return;
  try {
    setStatus(`Lese Datei: ${file.name} ...`, "info");
    const text = await file.text();
    const built = buildQuestionBank(text);
    importBuilt(built, file.name);
  } catch (err) {
    console.error(err);
    setStatus(`Import fehlgeschlagen: ${err.message}`, "error");
    els.quizSelect.disabled = true;
    els.startBtn.disabled = true;
  }
}

function importFromText(csvText, sourceLabel = "Text") {
  try {
    const built = buildQuestionBank(csvText);
    importBuilt(built, sourceLabel);
  } catch (err) {
    console.error(err);
    setStatus(`Import fehlgeschlagen: ${err.message}`, "error");
    els.quizSelect.disabled = true;
    els.startBtn.disabled = true;
  }
}

els.csvFile.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  setFileName(file.name);
  await importFromFile(file);
});

if (els.dropzone) {
  els.dropzone.addEventListener("click", () => els.csvFile?.click());
  const setDrag = (on) => els.dropzone.classList.toggle("dragover", on);
  ["dragenter", "dragover"].forEach((t) => els.dropzone.addEventListener(t, (ev) => {
    ev.preventDefault();
    setDrag(true);
  }));
  ["dragleave", "dragend"].forEach((t) => els.dropzone.addEventListener(t, () => setDrag(false)));
  els.dropzone.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    setDrag(false);
    const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (!file) return;
    setFileName(file.name);
    await importFromFile(file);
  });
}

if (els.importTextBtn) {
  els.importTextBtn.addEventListener("click", () => {
    const txt = String(els.csvText?.value || "");
    if (txt.trim().length === 0) {
      setStatus("Kein CSV-Text vorhanden.", "error");
      return;
    }
    setFileName("");
    importFromText(txt, "Text");
  });
}
if (els.clearTextBtn) {
  els.clearTextBtn.addEventListener("click", () => {
    if (!els.csvText) return;
    els.csvText.value = "";
    els.csvText.focus();
  });
}
if (els.demoBtn) {
  els.demoBtn.addEventListener("click", () => {
    setFileName("");
    importFromText(DEMO_CSV, "Demo");
  });
}

if (els.quizSelect) els.quizSelect.addEventListener("change", updateFilterUI);
if (els.searchInput) els.searchInput.addEventListener("input", updateFilterUI);
if (els.clearSearchBtn) {
  els.clearSearchBtn.addEventListener("click", () => {
    if (!els.searchInput) return;
    els.searchInput.value = "";
    updateFilterUI();
    els.searchInput.focus();
  });
}

els.startBtn.addEventListener("click", startQuiz);
els.resetBtn.addEventListener("click", () => {
  clearSession();
  pendingSession = null;
  hideResumeBanner();
  resetAll();
});
if (els.flagBtn) els.flagBtn.addEventListener("click", toggleFlag);
els.hintBtn.addEventListener("click", toggleHint);
els.nextBtn.addEventListener("click", goNext);
els.prevBtn.addEventListener("click", goPrev);
els.finishBtn.addEventListener("click", requestFinish);
els.restartBtn.addEventListener("click", () => startQuiz());
els.backToImportBtn.addEventListener("click", () => showImport());

if (els.resumeContinueBtn) {
  els.resumeContinueBtn.addEventListener("click", () => {
    if (!pendingSession) return;
    hideResumeBanner();
    const ok = applySession(pendingSession);
    pendingSession = null;
    if (!ok) {
      clearSession();
      resetAll();
    }
  });
}
if (els.resumeDiscardBtn) {
  els.resumeDiscardBtn.addEventListener("click", () => {
    clearSession();
    pendingSession = null;
    hideResumeBanner();
    resetAll();
  });
}

if (els.copyResultBtn) {
  els.copyResultBtn.addEventListener("click", async () => {
    const txt = buildResultText(lastResult);
    const ok = await copyToClipboard(txt);
    flashButtonText(els.copyResultBtn, ok ? "Kopiert" : "Kopieren fehlgeschlagen");
  });
}

if (els.exportWrongBtn) {
  els.exportWrongBtn.addEventListener("click", () => {
    if (!lastResult || !Array.isArray(lastResult.wrong) || lastResult.wrong.length === 0) {
      flashButtonText(els.exportWrongBtn, "Nichts zu exportieren");
      return;
    }
    const header = ["quiz", "question_no", "question", "your_answer", "correct_answer", "hint"];
    const lines = [header.join(";")];
    lastResult.wrong.forEach((w) => {
      lines.push([
        csvEscape(lastResult.quizName),
        csvEscape(w.i + 1),
        csvEscape(w.q.question),
        csvEscape(w.selectedText),
        csvEscape(w.correctText),
        csvEscape(w.q.hint || ""),
      ].join(";"));
    });
    const csv = `\ufeff${lines.join("\n")}`;
    const date = new Date().toISOString().slice(0, 10);
    const filename = `wrong-${safeFileName(lastResult.quizName)}-${date}.csv`;
    downloadText(filename, csv, "text/csv;charset=utf-8");
    flashButtonText(els.exportWrongBtn, "Download…");
  });
}

document.addEventListener("keydown", (ev) => {
  if (els.quizCard.classList.contains("hidden")) return;
  const tag = (ev.target && ev.target.tagName ? ev.target.tagName : "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  const k = String(ev.key || "");
  const kl = k.toLowerCase();

  if ((k === "ArrowRight" || k === "Enter") && !els.nextBtn.disabled) {
    ev.preventDefault();
    goNext();
    return;
  }
  if (k === "ArrowLeft") {
    ev.preventDefault();
    goPrev();
    return;
  }
  if (k === "Backspace") {
    ev.preventDefault();
    goPrev();
    return;
  }
  if (k === "Escape") {
    ev.preventDefault();
    requestFinish();
    return;
  }
  if (kl === "h" && !els.hintBtn.disabled) {
    ev.preventDefault();
    toggleHint();
    return;
  }

  const mapKeyToIndex = { "1":0, "2":1, "3":2, "4":3, "a":0, "b":1, "c":2, "d":3 };
  const di = Object.prototype.hasOwnProperty.call(mapKeyToIndex, kl) ? mapKeyToIndex[kl] : null;
  if (di == null) return;
  const btn = els.choices.querySelector(`.choice[data-display-index="${di}"]`);
  if (!btn || btn.disabled) return;
  ev.preventDefault();
  btn.click();
});

initPrefs();
resetAll();
initSessionPrompt();
