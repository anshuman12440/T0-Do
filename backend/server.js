import "dotenv/config";
import { createServer } from "node:http";
import mongoose from "mongoose";

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI environment variable");
  process.exit(1);
}

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
    done: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

const Task = mongoose.model("Task", taskSchema);

await mongoose.connect(MONGODB_URI);

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
        storage: "mongodb",
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
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/tasks") {
      const tasks = await Task.find().sort({ createdAt: -1 }).lean();
      sendJson(response, 200, tasks.map(toClientTask));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/tasks") {
      const task = await Task.create(createTask(await readJsonBody(request)));
      sendJson(response, 201, toClientTask(task));
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/tasks/completed") {
      await Task.deleteMany({ done: true });
      sendJson(response, 200, { ok: true });
      return;
    }

    const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);

    if (taskIdMatch && request.method === "PATCH") {
      const updatedTask = await updateTask(taskIdMatch[1], await readJsonBody(request));
      sendJson(response, 200, toClientTask(updatedTask));
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

function createTask(body) {
  const title = String(body.title || "").trim();
  const due = String(body.due || "").trim();
  const priority = String(body.priority || "normal").trim();

  validateTaskInput(title, due, priority);

  return {
    title,
    due,
    priority,
    done: false,
    completedAt: null
  };
}

async function updateTask(id, body) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(404, "Task not found");
  }

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
    if (!["high", "normal", "low"].includes(priority)) throw httpError(400, "Invalid priority");
    updates.priority = priority;
  }

  if (typeof body.done !== "undefined") {
    updates.done = Boolean(body.done);
    updates.completedAt = updates.done ? new Date() : null;
  }

  const task = await Task.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true
  });

  if (!task) {
    throw httpError(404, "Task not found");
  }

  return task;
}

async function deleteTask(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(404, "Task not found");
  }

  const task = await Task.findByIdAndDelete(id);

  if (!task) {
    throw httpError(404, "Task not found");
  }
}

function toClientTask(task) {
  return {
    id: String(task._id),
    title: task.title,
    due: task.due,
    priority: task.priority,
    done: task.done,
    createdAt: toISOString(task.createdAt),
    completedAt: toISOString(task.completedAt)
  };
}

function toISOString(value) {
  return value ? new Date(value).toISOString() : null;
}

function validateTaskInput(title, due, priority) {
  if (!title) throw httpError(400, "Title is required");
  if (!isValidDateInput(due)) throw httpError(400, "Due date must be YYYY-MM-DD");
  if (!["high", "normal", "low"].includes(priority)) throw httpError(400, "Invalid priority");
}

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
