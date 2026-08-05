import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import mongoose from "mongoose";

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_DIR = new URL("./database/", import.meta.url);
const FILE_STORE_PATH = new URL("./database/tasks.json", import.meta.url);
const TEMP_FILE_STORE_PATH = new URL("./database/tasks.json.tmp", import.meta.url);

let storageMode = "file";
let Task = null;

const subtaskSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    done: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false,
    versionKey: false
  }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    due: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: isValidDateInput,
        message: "Due date must be YYYY-MM-DD"
      }
    },
    priority: {
      type: String,
      enum: ["high", "normal", "low"],
      default: "normal",
      trim: true
    },
    status: {
      type: String,
      enum: ["todo", "in-progress", "done"],
      default: "todo",
      trim: true
    },
    done: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date,
      default: null
    },
    subtasks: {
      type: [subtaskSchema],
      default: []
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

if (MONGODB_URI) {
  Task = mongoose.models.Task || mongoose.model("Task", taskSchema);

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    storageMode = "mongodb";
  } catch (error) {
    console.warn(`MongoDB unavailable, using local file storage: ${error.message}`);
  }
} else {
  console.warn("Missing MONGODB_URI, using local file storage.");
}

if (storageMode === "file") {
  await ensureFileStore();
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/") {
      sendJson(response, 200, {
        name: "Daily Track Todo API",
        status: "running",
        storage: storageMode,
        endpoints: [
          "GET /health",
          "GET /api/tasks",
          "POST /api/tasks",
          "PATCH /api/tasks/:id",
          "DELETE /api/tasks/:id",
          "DELETE /api/tasks/completed"
        ]
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        storage: storageMode,
        database: mongoose.connection.readyState === 1 ? "connected" : "unavailable"
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/tasks") {
      sendJson(response, 200, await listTasks());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/tasks") {
      const task = await addTask(createTask(await readJsonBody(request)));
      sendJson(response, 201, task);
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/tasks/completed") {
      await deleteCompletedTasks();
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
    const status = error.status || (error.name === "ValidationError" ? 400 : 500);
    sendJson(response, status, { message: getErrorMessage(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Todo API running on http://localhost:${PORT} using ${storageMode}`);
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

async function listTasks() {
  if (storageMode === "mongodb") {
    const tasks = await Task.find().sort({ createdAt: -1 }).lean();
    return tasks.map(toClientTask);
  }

  const tasks = await readFileTasks();
  return tasks.map(toClientTask).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function addTask(taskData) {
  if (storageMode === "mongodb") {
    return toClientTask(await Task.create(taskData));
  }

  const tasks = await readFileTasks();
  const task = {
    id: randomUUID(),
    ...taskData,
    createdAt: new Date().toISOString()
  };

  tasks.unshift(task);
  await writeFileTasks(tasks);
  return toClientTask(task);
}

function createTask(body) {
  const title = String(body.title || "").trim();
  const due = String(body.due || "").trim();
  const priority = String(body.priority || "normal").trim();

  validateTaskInput(title, due, priority);

  return {
    title,
    due,
    priority,
    status: "todo",
    done: false,
    completedAt: null,
    subtasks: []
  };
}

async function updateTask(id, body) {
  const updates = getTaskUpdates(body);

  if (storageMode === "mongodb") {
    if (!mongoose.isValidObjectId(id)) {
      throw httpError(404, "Task not found");
    }

    const task = await Task.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!task) {
      throw httpError(404, "Task not found");
    }

    return toClientTask(task);
  }

  const tasks = await readFileTasks();
  const taskIndex = tasks.findIndex((task) => task.id === id);

  if (taskIndex === -1) {
    throw httpError(404, "Task not found");
  }

  tasks[taskIndex] = normalizeStoredTask({
    ...tasks[taskIndex],
    ...updates
  });
  await writeFileTasks(tasks);
  return toClientTask(tasks[taskIndex]);
}

function getTaskUpdates(body) {
  const updates = {};

  if (typeof body.title !== "undefined") {
    const title = String(body.title).trim();
    if (!title) throw httpError(400, "Title is required");
    updates.title = title;
  }

  if (typeof body.due !== "undefined") {
    const due = String(body.due).trim();
    if (!isValidDateInput(due)) throw httpError(400, "Due date must be YYYY-MM-DD");
    updates.due = due;
  }

  if (typeof body.priority !== "undefined") {
    const priority = String(body.priority).trim();
    if (!isValidPriority(priority)) throw httpError(400, "Invalid priority");
    updates.priority = priority;
  }

  if (typeof body.status !== "undefined") {
    const status = String(body.status).trim();
    if (!isValidStatus(status)) throw httpError(400, "Invalid status");
    updates.status = status;
    updates.done = status === "done";
    updates.completedAt = updates.done ? new Date() : null;
  }

  if (typeof body.done !== "undefined") {
    updates.done = Boolean(body.done);
    updates.status = updates.done ? "done" : "todo";
    updates.completedAt = updates.done ? new Date() : null;
  }

  if (typeof body.subtasks !== "undefined") {
    updates.subtasks = normalizeSubtasks(body.subtasks);
  }

  return updates;
}

async function deleteTask(id) {
  if (storageMode === "mongodb") {
    if (!mongoose.isValidObjectId(id)) {
      throw httpError(404, "Task not found");
    }

    const task = await Task.findByIdAndDelete(id);

    if (!task) {
      throw httpError(404, "Task not found");
    }
    return;
  }

  const tasks = await readFileTasks();
  const nextTasks = tasks.filter((task) => task.id !== id);

  if (nextTasks.length === tasks.length) {
    throw httpError(404, "Task not found");
  }

  await writeFileTasks(nextTasks);
}

async function deleteCompletedTasks() {
  if (storageMode === "mongodb") {
    await Task.deleteMany({ $or: [{ done: true }, { status: "done" }] });
    return;
  }

  const tasks = await readFileTasks();
  await writeFileTasks(tasks.filter((task) => !task.done && task.status !== "done"));
}

async function ensureFileStore() {
  await mkdir(DATABASE_DIR, { recursive: true });

  try {
    await readFile(FILE_STORE_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(FILE_STORE_PATH, "[]\n");
  }
}

async function readFileTasks() {
  try {
    const contents = await readFile(FILE_STORE_PATH, "utf8");
    const tasks = JSON.parse(contents);
    return Array.isArray(tasks) ? tasks.map(normalizeStoredTask) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeFileTasks(tasks) {
  await writeFile(TEMP_FILE_STORE_PATH, `${JSON.stringify(tasks.map(normalizeStoredTask), null, 2)}\n`);
  await rename(TEMP_FILE_STORE_PATH, FILE_STORE_PATH);
}

function normalizeStoredTask(task) {
  const status = isValidStatus(task.status) ? task.status : task.done ? "done" : "todo";

  return {
    id: String(task.id || task._id || randomUUID()),
    title: String(task.title || "").trim(),
    due: isValidDateInput(task.due) ? task.due : toDateInputValue(new Date()),
    priority: isValidPriority(task.priority) ? task.priority : "normal",
    status,
    done: status === "done",
    createdAt: toISOString(task.createdAt) || new Date().toISOString(),
    completedAt: status === "done" ? toISOString(task.completedAt) || new Date().toISOString() : null,
    subtasks: normalizeSubtasks(task.subtasks)
  };
}

function toClientTask(task) {
  const status = isValidStatus(task.status) ? task.status : task.done ? "done" : "todo";

  return {
    id: String(task._id || task.id),
    title: task.title,
    due: task.due,
    priority: task.priority,
    status,
    done: status === "done",
    createdAt: toISOString(task.createdAt),
    completedAt: toISOString(task.completedAt),
    subtasks: normalizeSubtasks(task.subtasks)
  };
}

function toISOString(value) {
  return value ? new Date(value).toISOString() : null;
}

function normalizeSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) return [];

  return subtasks
    .map((subtask) => {
      const title = String(subtask?.title || "").trim();
      if (!title) return null;

      return {
        id: String(subtask.id || randomUUID()),
        title,
        done: Boolean(subtask.done),
        createdAt: toISOString(subtask.createdAt) || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function validateTaskInput(title, due, priority) {
  if (!title) throw httpError(400, "Title is required");
  if (!isValidDateInput(due)) throw httpError(400, "Due date must be YYYY-MM-DD");
  if (!isValidPriority(priority)) throw httpError(400, "Invalid priority");
}

function isValidPriority(priority) {
  return ["high", "normal", "low"].includes(priority);
}

function isValidStatus(status) {
  return ["todo", "in-progress", "done"].includes(status);
}

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateInputValue(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function getErrorMessage(error) {
  if (error.name === "ValidationError") {
    return Object.values(error.errors).map((item) => item.message).join(", ");
  }

  return error.message || "Server error";
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}