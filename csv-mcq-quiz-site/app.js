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
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  importStatus: document.getElementById("importStatus"),
  shuffleQuestions: document.getElementById("shuffleQuestions"),
  shuffleAnswers: document.getElementById("shuffleAnswers"),
  autoNext: document.getElementById("autoNext"),
  themeSelect: document.getElementById("themeSelect"),
  importCard: document.getElementById("importCard"),
  quizCard: document.getElementById("quizCard"),
  resultCard: document.getElementById("resultCard"),
  quizTitle: document.getElementById("quizTitle"),
  quizMeta: document.getElementById("quizMeta"),
  timeText: document.getElementById("timeText"),
  scoreText: document.getElementById("scoreText"),
  progressBar: document.getElementById("progressBar"),
  qCounter: document.getElementById("qCounter"),
  questionText: document.getElementById("questionText"),
  hintBtn: document.getElementById("hintBtn"),
  hintText: document.getElementById("hintText"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  finishBtn: document.getElementById("finishBtn"),
  resultSummary: document.getElementById("resultSummary"),
  reviewList: document.getElementById("reviewList"),
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
let score = 0;
let quizStartedAtMs = 0;
let timerIntervalId = null;
let autoNextTimeoutId = null;
let lastResult = null;
let themeMode = "system";

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

function startTimer() {
  quizStartedAtMs = Date.now();
  updateTimeText(quizStartedAtMs);
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
    shuffleQuestions: !!els.shuffleQuestions?.checked,
    shuffleAnswers: !!els.shuffleAnswers?.checked,
    autoNext: !!els.autoNext?.checked,
  });
}

function initPrefs() {
  const prefs = readPrefs();
  if (typeof prefs.themeMode === "string") themeMode = prefs.themeMode;
  if (typeof prefs.shuffleQuestions === "boolean" && els.shuffleQuestions) els.shuffleQuestions.checked = prefs.shuffleQuestions;
  if (typeof prefs.shuffleAnswers === "boolean" && els.shuffleAnswers) els.shuffleAnswers.checked = prefs.shuffleAnswers;
  if (typeof prefs.autoNext === "boolean" && els.autoNext) els.autoNext.checked = prefs.autoNext;
  if (els.themeSelect) els.themeSelect.value = themeMode;

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
  bank = {}; currentQuizName = ""; questions = []; answers = []; idx = 0; score = 0;
  lastResult = null;
  stopTimer();
  clearAutoNext();
  if (els.copyResultBtn) els.copyResultBtn.disabled = true;
  if (els.exportWrongBtn) els.exportWrongBtn.disabled = true;
  els.quizSelect.innerHTML = `<option value="">(erst CSV importieren)</option>`;
  els.quizSelect.disabled = true;
  els.startBtn.disabled = true;
  els.resetBtn.disabled = true;
  els.csvFile.value = "";
  if (els.csvText) els.csvText.value = "";
  if (els.fileName) els.fileName.textContent = "Keine Datei ausgewählt";
  if (els.timeText) els.timeText.textContent = "0:00";
  setStatus("Bereit. Bitte CSV auswählen.", "info");
  showImport();
}

function renderQuestion() {
  const q = questions[idx];
  const a = answers[idx];
  const total = questions.length;
  const hasAnswer = !!(a && a.selectedDisplayIndex != null);

  els.quizTitle.textContent = currentQuizName;
  els.quizMeta.textContent = `${total} Fragen`;
  els.qCounter.textContent = `Frage ${idx+1} / ${total}`;
  els.questionText.textContent = q.question;

  const hasHint = !!(q.hint && q.hint.trim());
  els.hintBtn.disabled = !hasHint;
  els.hintBtn.textContent = hasHint ? "Hinweis anzeigen" : "Hinweis";
  els.hintBtn.setAttribute("aria-expanded", "false");
  els.hintText.textContent = hasHint ? q.hint : "";
  els.hintText.classList.toggle("hidden", true);

  setProgress(total ? ((hasAnswer ? (idx + 1) : idx) / total) * 100 : 0);
  els.scoreText.textContent = `${score} / ${total}`;

  els.prevBtn.disabled = idx === 0;
  els.nextBtn.disabled = !hasAnswer;
  els.nextBtn.textContent = (idx === total - 1) ? "Ergebnis" : "Weiter";
  els.feedback.textContent = hasAnswer
    ? (a.isCorrect ? "Richtig." : `Falsch. Richtig: ${q.choices[q.correctIndex]}`)
    : "";
  els.choices.innerHTML = "";

  let displayChoices = q.choices.map((text, originalIndex) => ({ text, originalIndex }));
  let map = displayChoices.map(x => x.originalIndex);

  if (els.shuffleAnswers.checked) {
    if (a && Array.isArray(a.shuffledMap)) {
      map = a.shuffledMap.slice();
      displayChoices = map.map(originalIndex => ({ text: q.choices[originalIndex], originalIndex }));
    } else {
      const indices = q.choices.map((_, i) => i);
      shuffleArray(indices);
      map = indices;
      displayChoices = map.map(originalIndex => ({ text: q.choices[originalIndex], originalIndex }));
      if (a) a.shuffledMap = map.slice();
    }
  } else {
    if (a) a.shuffledMap = null;
  }

  displayChoices.forEach((cObj, displayIndex) => {
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
    textEl.textContent = cObj.text;
    btn.appendChild(keyEl);
    btn.appendChild(textEl);

    if (hasAnswer) {
      const isCorrect = (displayIndex === a.correctDisplayIndex);
      const isSelected = (displayIndex === a.selectedDisplayIndex);
      if (isCorrect) btn.classList.add("correct");
      if (isSelected && !isCorrect) btn.classList.add("wrong");
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => selectAnswer(displayIndex, map, q));
    }
    els.choices.appendChild(btn);
  });

  const raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb) => window.setTimeout(cb, 0);
  raf(() => {
    if (els.quizCard.classList.contains("hidden")) return;
    if (!hasAnswer) {
      const first = els.choices.querySelector(".choice:not(:disabled)");
      if (first) first.focus();
      return;
    }
    if (!els.nextBtn.disabled) els.nextBtn.focus();
  });
}

function selectAnswer(selectedDisplayIndex, map, q) {
  clearAutoNext();
  const current = answers[idx];
  if (current && current.selectedDisplayIndex != null) return;

  const selectedOriginal = map[selectedDisplayIndex];
  const correctOriginal = q.correctIndex;
  const correctDisplayIndex = map.findIndex(originalIndex => originalIndex === correctOriginal);
  const isCorrect = selectedOriginal === correctOriginal;

  answers[idx] = {
    selectedDisplayIndex,
    correctDisplayIndex,
    isCorrect,
    shuffledMap: els.shuffleAnswers.checked ? map.slice() : null,
  };
  if (isCorrect) score++;

  els.choices.querySelectorAll(".choice").forEach((btn) => {
    btn.disabled = true;
    const di = Number(btn.dataset.displayIndex);
    if (di === correctDisplayIndex) btn.classList.add("correct");
    if (di === selectedDisplayIndex && di !== correctDisplayIndex) btn.classList.add("wrong");
  });

  els.feedback.textContent = isCorrect ? "Richtig." : `Falsch. Richtig: ${q.choices[correctOriginal]}`;
  els.nextBtn.disabled = false;
  els.nextBtn.textContent = (idx === questions.length - 1) ? "Ergebnis" : "Weiter";
  els.scoreText.textContent = `${score} / ${questions.length}`;
  setProgress(questions.length ? ((idx + 1) / questions.length) * 100 : 0);

  if (els.autoNext && els.autoNext.checked) {
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
  currentQuizName = els.quizSelect.value || Object.keys(bank)[0];
  questions = (bank[currentQuizName] || []).slice();
  if (els.shuffleQuestions.checked) shuffleArray(questions);

  idx = 0; score = 0;
  answers = questions.map(() => ({ selectedDisplayIndex:null, correctDisplayIndex:null, isCorrect:null, shuffledMap:null }));
  lastResult = null;
  if (els.copyResultBtn) els.copyResultBtn.disabled = true;
  if (els.exportWrongBtn) els.exportWrongBtn.disabled = true;

  clearAutoNext();
  startTimer();
  showQuiz();
  renderQuestion();
}

function finishQuiz() {
  clearAutoNext();
  stopTimer();

  const total = questions.length;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const answeredCount = answers.filter(a => a && a.selectedDisplayIndex != null).length;
  const durationMs = Date.now() - quizStartedAtMs;
  const durationText = formatDuration(durationMs);
  const answeredPart = (answeredCount < total) ? ` Beantwortet: ${answeredCount}/${total}.` : "";
  els.resultSummary.textContent = `Du hast ${score} von ${total} richtig (${pct}%). Zeit: ${durationText}.${answeredPart}`;

  els.reviewList.innerHTML = "";
  const wrong = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = answers[i];
    if (!a || a.isCorrect === true) continue;

    const map = Array.isArray(a.shuffledMap) ? a.shuffledMap : q.choices.map((_, j) => j);
    const correctDisplayIndex = a.correctDisplayIndex ?? map.findIndex(x => x === q.correctIndex);
    const selectedDisplayIndex = a.selectedDisplayIndex;

    const correctText = q.choices[ map[correctDisplayIndex] ];
    const selectedText = (selectedDisplayIndex == null) ? "(keine Antwort)" : q.choices[ map[selectedDisplayIndex] ];
    wrong.push({ i, q, selectedText, correctText });
  }

  lastResult = {
    quizName: currentQuizName,
    score,
    total,
    pct,
    answeredCount,
    durationMs,
    durationText,
    wrong,
  };
  if (els.copyResultBtn) els.copyResultBtn.disabled = false;
  if (els.exportWrongBtn) els.exportWrongBtn.disabled = wrong.length === 0;

  if (wrong.length === 0) {
    els.reviewList.innerHTML = `<p class="muted">Keine falschen Antworten. Sehr gut.</p>`;
  } else {
    wrong.forEach((w) => {
      const div = document.createElement("div");
      div.className = "review-item";
      div.innerHTML = `
        <strong>Frage ${w.i + 1}: ${escapeHTML(w.q.question)}</strong>
        <div class="line">Deine Antwort: ${escapeHTML(w.selectedText)}</div>
        <div class="line">Richtig: ${escapeHTML(w.correctText)}</div>
        ${w.q.hint ? `<div class="line">Hinweis: ${escapeHTML(w.q.hint)}</div>` : ""}
      `;
      els.reviewList.appendChild(div);
    });
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
  if (idx < questions.length - 1) { idx++; renderQuestion(); }
  else finishQuiz();
}
function goPrev(){
  clearAutoNext();
  if (idx > 0) { idx--; renderQuestion(); }
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

function importBuilt(built, sourceLabel = "") {
  bank = built.bank;
  populateQuizSelect(built.quizNames, bank);

  els.startBtn.disabled = false;
  els.resetBtn.disabled = false;

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

els.startBtn.addEventListener("click", startQuiz);
els.resetBtn.addEventListener("click", resetAll);
els.hintBtn.addEventListener("click", toggleHint);
els.nextBtn.addEventListener("click", goNext);
els.prevBtn.addEventListener("click", goPrev);
els.finishBtn.addEventListener("click", requestFinish);
els.restartBtn.addEventListener("click", () => startQuiz());
els.backToImportBtn.addEventListener("click", () => showImport());

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

  if (!els.nextBtn.disabled) return;
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
