// Change this in config.js when your backend is deployed.
const API_BASE_URL = window.TODO_API_URL || "http://localhost:4000";

const monthCalendar = document.querySelector("#monthCalendar");
const monthSelect = document.querySelector("#monthSelect");
const yearInput = document.querySelector("#yearInput");
const previousMonth = document.querySelector("#previousMonth");
const nextMonth = document.querySelector("#nextMonth");
const todayButton = document.querySelector("#todayButton");
const calendarTitle = document.querySelector("#calendarTitle");
const selectedDatePill = document.querySelector("#selectedDatePill");

const taskForm = document.querySelector("#taskForm");
const taskTitle = document.querySelector("#taskTitle");
const taskPriority = document.querySelector("#taskPriority");
const taskList = document.querySelector("#taskList");
const emptyState = document.querySelector("#emptyState");
const clearDone = document.querySelector("#clearDone");
const statusMessage = document.querySelector("#statusMessage");
const themeToggle = document.querySelector("#themeToggle");
const summaryToggle = document.querySelector("#summaryToggle");
const overdueToggle = document.querySelector("#overdueToggle");
const analyticsStrip = document.querySelector("#analyticsStrip");
const selectedDateTitle = document.querySelector("#selectedDateTitle");
const selectedDayStats = document.querySelector("#selectedDayStats");

const statPlannedDays = document.querySelector("#statPlannedDays");
const statTodo = document.querySelector("#statTodo");
const statInProgress = document.querySelector("#statInProgress");
const statDone = document.querySelector("#statDone");
const daySummaryTitle = document.querySelector("#daySummaryTitle");
const weekSummaryTitle = document.querySelector("#weekSummaryTitle");
const monthSummaryTitle = document.querySelector("#monthSummaryTitle");
const daySummaryChart = document.querySelector("#daySummaryChart");
const weekSummaryChart = document.querySelector("#weekSummaryChart");
const monthSummaryChart = document.querySelector("#monthSummaryChart");

let today = getTodayValue();
let todayDate = new Date(`${today}T00:00:00`);
const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("en-IN", { month: "long" }).format(new Date(2026, month, 1))
);
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const statusLabels = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done"
};
const statusOrder = ["todo", "in-progress", "done"];

let tasks = [];
let selectedDate = today;
let visibleMonth = todayDate.getMonth();
let visibleYear = todayDate.getFullYear();
let currentTheme = localStorage.getItem("todo-theme") || "dark";
let isSummaryOpen = false;
let isOverdueMode = false;

populateMonthSelect();
applyTheme(currentTheme);
applySummaryVisibility();
applyOverdueVisibility();
yearInput.value = visibleYear;
monthSelect.value = String(visibleMonth);
loadTasks();

themeToggle.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem("todo-theme", currentTheme);
  applyTheme(currentTheme);
});

summaryToggle.addEventListener("click", () => {
  isSummaryOpen = !isSummaryOpen;
  applySummaryVisibility();
});

overdueToggle.addEventListener("click", () => {
  isOverdueMode = !isOverdueMode;
  applyOverdueVisibility();
  render();
});

previousMonth.addEventListener("click", () => {
  setVisibleMonth(visibleYear, visibleMonth - 1);
});

nextMonth.addEventListener("click", () => {
  setVisibleMonth(visibleYear, visibleMonth + 1);
});

todayButton.addEventListener("click", () => {
  goToToday();
});

window.addEventListener("focus", syncTodayOnResume);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncTodayOnResume();
});
setInterval(syncTodayOnResume, 60000);

monthSelect.addEventListener("change", () => {
  setVisibleMonth(visibleYear, Number(monthSelect.value));
});

yearInput.addEventListener("change", () => {
  const year = yearInput.value.trim() ? Number(yearInput.value) : NaN;
  setVisibleMonth(year, visibleMonth);
});

monthCalendar.addEventListener("click", (event) => {
  const dayButton = event.target.closest("[data-date]");
  if (!dayButton) return;

  isOverdueMode = false;
  selectedDate = dayButton.dataset.date;
  applyOverdueVisibility();
  taskTitle.focus();
  render();
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = taskTitle.value.trim();
  if (!title) return;

  const newTask = {
    title,
    due: selectedDate,
    priority: taskPriority.value
  };

  try {
    setStatus("Saving task...");
    const savedTask = await apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify(newTask)
    });

    tasks.unshift(normalizeTask(savedTask));
    taskTitle.value = "";
    taskPriority.value = "normal";
    setStatus("");
    render();
    taskTitle.focus();
  } catch (error) {
    showError(error.message);
  }
});

taskList.addEventListener("click", async (event) => {
  const subtaskToggle = event.target.closest("[data-subtask-toggle]");
  if (subtaskToggle) {
    await toggleSubtask(subtaskToggle.dataset.taskId, subtaskToggle.dataset.subtaskId, subtaskToggle.checked);
    return;
  }

  const deleteSubtaskButton = event.target.closest("[data-subtask-delete]");
  if (deleteSubtaskButton) {
    await deleteSubtask(deleteSubtaskButton.dataset.taskId, deleteSubtaskButton.dataset.subtaskId);
    return;
  }

  const statusButton = event.target.closest("[data-status]");
  if (statusButton) {
    await updateTaskStatus(statusButton.dataset.taskId, statusButton.dataset.status);
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;

  await deleteTask(deleteButton.dataset.delete);
});

taskList.addEventListener("submit", async (event) => {
  const subtaskForm = event.target.closest("[data-subtask-form]");
  if (!subtaskForm) return;

  event.preventDefault();
  const input = subtaskForm.querySelector("input");
  const title = input.value.trim();
  if (!title) return;

  await addSubtask(subtaskForm.dataset.taskId, title);
});

clearDone.addEventListener("click", async () => {
  const completedTasks = getSelectedDateTasks().filter((task) => task.status === "done");
  if (!completedTasks.length) return;

  const previousTasks = [...tasks];
  tasks = tasks.filter((task) => !(task.due === selectedDate && task.status === "done"));
  render();

  try {
    await Promise.all(completedTasks.map((task) => apiRequest(`/api/tasks/${task.id}`, { method: "DELETE" })));
  } catch (error) {
    tasks = previousTasks;
    render();
    showError(error.message);
  }
});

async function loadTasks() {
  try {
    setStatus("Loading tasks...");
    tasks = (await apiRequest("/api/tasks")).map(normalizeTask);
    setStatus("");
    render();
  } catch (error) {
    showError(error.message);
    render();
  }
}

async function updateTaskStatus(taskId, status) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || task.status === status) return;

  const previousTask = { ...task, subtasks: [...task.subtasks] };
  task.status = status;
  task.done = status === "done";
  task.completedAt = status === "done" ? new Date().toISOString() : null;
  if (status === "done" && task.subtasks.length) {
    task.subtasks = task.subtasks.map((subtask) => ({ ...subtask, done: true }));
  }
  render();

  try {
    const updatedTask = normalizeTask(await apiRequest(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, done: task.done, subtasks: task.subtasks })
    }));
    tasks = tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
    render();
  } catch (error) {
    tasks = tasks.map((item) => (item.id === previousTask.id ? previousTask : item));
    render();
    showError(error.message);
  }
}

async function addSubtask(taskId, title) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  const previousTask = { ...task, subtasks: [...task.subtasks] };
  const subtasks = [
    ...task.subtasks,
    {
      id: crypto.randomUUID(),
      title,
      done: false,
      createdAt: new Date().toISOString()
    }
  ];

  await saveSubtasks(task, subtasks, previousTask);
}

async function toggleSubtask(taskId, subtaskId, done) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  const previousTask = { ...task, subtasks: [...task.subtasks] };
  const subtasks = task.subtasks.map((subtask) =>
    subtask.id === subtaskId ? { ...subtask, done } : subtask
  );

  await saveSubtasks(task, subtasks, previousTask);
}

async function deleteSubtask(taskId, subtaskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  const previousTask = { ...task, subtasks: [...task.subtasks] };
  const subtasks = task.subtasks.filter((subtask) => subtask.id !== subtaskId);

  await saveSubtasks(task, subtasks, previousTask);
}

async function saveSubtasks(task, subtasks, previousTask) {
  task.subtasks = subtasks;
  applyTaskProgressStatus(task);
  render();

  try {
    const updatedTask = normalizeTask(await apiRequest(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ subtasks, status: task.status, done: task.done })
    }));
    tasks = tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
    render();
  } catch (error) {
    tasks = tasks.map((item) => (item.id === previousTask.id ? previousTask : item));
    render();
    showError(error.message);
  }
}

async function deleteTask(taskId) {
  const previousTasks = [...tasks];
  tasks = tasks.filter((task) => task.id !== taskId);
  render();

  try {
    await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE" });
  } catch (error) {
    tasks = previousTasks;
    render();
    showError(error.message);
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function render() {
  calendarTitle.textContent = `${monthNames[visibleMonth]} ${visibleYear}`;
  monthSelect.value = String(visibleMonth);
  yearInput.value = visibleYear;
  const activeDateLabel = isOverdueMode ? "Overdue tasks" : formatDisplayDate(selectedDate);
  selectedDatePill.textContent = activeDateLabel;
  selectedDateTitle.textContent = activeDateLabel;

  renderCalendar();
  renderSelectedDateTasks();
  updateStats();
  renderAnalytics();
}

function renderCalendar() {
  monthCalendar.innerHTML = "";

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "weekday-row";
  weekdayLabels.forEach((label) => {
    const weekday = document.createElement("span");
    weekday.textContent = label;
    weekdayRow.append(weekday);
  });

  const dayGrid = document.createElement("div");
  dayGrid.className = "day-grid";

  const firstDayOffset = new Date(visibleYear, visibleMonth, 1).getDay();
  const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();

  for (let blank = 0; blank < firstDayOffset; blank += 1) {
    const spacer = document.createElement("span");
    spacer.className = "day-spacer";
    dayGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateValue = toDateInputValue(new Date(visibleYear, visibleMonth, day));
    dayGrid.append(createDayButton(dateValue, day));
  }

  monthCalendar.append(weekdayRow, dayGrid);
}

function createDayButton(dateValue, day) {
  const dateTasks = tasks.filter((task) => task.due === dateValue);
  const counts = getStatusCounts(dateTasks);
  const progress = getTaskCollectionProgress(dateTasks);
  const total = counts.todo + counts["in-progress"] + counts.done;
  const button = document.createElement("button");
  button.className = "day-button";
  button.type = "button";
  button.dataset.date = dateValue;
  button.classList.toggle("selected", dateValue === selectedDate);
  button.classList.toggle("today", dateValue === today);
  button.classList.toggle("planned", total > 0);
  button.classList.toggle("heat-low", total > 0 && progress.percent < 34);
  button.classList.toggle("heat-mid", progress.percent >= 34 && progress.percent < 67);
  button.classList.toggle("heat-high", progress.percent >= 67);
  button.setAttribute("aria-label", `${formatDisplayDate(dateValue)}. ${getCountSummary(counts)}.`);

  const number = document.createElement("span");
  number.className = "day-number";
  number.textContent = String(day);
  button.append(number);

  const dots = document.createElement("span");
  dots.className = "day-dots";
  statusOrder.forEach((status) => {
    if (!counts[status]) return;
    const dot = document.createElement("i");
    dot.className = `dot ${status}`;
    dots.append(dot);
  });
  button.append(dots);

  return button;
}

function renderSelectedDateTasks() {
  const selectedTasks = getVisibleTaskList();
  const counts = getStatusCounts(selectedTasks);

  const progress = getTaskCollectionProgress(selectedTasks);

  selectedDayStats.innerHTML = "";
  selectedDayStats.append(createStatChip(`${selectedTasks.length} tasks`));
  selectedDayStats.append(createStatChip(`${counts.todo} to do`));
  selectedDayStats.append(createStatChip(`${counts["in-progress"]} in progress`));
  selectedDayStats.append(createStatChip(`${counts.done} done`));
  selectedDayStats.append(createProgressChart(progress.percent, `${progress.done}/${progress.total} complete`));

  taskList.innerHTML = "";
  selectedTasks.forEach((task) => {
    taskList.append(createTaskElement(task));
  });

  emptyState.classList.toggle("show", selectedTasks.length === 0);
  clearDone.disabled = counts.done === 0;
}

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = `task-item status-${task.status}`;

  const header = document.createElement("div");
  header.className = "task-card-header";

  const content = document.createElement("div");
  content.className = "task-content";

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  if (isOverdueMode) {
    meta.append(createBadge(formatShortDate(task.due), "overdue"));
  }
  meta.append(createBadge(task.priority, task.priority));
  meta.append(createBadge(statusLabels[task.status], task.status));

  content.append(title, meta);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "x";
  deleteButton.dataset.delete = task.id;
  deleteButton.setAttribute("aria-label", `Delete ${task.title}`);

  header.append(content, deleteButton);

  const statusControl = document.createElement("div");
  statusControl.className = "status-control";
  statusControl.setAttribute("role", "group");
  statusControl.setAttribute("aria-label", `Status for ${task.title}`);

  statusOrder.forEach((status) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.taskId = task.id;
    button.dataset.status = status;
    button.className = `status-button ${status}`;
    button.classList.toggle("active", task.status === status);
    button.textContent = statusLabels[status];
    button.setAttribute("aria-pressed", String(task.status === status));
    statusControl.append(button);
  });

  const subtaskPanel = createSubtaskPanel(task);

  item.append(header, statusControl, subtaskPanel);
  return item;
}

function createSubtaskPanel(task) {
  const panel = document.createElement("div");
  panel.className = "subtask-panel";

  const progress = getTaskProgress(task);
  panel.append(createProgressChart(progress.percent, `${progress.done}/${progress.total} subtasks done`));

  const list = document.createElement("ul");
  list.className = "subtask-list";

  task.subtasks.forEach((subtask) => {
    const item = document.createElement("li");
    item.className = `subtask-item${subtask.done ? " done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = subtask.done;
    checkbox.dataset.taskId = task.id;
    checkbox.dataset.subtaskId = subtask.id;
    checkbox.dataset.subtaskToggle = "true";
    checkbox.setAttribute("aria-label", `Mark ${subtask.title} done`);

    const title = document.createElement("span");
    title.textContent = subtask.title;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "subtask-delete";
    deleteButton.textContent = "x";
    deleteButton.dataset.taskId = task.id;
    deleteButton.dataset.subtaskId = subtask.id;
    deleteButton.dataset.subtaskDelete = "true";
    deleteButton.setAttribute("aria-label", `Delete ${subtask.title}`);

    item.append(checkbox, title, deleteButton);
    list.append(item);
  });

  const form = document.createElement("form");
  form.className = "subtask-form";
  form.dataset.taskId = task.id;
  form.dataset.subtaskForm = "true";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Add subtask";
  input.setAttribute("aria-label", `Add subtask to ${task.title}`);

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Add";

  form.append(input, button);
  panel.append(list, form);
  return panel;
}

function updateStats() {
  const selectedTasks = getVisibleTaskList();
  const counts = getStatusCounts(selectedTasks);
  const progress = getTaskCollectionProgress(selectedTasks);

  statPlannedDays.textContent = selectedTasks.length;
  statTodo.textContent = counts.todo;
  statInProgress.textContent = counts["in-progress"];
  statDone.textContent = `${progress.percent}%`;
}

function applyTaskProgressStatus(task) {
  if (!task.subtasks.length) return;

  const progress = getTaskProgress(task);
  task.done = progress.total > 0 && progress.done === progress.total;
  task.status = task.done ? "done" : progress.done > 0 ? "in-progress" : "todo";
  task.completedAt = task.done ? new Date().toISOString() : null;
}

function getTaskProgress(task) {
  if (!task.subtasks.length) {
    return {
      done: task.status === "done" ? 1 : 0,
      total: 1,
      percent: task.status === "done" ? 100 : 0
    };
  }

  const done = task.subtasks.filter((subtask) => subtask.done).length;
  const total = task.subtasks.length;
  return {
    done,
    total,
    percent: Math.round((done / total) * 100)
  };
}

function getTaskCollectionProgress(taskItems) {
  const totals = taskItems.reduce(
    (summary, task) => {
      const progress = getTaskProgress(task);
      summary.done += progress.done;
      summary.total += progress.total;
      return summary;
    },
    { done: 0, total: 0 }
  );

  return {
    ...totals,
    percent: totals.total ? Math.round((totals.done / totals.total) * 100) : 0
  };
}

function createProgressChart(percent, label) {
  const chart = document.createElement("div");
  chart.className = "progress-chart";

  const header = document.createElement("div");
  header.className = "progress-chart-header";

  const text = document.createElement("span");
  text.textContent = label;

  const value = document.createElement("strong");
  value.textContent = `${percent}%`;

  const track = document.createElement("div");
  track.className = "progress-track";
  track.setAttribute("aria-label", `${label}: ${percent}%`);

  const bar = document.createElement("span");
  bar.style.width = `${percent}%`;

  header.append(text, value);
  track.append(bar);
  chart.append(header, track);
  return chart;
}

function renderAnalytics() {
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const weekStart = new Date(selectedDateObject);
  weekStart.setDate(selectedDateObject.getDate() - selectedDateObject.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const dayTasks = tasks.filter((task) => task.due === selectedDate);
  const weekTasks = tasks.filter((task) => {
    const taskDate = new Date(`${task.due}T00:00:00`);
    return taskDate >= weekStart && taskDate <= weekEnd;
  });
  const monthPrefix = `${selectedDateObject.getFullYear()}-${padNumber(selectedDateObject.getMonth() + 1)}-`;
  const monthTasks = tasks.filter((task) => task.due.startsWith(monthPrefix));

  daySummaryTitle.textContent = formatShortDate(selectedDate);
  weekSummaryTitle.textContent = `${formatShortDate(toDateInputValue(weekStart))} - ${formatShortDate(toDateInputValue(weekEnd))}`;
  monthSummaryTitle.textContent = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric"
  }).format(selectedDateObject);

  renderSummaryChart(daySummaryChart, dayTasks);
  renderSummaryChart(weekSummaryChart, weekTasks);
  renderSummaryChart(monthSummaryChart, monthTasks);
}

function renderSummaryChart(container, taskItems) {
  const progress = getTaskCollectionProgress(taskItems);
  const counts = getStatusCounts(taskItems);

  container.innerHTML = "";
  container.append(createProgressChart(progress.percent, `${progress.done}/${progress.total} complete`));

  const bars = document.createElement("div");
  bars.className = "mini-bars";
  bars.append(createMiniBar("To do", counts.todo, taskItems.length, "todo"));
  bars.append(createMiniBar("Progress", counts["in-progress"], taskItems.length, "in-progress"));
  bars.append(createMiniBar("Done", counts.done, taskItems.length, "done"));
  container.append(bars);
}

function createMiniBar(label, value, total, status) {
  const row = document.createElement("div");
  row.className = `mini-bar ${status}`;

  const name = document.createElement("span");
  name.textContent = label;

  const track = document.createElement("i");
  const fill = document.createElement("b");
  fill.style.width = `${total ? Math.round((value / total) * 100) : 0}%`;
  track.append(fill);

  const count = document.createElement("strong");
  count.textContent = String(value);

  row.append(name, track, count);
  return row;
}
function getVisibleTaskList() {
  return isOverdueMode ? getOverdueTasks() : getSelectedDateTasks();
}

function getOverdueTasks() {
  return tasks
    .filter((task) => task.due < today && task.status !== "done")
    .sort((a, b) => a.due.localeCompare(b.due) || priorityRank(a.priority) - priorityRank(b.priority));
}

function getSelectedDateTasks() {
  return tasks
    .filter((task) => task.due === selectedDate)
    .sort((a, b) => {
      if (a.status !== b.status) return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      if (a.priority !== b.priority) return priorityRank(a.priority) - priorityRank(b.priority);
      return a.title.localeCompare(b.title);
    });
}

function getStatusCounts(taskItems) {
  return taskItems.reduce(
    (counts, task) => {
      const status = isValidStatus(task.status) ? task.status : "todo";
      counts[status] += 1;
      return counts;
    },
    { todo: 0, "in-progress": 0, done: 0 }
  );
}

function setVisibleMonth(year, month) {
  if (!Number.isInteger(year)) {
    yearInput.value = visibleYear;
    return;
  }

  const date = new Date(clampYear(year), month, 1);
  visibleYear = date.getFullYear();
  visibleMonth = date.getMonth();

  if (!isDateInVisibleMonth(selectedDate)) {
    selectedDate = toDateInputValue(new Date(visibleYear, visibleMonth, 1));
  }

  render();
}

function isDateInVisibleMonth(dateValue) {
  return dateValue.startsWith(`${visibleYear}-${padNumber(visibleMonth + 1)}-`);
}

function populateMonthSelect() {
  monthNames.forEach((name, month) => {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = name;
    monthSelect.append(option);
  });
}

function createBadge(text, modifier) {
  const badge = document.createElement("span");
  badge.className = `badge ${modifier}`.trim();
  badge.textContent = text;
  return badge;
}

function createStatChip(text) {
  const chip = document.createElement("span");
  chip.className = "stat-chip";
  chip.textContent = text;
  return chip;
}

function getCountSummary(counts) {
  const total = counts.todo + counts["in-progress"] + counts.done;
  if (!total) return "No tasks";
  return `${counts.todo} to do, ${counts["in-progress"]} in progress, ${counts.done} done`;
}

function clampYear(year) {
  return Math.min(2100, Math.max(1970, year));
}

function normalizeTask(task) {
  const fallbackStatus = task.done ? "done" : "todo";
  const status = isValidStatus(task.status) ? task.status : fallbackStatus;
  return {
    ...task,
    status,
    done: status === "done",
    subtasks: normalizeSubtasks(task.subtasks)
  };
}

function normalizeSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) return [];

  return subtasks
    .map((subtask) => {
      const title = String(subtask?.title || "").trim();
      if (!title) return null;
      return {
        id: String(subtask.id || crypto.randomUUID()),
        title,
        done: Boolean(subtask.done),
        createdAt: subtask.createdAt || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function isValidStatus(status) {
  return statusOrder.includes(status);
}

function setStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("error");
}

function showError(message) {
  statusMessage.textContent = `Backend error: ${message}`;
  statusMessage.classList.add("error");
}

function applyOverdueVisibility() {
  overdueToggle.classList.toggle("active", isOverdueMode);
  overdueToggle.setAttribute("aria-pressed", String(isOverdueMode));
  taskForm.hidden = isOverdueMode;
}

function applySummaryVisibility() {
  analyticsStrip.hidden = !isSummaryOpen;
  summaryToggle.classList.toggle("active", isSummaryOpen);
  summaryToggle.textContent = "Summary";
  summaryToggle.setAttribute("aria-expanded", String(isSummaryOpen));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
  themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
}

function formatDisplayDate(dateValue) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${dateValue}T00:00:00`));
}

function formatShortDate(dateValue) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short"
  }).format(new Date(`${dateValue}T00:00:00`));
}

function priorityRank(priority) {
  return { high: 0, normal: 1, low: 2 }[priority] ?? 1;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function goToToday() {
  refreshToday();
  isOverdueMode = false;
  selectedDate = today;
  visibleMonth = todayDate.getMonth();
  visibleYear = todayDate.getFullYear();
  applyOverdueVisibility();
  render();
}

function syncTodayOnResume() {
  const previousToday = today;
  refreshToday();
  if (previousToday === today) return;

  selectedDate = today;
  visibleMonth = todayDate.getMonth();
  visibleYear = todayDate.getFullYear();
  render();
}

function refreshToday() {
  const nextToday = getTodayValue();
  if (nextToday === today) return;

  today = nextToday;
  todayDate = new Date(`${today}T00:00:00`);
}

function getTodayValue() {
  return toDateInputValue(new Date());
}

function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}
