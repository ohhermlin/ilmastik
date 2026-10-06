const STORAGE_KEY = "kooliplanner.tasks.v1";
const CRITICAL_SCORE = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const elements = {
  date: document.querySelector("#today-date"), focusDate: document.querySelector("#focus-date"),
  statOpen: document.querySelector("#stat-open"), statHours: document.querySelector("#stat-hours"),
  statDone: document.querySelector("#stat-done"), statTotal: document.querySelector("#stat-total"),
  week: document.querySelector("#week-grid"), list: document.querySelector("#task-list"),
  taskCount: document.querySelector("#task-count"), empty: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"), emptyCopy: document.querySelector("#empty-copy"),
  focus: document.querySelector("#focus-list"), form: document.querySelector("#task-form"),
  dueDate: document.querySelector("#due-date"), search: document.querySelector("#subject-filter"),
  toast: document.querySelector("#toast"), timer: document.querySelector("#timer-display"),
  timerMode: document.querySelector("#timer-mode"), timerProgress: document.querySelector("#timer-progress"),
  timerToggle: document.querySelector("#timer-toggle"), timerHint: document.querySelector("#timer-hint")
};

let tasks = loadTasks();
let activeFilter = "all";
let toastTimeout;
let timerInterval = null;
let timerMode = "focus";
let secondsLeft = 25 * 60;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((task) => task && typeof task.id === "string" && task.dueDate) : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  catch { showToast("Salvestamine ebaõnnestus. Kontrolli brauseri salvestusruumi."); }
}

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromString(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(value, amount) {
  const date = dateFromString(value);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function readableDate(value, options = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("et-EE", options).format(dateFromString(value));
}

function isComplete(task) {
  if (task.isSplit) {
    const children = tasks.filter((item) => item.parentId === task.id);
    return children.length > 0 && children.every((item) => item.completed);
  }
  return Boolean(task.completed);
}

function visibleTasks() { return tasks.filter((task) => !task.isSplit); }
function getLoadTasks() { return visibleTasks().filter((task) => !task.completed); }

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("show"), 3000);
}

function renderHeader() {
  const today = new Date();
  const dateText = new Intl.DateTimeFormat("et-EE", { weekday: "long", day: "numeric", month: "long" }).format(today);
  elements.date.textContent = `SINU ÕPPENÄDAL · ${dateText.toLocaleUpperCase("et-EE")}`;
  elements.focusDate.textContent = dateText;
  elements.dueDate.min = localDateString();
  if (!elements.dueDate.value) elements.dueDate.value = localDateString();
}

function renderStats() {
  const displayed = visibleTasks();
  const open = displayed.filter((task) => !isComplete(task));
  const today = localDateString();
  const weekEnd = addDays(today, 6);
  const weekHours = getLoadTasks().filter((task) => task.dueDate >= today && task.dueDate <= weekEnd).reduce((total, task) => total + Number(task.hours || 0), 0);
  elements.statOpen.textContent = open.length;
  elements.statHours.textContent = Number(weekHours.toFixed(1));
  elements.statDone.textContent = displayed.length - open.length;
  elements.statTotal.textContent = displayed.length;
  elements.taskCount.textContent = open.length;
}

function renderWeek() {
  const today = localDateString();
  const loadTasks = getLoadTasks();
  elements.week.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    const dueTasks = loadTasks.filter((task) => task.dueDate === date);
    const hours = dueTasks.reduce((total, task) => total + Number(task.hours || 0), 0);
    const score = dueTasks.reduce((total, task) => total + Number(task.hours || 0) * Number(task.difficulty || 1), 0);
    const critical = score >= CRITICAL_SCORE || hours >= 6;
    const medium = !critical && score >= 6;
    const dayName = index === 0 ? "Täna" : new Intl.DateTimeFormat("et-EE", { weekday: "short" }).format(dateFromString(date)).replace(".", "");
    const accessible = `${readableDate(date, { weekday: "long", day: "numeric", month: "long" })}: ${hours.toFixed(1)} tundi, koormusskoor ${score.toFixed(1)}${critical ? ", kriitiline koormus" : ""}`;
    return `<article class="day-card ${index === 0 ? "is-today" : ""} ${critical ? "is-critical" : medium ? "load-medium" : ""}" aria-label="${escapeHtml(accessible)}"><span class="day-label">${escapeHtml(dayName)}</span><span class="day-number">${dateFromString(date).getDate()}</span><div class="day-bar" aria-hidden="true"><span style="width:${Math.min(100, score / 20 * 100)}%"></span></div><span class="day-hours">${hours.toFixed(1)} h</span><span class="day-score">Skoor ${score.toFixed(1)}</span>${critical ? '<span class="critical-label">Kriitiline koormus!</span>' : ""}</article>`;
  }).join("");
}

function typeClass(type) {
  if (type === "Kontrolltöö") return "test";
  if (type === "Projekt") return "project";
  if (type === "Esitlus") return "presentation";
  return "";
}

function renderTasks() {
  const today = localDateString();
  const query = elements.search.value.trim().toLocaleLowerCase("et-EE");
  const items = visibleTasks().filter((task) => {
    if (activeFilter === "open" && task.completed) return false;
    if (activeFilter === "done" && !task.completed) return false;
    return !query || `${task.subject} ${task.title} ${task.type}`.toLocaleLowerCase("et-EE").includes(query);
  }).sort((first, second) => first.completed - second.completed || first.dueDate.localeCompare(second.dueDate));
  elements.list.innerHTML = items.map((task) => {
    const overdue = !task.completed && task.dueDate < today;
    const smartSplit = !task.completed && !task.isSplit && Number(task.hours) >= 2 && task.dueDate > today;
    const subtitle = task.parentId ? `${task.subject} · etapp ${Number(task.stepIndex)} / ${Number(task.stepCount)}` : `${task.subject} · raskus ${Number(task.difficulty || 1)}/5`;
    const dueText = task.dueDate === today ? "Täna" : readableDate(task.dueDate);
    return `<article class="task-row ${task.completed ? "is-done" : ""}"><button class="complete-button" type="button" data-action="toggle" data-id="${escapeHtml(task.id)}" aria-label="${task.completed ? "Märgi tegemata" : "Märgi tehtuks"}: ${escapeHtml(task.title)}" aria-pressed="${task.completed}">${task.completed ? "✓" : ""}</button><div class="task-main"><div class="task-title-line"><span class="task-title">${escapeHtml(task.title)}</span><span class="type-tag ${typeClass(task.type)}">${escapeHtml(task.type)}</span></div><span class="task-subtitle">${escapeHtml(subtitle)}</span></div><div class="task-actions">${smartSplit ? `<button class="split-button" type="button" data-action="split" data-id="${escapeHtml(task.id)}" title="Jaga ülesanne väikesteks etappideks">Jaga sammudeks</button>` : ""}<span class="task-meta"><span class="task-date ${overdue ? "overdue" : ""}">${overdue ? "Üle tähtaja" : dueText}</span><span>${Number(task.hours).toLocaleString("et-EE")} h</span></span><button class="delete-button" type="button" data-action="delete" data-id="${escapeHtml(task.id)}" aria-label="Kustuta ülesanne: ${escapeHtml(task.title)}" title="Kustuta ülesanne">×</button></div></article>`;
  }).join("");
  const noTasks = items.length === 0;
  elements.empty.hidden = !noTasks;
  elements.list.hidden = noTasks;
  if (noTasks) {
    const hasAny = visibleTasks().length > 0;
    elements.emptyTitle.textContent = hasAny ? "Selle filtriga ülesandeid pole." : "Kõik on kontrolli all.";
    elements.emptyCopy.textContent = hasAny ? "Proovi teist filtrit või otsingusõna." : "Lisa esimene ülesanne ja teeme plaani valmis.";
  }
}

function renderFocus() {
  const today = localDateString();
  const focusTasks = getLoadTasks().filter((task) => task.dueDate <= today).sort((first, second) => first.dueDate.localeCompare(second.dueDate)).slice(0, 5);
  if (focusTasks.length === 0) {
    elements.focus.innerHTML = '<p class="focus-empty">Tänaseks pole tähtaegu. Vali ülesannete seast üks väike samm ja alusta rahulikult.</p>';
    return;
  }
  elements.focus.innerHTML = focusTasks.map((task) => `<div class="focus-item"><button class="complete-button" type="button" data-action="toggle" data-id="${escapeHtml(task.id)}" aria-label="Märgi tehtuks: ${escapeHtml(task.title)}" aria-pressed="false"></button><span class="focus-item-title">${escapeHtml(task.subject)} · ${escapeHtml(task.title)}</span><span class="focus-item-due">${task.dueDate < today ? "Hilinenud" : "Täna"}</span></div>`).join("");
}

function render() { renderStats(); renderWeek(); renderTasks(); renderFocus(); }

function addTask(event) {
  event.preventDefault();
  const data = new FormData(elements.form);
  const dueDate = String(data.get("dueDate"));
  if (dueDate < localDateString()) return showToast("Tähtaeg peab olema tänane või tulevane kuupäev.");
  tasks.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    subject: String(data.get("subject")).trim(), title: String(data.get("title")).trim(), type: String(data.get("type")), dueDate,
    hours: Number(data.get("hours")), difficulty: Number(data.get("difficulty")), completed: false, createdAt: Date.now()
  });
  saveTasks();
  elements.form.reset();
  elements.dueDate.value = localDateString();
  document.querySelector("#hours").value = "1";
  document.querySelector("#difficulty").value = "3";
  render();
  showToast("Ülesanne lisatud. Väike samm tehtud!");
}

function splitTask(task) {
  if (!task || task.isSplit || task.completed) return;
  const today = localDateString();
  const availableDays = Math.max(1, Math.floor((dateFromString(task.dueDate) - dateFromString(today)) / DAY_MS) + 1);
  const stepCount = Math.min(8, Math.max(2, Math.ceil(Number(task.hours) / 1.25)), availableDays);
  if (stepCount < 2) return showToast("Sammud vajavad vähemalt kahte päeva enne tähtaega.");
  const hoursPerStep = Number((Number(task.hours) / stepCount).toFixed(2));
  const steps = Array.from({ length: stepCount }, (_, index) => {
    const offset = Math.round(index * (availableDays - 1) / (stepCount - 1));
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      parentId: task.id, subject: task.subject, title: `${task.title} · etapp ${index + 1}/${stepCount}`,
      type: task.type, dueDate: addDays(today, offset), hours: hoursPerStep, difficulty: task.difficulty,
      completed: false, stepIndex: index + 1, stepCount, createdAt: Date.now()
    };
  });
  task.isSplit = true;
  task.stepIds = steps.map((step) => step.id);
  tasks.push(...steps);
  saveTasks();
  render();
  showToast(`„${task.title}” jagati ${stepCount} väiksemaks sammuks.`);
}

function toggleTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  if (task.isSplit) {
    const children = tasks.filter((item) => item.parentId === task.id);
    const markDone = !children.every((item) => item.completed);
    children.forEach((item) => { item.completed = markDone; });
  } else task.completed = !task.completed;
  saveTasks();
  render();
}

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;
  tasks = tasks.filter((item) => item.id !== task.id && item.parentId !== task.id);
  if (task.parentId) {
    const parent = tasks.find((item) => item.id === task.parentId);
    if (parent) {
      const children = tasks.filter((item) => item.parentId === parent.id);
      if (children.length === 0) parent.isSplit = false;
      parent.stepIds = children.map((item) => item.id);
    }
  }
  saveTasks();
  render();
  showToast("Ülesanne kustutatud.");
}

function formatTimer() {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  elements.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const total = timerMode === "focus" ? 25 * 60 : 5 * 60;
  elements.timerProgress.style.transform = `scaleX(${secondsLeft / total})`;
  document.title = timerInterval ? `${elements.timer.textContent} · KooliPlanner` : "KooliPlanner — Õppekoormuse juht";
}

function setTimerMode(mode) {
  timerMode = mode;
  secondsLeft = mode === "focus" ? 25 * 60 : 5 * 60;
  elements.timerMode.textContent = mode === "focus" ? "ÕPPIMINE" : "PAUS";
  elements.timerMode.classList.toggle("break", mode === "break");
  elements.timerHint.textContent = mode === "focus" ? "25 min õppimist · 5 min pausi" : "Hea töö! Nüüd 5 minutit puhkust.";
  formatTimer();
}

function toggleTimer() {
  if (timerInterval) {
    window.clearInterval(timerInterval);
    timerInterval = null;
    elements.timerToggle.innerHTML = '<span aria-hidden="true">▶</span> Jätka';
    formatTimer();
    return;
  }
  elements.timerToggle.innerHTML = '<span aria-hidden="true">Ⅱ</span> Peata';
  timerInterval = window.setInterval(() => {
    secondsLeft -= 1;
    formatTimer();
    if (secondsLeft <= 0) {
      window.clearInterval(timerInterval);
      timerInterval = null;
      const nextMode = timerMode === "focus" ? "break" : "focus";
      setTimerMode(nextMode);
      elements.timerToggle.innerHTML = '<span aria-hidden="true">▶</span> Alusta fookust';
      showToast(nextMode === "break" ? "Õppimisring tehtud! Võta 5-minutiline paus." : "Paus läbi. Alusta järgmist õppimisringi.");
    }
  }, 1000);
}

function resetTimer() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  elements.timerToggle.innerHTML = '<span aria-hidden="true">▶</span> Alusta fookust';
  setTimerMode("focus");
}

elements.form.addEventListener("submit", addTask);
elements.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "toggle") toggleTask(button.dataset.id);
  if (button.dataset.action === "delete") deleteTask(button.dataset.id);
  if (button.dataset.action === "split") splitTask(tasks.find((task) => task.id === button.dataset.id));
});
elements.focus.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-action="toggle"]');
  if (button) toggleTask(button.dataset.id);
});
document.querySelector(".filter-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  renderTasks();
});
elements.search.addEventListener("input", renderTasks);
elements.timerToggle.addEventListener("click", toggleTimer);
document.querySelector("#timer-reset").addEventListener("click", resetTimer);

renderHeader();
render();
formatTimer();