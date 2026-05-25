import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "tasks.json");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/tasks") {
      const tasks = await readTasks();
      sendJson(response, 200, tasks);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/tasks") {
      const body = await readJsonBody(request);
      const task = createTask(body);
      const tasks = await readTasks();
      tasks.unshift(task);
      await writeTasks(tasks);
      sendJson(response, 201, task);
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/tasks/completed") {
      const tasks = await readTasks();
      await writeTasks(tasks.filter((task) => !task.done));
      sendJson(response, 200, { ok: true });
      return;
    }

    const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);

    if (taskIdMatch && request.method === "PATCH") {
      const updatedTask = await updateTask(taskIdMatch[1], await readJsonBody(request));
      sendJson(response, 200, updatedTask);
      return;
    }

    if (taskIdMatch && request.method === "DELETE") {
      await deleteTask(taskIdMatch[1]);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { message: "Route not found" });
  } catch (error) {
    const status = error.status || 500;
    sendJson(response, status, { message: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Todo API running on http://localhost:${PORT}`);
});

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw httpError(400, "Invalid JSON body");
  }
}

async function readTasks() {
  if (!existsSync(DATA_FILE)) {
    return [];
  }

  const file = await readFile(DATA_FILE, "utf8");
  return JSON.parse(file || "[]");
}

async function writeTasks(tasks) {
  const tempFile = `${DATA_FILE}.tmp`;
  await writeFile(tempFile, JSON.stringify(tasks, null, 2));
  await rename(tempFile, DATA_FILE);
}

function createTask(body) {
  const title = String(body.title || "").trim();
  const due = String(body.due || "").trim();
  const priority = String(body.priority || "normal").trim();

  validateTaskInput(title, due, priority);

  return {
    id: randomUUID(),
    title,
    due,
    priority,
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

async function updateTask(id, body) {
  const tasks = await readTasks();
  const task = tasks.find((item) => item.id === id);

  if (!task) {
    throw httpError(404, "Task not found");
  }

  if (typeof body.title !== "undefined") {
    const title = String(body.title).trim();
    if (!title) throw httpError(400, "Title is required");
    task.title = title;
  }

  if (typeof body.due !== "undefined") {
    const due = String(body.due).trim();
    if (!isValidDateInput(due)) throw httpError(400, "Due date must be YYYY-MM-DD");
    task.due = due;
  }

  if (typeof body.priority !== "undefined") {
    const priority = String(body.priority).trim();
    if (!["high", "normal", "low"].includes(priority)) throw httpError(400, "Invalid priority");
    task.priority = priority;
  }

  if (typeof body.done !== "undefined") {
    task.done = Boolean(body.done);
    task.completedAt = task.done ? new Date().toISOString() : null;
  }

  await writeTasks(tasks);
  return task;
}

async function deleteTask(id) {
  const tasks = await readTasks();
  const nextTasks = tasks.filter((task) => task.id !== id);

  if (nextTasks.length === tasks.length) {
    throw httpError(404, "Task not found");
  }

  await writeTasks(nextTasks);
}

function validateTaskInput(title, due, priority) {
  if (!title) throw httpError(400, "Title is required");
  if (!isValidDateInput(due)) throw httpError(400, "Due date must be YYYY-MM-DD");
  if (!["high", "normal", "low"].includes(priority)) throw httpError(400, "Invalid priority");
}

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
