// Change this in config.js when your backend is deployed.
const API_BASE_URL = window.TODO_API_URL || "http://localhost:4000";

// These constants hold the HTML elements that JavaScript needs to read or update.
const taskForm = document.querySelector("#taskForm");
const taskTitle = document.querySelector("#taskTitle");
const taskDue = document.querySelector("#taskDue");
const taskPriority = document.querySelector("#taskPriority");
const taskList = document.querySelector("#taskList");
const emptyState = document.querySelector("#emptyState");
const filters = document.querySelectorAll(".filter");
const listTitle = document.querySelector("#listTitle");
const clearDone = document.querySelector("#clearDone");
const statusMessage = document.querySelector("#statusMessage");

const statToday = document.querySelector("#statToday");
const statFuture = document.querySelector("#statFuture");
const statDone = document.querySelector("#statDone");
const statProgress = document.querySelector("#statProgress");
const todayLabel = document.querySelector("#todayLabel");

// The tasks array is the app's main data. It now comes from the backend API.
let tasks = [];
let activeFilter = "today";

const today = toDateInputValue(new Date());
taskDue.value = today;
todayLabel.textContent = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric"
}).format(new Date());

loadTasks();

// Form submit: send a new task to the backend, then redraw the page.
taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = taskTitle.value.trim();
  if (!title) return;

  const newTask = {
    title,
    due: taskDue.value,
    priority: taskPriority.value
  };

  try {
    setStatus("Saving task...");
    const savedTask = await apiRequest("/api/tasks", {
      method: "POST",
      body: JSON.stringify(newTask)
    });

    tasks.unshift(savedTask);
    taskTitle.value = "";
    taskPriority.value = "normal";
    taskDue.value = today;
    setStatus("");
    render();
    taskTitle.focus();
  } catch (error) {
    showError(error.message);
  }
});

// Filter buttons: switch between today, future, all, and completed tasks.
filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });
    render();
  });
});

// Checkbox changes: update completion on the backend.
taskList.addEventListener("change", async (event) => {
  if (!event.target.matches("[data-complete]")) return;

  const task = tasks.find((item) => item.id === event.target.dataset.complete);
  if (!task) return;

  const previousDone = task.done;
  task.done = event.target.checked;
  task.completedAt = task.done ? new Date().toISOString() : null;
  render();

  try {
    const updatedTask = await apiRequest(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ done: task.done })
    });
    tasks = tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item));
    render();
  } catch (error) {
    task.done = previousDone;
    task.completedAt = previousDone ? task.completedAt : null;
    render();
    showError(error.message);
  }
});

// Delete buttons: remove one task from the backend.
taskList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;

  const taskId = deleteButton.dataset.delete;
  const previousTasks = tasks;
  tasks = tasks.filter((task) => task.id !== taskId);
  render();

  try {
    await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE" });
  } catch (error) {
    tasks = previousTasks;
    render();
    showError(error.message);
  }
});

// Clear all tasks that are already completed.
clearDone.addEventListener("click", async () => {
  const previousTasks = tasks;
  tasks = tasks.filter((task) => !task.done);
  render();

  try {
    await apiRequest("/api/tasks/completed", { method: "DELETE" });
  } catch (error) {
    tasks = previousTasks;
    render();
    showError(error.message);
  }
});

async function loadTasks() {
  try {
    setStatus("Loading tasks...");
    tasks = await apiRequest("/api/tasks");
    setStatus("");
    render();
  } catch (error) {
    showError(error.message);
    render();
  }
}

// apiRequest() is a small wrapper around fetch() for talking to the backend.
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

// render() redraws the page whenever the data changes.
function render() {
  const visibleTasks = getVisibleTasks();
  listTitle.textContent = getFilterTitle(activeFilter);
  taskList.innerHTML = "";

  visibleTasks.forEach((task) => {
    taskList.append(createTaskElement(task));
  });

  emptyState.classList.toggle("show", visibleTasks.length === 0);
  updateStats();
}

// Create one <li> element for one task object.
function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = `task-item${task.done ? " done" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.className = "task-check";
  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  checkbox.dataset.complete = task.id;
  checkbox.setAttribute("aria-label", `Mark ${task.title} complete`);

  const content = document.createElement("div");

  const title = document.createElement("div");
  title.className = "task-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.append(createBadge(formatDueDate(task.due), isOverdue(task) ? "overdue" : ""));
  meta.append(createBadge(task.priority, task.priority));

  if (task.completedAt) {
    meta.append(createBadge("completed", ""));
  }

  content.append(title, meta);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "x";
  deleteButton.dataset.delete = task.id;
  deleteButton.setAttribute("aria-label", `Delete ${task.title}`);

  item.append(checkbox, content, deleteButton);
  return item;
}

// Small helper for the due date, priority, and completed labels.
function createBadge(text, modifier) {
  const badge = document.createElement("span");
  badge.className = `badge ${modifier}`.trim();
  badge.textContent = text;
  return badge;
}

// Choose which tasks should be shown for the active filter.
function getVisibleTasks() {
  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    if (a.due !== b.due) return a.due.localeCompare(b.due);
    return priorityRank(a.priority) - priorityRank(b.priority);
  });

  if (activeFilter === "today") {
    return sorted.filter((task) => !task.done && task.due <= today);
  }

  if (activeFilter === "future") {
    return sorted.filter((task) => !task.done && task.due > today);
  }

  if (activeFilter === "done") {
    return sorted.filter((task) => task.done);
  }

  return sorted;
}

// Update the four number boxes at the top of the app.
function updateStats() {
  const dueToday = tasks.filter((task) => !task.done && task.due <= today).length;
  const future = tasks.filter((task) => !task.done && task.due > today).length;
  const done = tasks.filter((task) => task.done).length;
  const todayTotal = tasks.filter((task) => task.due <= today).length;
  const todayDone = tasks.filter((task) => task.due <= today && task.done).length;

  statToday.textContent = dueToday;
  statFuture.textContent = future;
  statDone.textContent = done;
  statProgress.textContent = todayTotal ? `${Math.round((todayDone / todayTotal) * 100)}%` : "0%";
}

function setStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("error");
}

function showError(message) {
  statusMessage.textContent = `Backend error: ${message}`;
  statusMessage.classList.add("error");
}

// Text shown above the task list.
function getFilterTitle(filter) {
  const titles = {
    today: "Today and overdue",
    future: "Future tasks",
    all: "All tasks",
    done: "Completed tasks"
  };
  return titles[filter];
}

// Make due dates easier to read.
function formatDueDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (dateValue === today) return "today";
  if (dateValue < today) return "overdue";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function isOverdue(task) {
  return !task.done && task.due < today;
}

// High priority tasks should appear before normal and low priority tasks.
function priorityRank(priority) {
  return { high: 0, normal: 1, low: 2 }[priority] ?? 1;
}

// Convert today's Date object into YYYY-MM-DD for the date input.
function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}
