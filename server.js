const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

loadEnv(path.join(process.cwd(), ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = process.cwd();
const APP_SECRET = process.env.APP_SECRET || "team-task-manager-dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DB_PATH = resolveDatabasePath();
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
initializeDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      return sendEmpty(res, 204);
    }

    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) {
        sendJson(res, 404, { error: "API route not found." });
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 405, { error: "Method not allowed." });
    }

    serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error: error.message || "Unexpected server error."
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Team Task Manager running on http://${HOST}:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});

async function handleApi(req, res, url) {
  const segments = getPathSegments(url.pathname);

  if (req.method === "POST" && matches(segments, ["api", "auth", "signup"])) {
    const body = await readJson(req);
    const user = createUser(body);
    return sendJson(res, 201, issueAuthPayload(user.id));
  }

  if (req.method === "POST" && matches(segments, ["api", "auth", "login"])) {
    const body = await readJson(req);
    const user = verifyUser(body);
    return sendJson(res, 200, issueAuthPayload(user.id));
  }

  if (req.method === "GET" && matches(segments, ["api", "auth", "me"])) {
    const user = requireAuth(req);
    return sendJson(res, 200, { user: sanitizeUser(user) });
  }

  if (req.method === "GET" && matches(segments, ["api", "dashboard"])) {
    const user = requireAuth(req);
    return sendJson(res, 200, buildDashboard(user.id));
  }

  if (req.method === "GET" && matches(segments, ["api", "projects"])) {
    const user = requireAuth(req);
    return sendJson(res, 200, { projects: listProjectsForUser(user.id) });
  }

  if (req.method === "POST" && matches(segments, ["api", "projects"])) {
    const user = requireAuth(req);
    const body = await readJson(req);
    const project = createProject(user.id, body);
    return sendJson(res, 201, { project });
  }

  if (req.method === "GET" && segments[0] === "api" && segments[1] === "projects" && segments.length === 3) {
    const user = requireAuth(req);
    const projectId = asId(segments[2], "project");
    return sendJson(res, 200, { project: getProjectDetails(projectId, user.id) });
  }

  if (req.method === "POST" && segments[0] === "api" && segments[1] === "projects" && segments[3] === "members" && segments.length === 4) {
    const user = requireAuth(req);
    const projectId = asId(segments[2], "project");
    ensureProjectRole(projectId, user.id, ["admin"]);
    const body = await readJson(req);
    const member = addProjectMember(projectId, body);
    return sendJson(res, 201, { member });
  }

  if (req.method === "PATCH" && segments[0] === "api" && segments[1] === "projects" && segments[3] === "members" && segments.length === 5) {
    const user = requireAuth(req);
    const projectId = asId(segments[2], "project");
    const memberUserId = asId(segments[4], "member");
    ensureProjectRole(projectId, user.id, ["admin"]);
    const body = await readJson(req);
    const member = updateProjectMemberRole(projectId, memberUserId, body.role);
    return sendJson(res, 200, { member });
  }

  if (req.method === "DELETE" && segments[0] === "api" && segments[1] === "projects" && segments[3] === "members" && segments.length === 5) {
    const user = requireAuth(req);
    const projectId = asId(segments[2], "project");
    const memberUserId = asId(segments[4], "member");
    ensureProjectRole(projectId, user.id, ["admin"]);
    removeProjectMember(projectId, memberUserId, user.id);
    return sendEmpty(res, 204);
  }

  if (req.method === "POST" && segments[0] === "api" && segments[1] === "projects" && segments[3] === "tasks" && segments.length === 4) {
    const user = requireAuth(req);
    const projectId = asId(segments[2], "project");
    ensureProjectMember(projectId, user.id);
    const body = await readJson(req);
    const task = createTask(projectId, user.id, body);
    return sendJson(res, 201, { task });
  }

  if (req.method === "PATCH" && segments[0] === "api" && segments[1] === "tasks" && segments.length === 3) {
    const user = requireAuth(req);
    const taskId = asId(segments[2], "task");
    const body = await readJson(req);
    const task = updateTask(taskId, user.id, body);
    return sendJson(res, 200, { task });
  }

  return false;
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('todo', 'in_progress', 'done')) DEFAULT 'todo',
      priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
      due_date TEXT,
      assigned_to INTEGER,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
    );
  `);
}

function createUser(body) {
  const name = requireTrimmedString(body.name, "Name", { min: 2, max: 60 });
  const email = normalizeEmail(body.email);
  const password = requirePassword(body.password);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    throw withStatus(new Error("An account with that email already exists."), 409);
  }

  const { salt, hash } = hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, password_salt)
    VALUES (?, ?, ?, ?)
  `).run(name, email, hash, salt);

  return getUserById(Number(result.lastInsertRowid));
}

function verifyUser(body) {
  const email = normalizeEmail(body.email);
  const password = requirePassword(body.password);
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw withStatus(new Error("Invalid email or password."), 401);
  }

  return user;
}

function issueAuthPayload(userId) {
  const user = getUserById(userId);
  return {
    token: createToken({ sub: user.id, exp: Date.now() + TOKEN_TTL_MS }),
    user: sanitizeUser(user)
  };
}

function buildDashboard(userId) {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS totalTasks,
      SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) AS todoCount,
      SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS inProgressCount,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS doneCount,
      SUM(CASE WHEN t.due_date IS NOT NULL AND date(t.due_date) < date('now') AND t.status != 'done' THEN 1 ELSE 0 END) AS overdueCount
    FROM tasks t
    INNER JOIN project_members pm ON pm.project_id = t.project_id
    WHERE pm.user_id = ?
  `).get(userId);

  const mine = db.prepare(`
    SELECT
      t.id,
      t.title,
      t.status,
      t.priority,
      t.due_date AS dueDate,
      p.name AS projectName
    FROM tasks t
    INNER JOIN projects p ON p.id = t.project_id
    WHERE t.assigned_to = ?
    ORDER BY
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    LIMIT 6
  `).all(userId);

  const projects = db.prepare(`
    SELECT
      p.id,
      p.name,
      pm.role,
      COUNT(t.id) AS taskCount,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completedCount
    FROM projects p
    INNER JOIN project_members pm ON pm.project_id = p.id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE pm.user_id = ?
    GROUP BY p.id, p.name, pm.role
    ORDER BY p.created_at DESC
  `).all(userId).map((project) => ({
    ...project,
    progress: project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0
  }));

  return {
    stats: {
      totalTasks: Number(counts.totalTasks || 0),
      todoCount: Number(counts.todoCount || 0),
      inProgressCount: Number(counts.inProgressCount || 0),
      doneCount: Number(counts.doneCount || 0),
      overdueCount: Number(counts.overdueCount || 0)
    },
    assignedTasks: mine,
    projects
  };
}

function listProjectsForUser(userId) {
  return db.prepare(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.due_date AS dueDate,
      pm.role,
      COUNT(t.id) AS taskCount,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS completedCount,
      SUM(CASE WHEN t.due_date IS NOT NULL AND date(t.due_date) < date('now') AND t.status != 'done' THEN 1 ELSE 0 END) AS overdueCount
    FROM projects p
    INNER JOIN project_members pm ON pm.project_id = p.id
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE pm.user_id = ?
    GROUP BY p.id, p.name, p.description, p.due_date, pm.role
    ORDER BY p.created_at DESC
  `).all(userId).map((project) => ({
    ...project,
    taskCount: Number(project.taskCount || 0),
    completedCount: Number(project.completedCount || 0),
    overdueCount: Number(project.overdueCount || 0),
    progress: project.taskCount ? Math.round((project.completedCount / project.taskCount) * 100) : 0
  }));
}

function createProject(userId, body) {
  const name = requireTrimmedString(body.name, "Project name", { min: 3, max: 80 });
  const description = optionalTrimmedString(body.description, { max: 240 });
  const dueDate = optionalDate(body.dueDate);

  const result = db.prepare(`
    INSERT INTO projects (name, description, due_date, created_by)
    VALUES (?, ?, ?, ?)
  `).run(name, description, dueDate, userId);

  const projectId = Number(result.lastInsertRowid);
  db.prepare(`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (?, ?, 'admin')
  `).run(projectId, userId);

  return getProjectSummary(projectId, userId);
}

function getProjectDetails(projectId, userId) {
  const membership = ensureProjectMember(projectId, userId);
  const project = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.due_date AS dueDate,
      p.created_at AS createdAt,
      u.id AS ownerId,
      u.name AS ownerName
    FROM projects p
    INNER JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `).get(projectId);

  if (!project) {
    throw withStatus(new Error("Project not found."), 404);
  }

  const members = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      pm.role,
      pm.joined_at AS joinedAt
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY CASE pm.role WHEN 'admin' THEN 0 ELSE 1 END, u.name COLLATE NOCASE
  `).all(projectId);

  const tasks = db.prepare(`
    SELECT
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_date AS dueDate,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt,
      t.project_id AS projectId,
      creator.id AS creatorId,
      creator.name AS creatorName,
      assignee.id AS assigneeId,
      assignee.name AS assigneeName
    FROM tasks t
    INNER JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    WHERE t.project_id = ?
    ORDER BY
      CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      t.created_at DESC
  `).all(projectId);

  const metrics = {
    totalTasks: tasks.length,
    completedTasks: tasks.filter((task) => task.status === "done").length,
    overdueTasks: tasks.filter((task) => task.dueDate && task.status !== "done" && isPastDate(task.dueDate)).length,
    inProgressTasks: tasks.filter((task) => task.status === "in_progress").length
  };

  return {
    ...project,
    currentRole: membership.role,
    members,
    tasks,
    metrics
  };
}

function addProjectMember(projectId, body) {
  const email = normalizeEmail(body.email);
  const role = parseRole(body.role);
  const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);

  if (!user) {
    throw withStatus(new Error("That user has not signed up yet. Ask them to create an account first."), 404);
  }

  const existing = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, user.id);
  if (existing) {
    throw withStatus(new Error("That user is already on the project."), 409);
  }

  db.prepare(`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(projectId, user.id, role);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role
  };
}

function updateProjectMemberRole(projectId, memberUserId, nextRole) {
  const role = parseRole(nextRole);
  const existing = db.prepare(`
    SELECT pm.role, u.id, u.name, u.email
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? AND pm.user_id = ?
  `).get(projectId, memberUserId);

  if (!existing) {
    throw withStatus(new Error("Member not found on this project."), 404);
  }

  if (existing.role === "admin" && role === "member") {
    const adminCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM project_members
      WHERE project_id = ? AND role = 'admin'
    `).get(projectId);
    if (Number(adminCount.count) <= 1) {
      throw withStatus(new Error("A project must keep at least one admin."), 400);
    }
  }

  db.prepare(`
    UPDATE project_members
    SET role = ?
    WHERE project_id = ? AND user_id = ?
  `).run(role, projectId, memberUserId);

  return {
    id: existing.id,
    name: existing.name,
    email: existing.email,
    role
  };
}

function removeProjectMember(projectId, memberUserId, actingUserId) {
  const existing = db.prepare(`
    SELECT role
    FROM project_members
    WHERE project_id = ? AND user_id = ?
  `).get(projectId, memberUserId);

  if (!existing) {
    throw withStatus(new Error("Member not found on this project."), 404);
  }

  if (existing.role === "admin") {
    const adminCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM project_members
      WHERE project_id = ? AND role = 'admin'
    `).get(projectId);
    if (Number(adminCount.count) <= 1) {
      throw withStatus(new Error("A project must keep at least one admin."), 400);
    }
  }

  db.prepare("UPDATE tasks SET assigned_to = NULL, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND assigned_to = ?").run(projectId, memberUserId);
  db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(projectId, memberUserId);

  if (actingUserId === memberUserId) {
    return;
  }
}

function createTask(projectId, userId, body) {
  const membership = ensureProjectMember(projectId, userId);
  const title = requireTrimmedString(body.title, "Task title", { min: 3, max: 120 });
  const description = optionalTrimmedString(body.description, { max: 300 });
  const status = parseTaskStatus(body.status || "todo");
  const priority = parseTaskPriority(body.priority || "medium");
  const dueDate = optionalDate(body.dueDate);
  const assignedTo = optionalAssignee(projectId, body.assignedTo);

  if (membership.role !== "admin" && assignedTo && assignedTo !== userId) {
    throw withStatus(new Error("Members can only assign tasks to themselves."), 403);
  }

  const result = db.prepare(`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, title, description, status, priority, dueDate, assignedTo, userId);

  return getTaskById(Number(result.lastInsertRowid));
}

function updateTask(taskId, userId, body) {
  const existing = db.prepare(`
    SELECT
      t.*,
      pm.role AS actorRole
    FROM tasks t
    INNER JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = ?
    WHERE t.id = ?
  `).get(userId, taskId);

  if (!existing) {
    throw withStatus(new Error("Task not found, or you do not have access to it."), 404);
  }

  const updates = [];
  const values = [];
  const isAdmin = existing.actorRole === "admin";
  const isAssignee = existing.assigned_to === userId;

  if ("status" in body) {
    if (!isAdmin && !isAssignee) {
      throw withStatus(new Error("Only admins or assignees can update task status."), 403);
    }
    updates.push("status = ?");
    values.push(parseTaskStatus(body.status));
  }

  if ("title" in body || "description" in body || "priority" in body || "dueDate" in body || "assignedTo" in body) {
    if (!isAdmin) {
      throw withStatus(new Error("Only project admins can change task details."), 403);
    }

    if ("title" in body) {
      updates.push("title = ?");
      values.push(requireTrimmedString(body.title, "Task title", { min: 3, max: 120 }));
    }

    if ("description" in body) {
      updates.push("description = ?");
      values.push(optionalTrimmedString(body.description, { max: 300 }));
    }

    if ("priority" in body) {
      updates.push("priority = ?");
      values.push(parseTaskPriority(body.priority));
    }

    if ("dueDate" in body) {
      updates.push("due_date = ?");
      values.push(optionalDate(body.dueDate));
    }

    if ("assignedTo" in body) {
      updates.push("assigned_to = ?");
      values.push(optionalAssignee(existing.project_id, body.assignedTo));
    }
  }

  if (!updates.length) {
    throw withStatus(new Error("No supported task fields were provided."), 400);
  }

  values.push(taskId);
  db.prepare(`
    UPDATE tasks
    SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...values);

  return getTaskById(taskId);
}

function getTaskById(taskId) {
  const task = db.prepare(`
    SELECT
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_date AS dueDate,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt,
      t.project_id AS projectId,
      creator.id AS creatorId,
      creator.name AS creatorName,
      assignee.id AS assigneeId,
      assignee.name AS assigneeName
    FROM tasks t
    INNER JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    WHERE t.id = ?
  `).get(taskId);

  if (!task) {
    throw withStatus(new Error("Task not found."), 404);
  }

  return task;
}

function getProjectSummary(projectId, userId) {
  return listProjectsForUser(userId).find((project) => project.id === projectId);
}

function ensureProjectMember(projectId, userId) {
  const membership = db.prepare(`
    SELECT role
    FROM project_members
    WHERE project_id = ? AND user_id = ?
  `).get(projectId, userId);

  if (!membership) {
    throw withStatus(new Error("You are not a member of that project."), 403);
  }

  return membership;
}

function ensureProjectRole(projectId, userId, roles) {
  const membership = ensureProjectMember(projectId, userId);
  if (!roles.includes(membership.role)) {
    throw withStatus(new Error("You do not have permission to perform that action."), 403);
  }
  return membership;
}

function getUserById(userId) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) {
    throw withStatus(new Error("User not found."), 404);
  }
  return user;
}

function requireAuth(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw withStatus(new Error("Authorization token is required."), 401);
  }

  const payload = verifyToken(match[1]);
  return getUserById(Number(payload.sub));
}

function createToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = signToken(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const [header, payload, signature] = String(token).split(".");
  if (!header || !payload || !signature) {
    throw withStatus(new Error("Invalid token."), 401);
  }

  const expected = signToken(`${header}.${payload}`);
  if (!safeCompare(signature, expected)) {
    throw withStatus(new Error("Invalid token signature."), 401);
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw withStatus(new Error("Invalid token payload."), 401);
  }

  if (!decoded.sub || !decoded.exp || decoded.exp < Date.now()) {
    throw withStatus(new Error("Token has expired. Please log in again."), 401);
  }

  return decoded;
}

function signToken(value) {
  return crypto.createHmac("sha256", APP_SECRET).update(value).digest("base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return safeCompare(actual, expectedHash);
}

function safeCompare(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));
  if (first.length !== second.length) {
    return false;
  }
  return crypto.timingSafeEqual(first, second);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at
  };
}

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function optionalAssignee(projectId, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  const userId = asId(rawValue, "assignee");
  const member = db.prepare(`
    SELECT 1
    FROM project_members
    WHERE project_id = ? AND user_id = ?
  `).get(projectId, userId);

  if (!member) {
    throw withStatus(new Error("Assigned user must be a member of the project."), 400);
  }

  return userId;
}

function parseRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (!["admin", "member"].includes(role)) {
    throw withStatus(new Error("Role must be either admin or member."), 400);
  }
  return role;
}

function parseTaskStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!["todo", "in_progress", "done"].includes(status)) {
    throw withStatus(new Error("Status must be todo, in_progress, or done."), 400);
  }
  return status;
}

function parseTaskPriority(value) {
  const priority = String(value || "").trim().toLowerCase();
  if (!["low", "medium", "high"].includes(priority)) {
    throw withStatus(new Error("Priority must be low, medium, or high."), 400);
  }
  return priority;
}

function optionalDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw withStatus(new Error("Dates must be in YYYY-MM-DD format."), 400);
  }

  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw withStatus(new Error("Invalid date supplied."), 400);
  }

  return raw;
}

function isPastDate(dateString) {
  return new Date(`${dateString}T00:00:00Z`).getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime();
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw withStatus(new Error("A valid email address is required."), 400);
  }
  return email;
}

function requirePassword(value) {
  const password = String(value || "");
  if (password.length < 6) {
    throw withStatus(new Error("Password must be at least 6 characters long."), 400);
  }
  return password;
}

function requireTrimmedString(value, label, { min = 1, max = 255 } = {}) {
  const normalized = String(value || "").trim();
  if (normalized.length < min) {
    throw withStatus(new Error(`${label} must be at least ${min} characters.`), 400);
  }
  if (normalized.length > max) {
    throw withStatus(new Error(`${label} must be ${max} characters or fewer.`), 400);
  }
  return normalized;
}

function optionalTrimmedString(value, { max = 255 } = {}) {
  if (value === null || value === undefined) {
    return "";
  }
  const normalized = String(value).trim();
  if (normalized.length > max) {
    throw withStatus(new Error(`Text must be ${max} characters or fewer.`), 400);
  }
  return normalized;
}

function asId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw withStatus(new Error(`Invalid ${label} id.`), 400);
  }
  return id;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
  return true;
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode);
  res.end();
  return true;
}

function serveStatic(requestPath, res, headOnly) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const absolutePath = path.join(ROOT, path.normalize(safePath).replace(/^([.][.][\/\\])+/, ""));

  if (!absolutePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const type = MIME_TYPES[extension] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-cache, must-revalidate"
  });

  if (headOnly) {
    res.end();
    return;
  }

  fs.createReadStream(absolutePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(withStatus(new Error("Request body too large."), 413));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(withStatus(new Error("Invalid JSON body."), 400));
      }
    });
    req.on("error", reject);
  });
}

function matches(actual, expected) {
  return actual.length === expected.length && expected.every((segment, index) => actual[index] === segment);
}

function getPathSegments(pathname) {
  return pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

function resolveDatabasePath() {
  const explicitPath = String(process.env.DATABASE_PATH || "").trim();
  if (explicitPath) {
    return path.isAbsolute(explicitPath) ? explicitPath : path.join(ROOT, explicitPath);
  }

  const railwayVolume = String(process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
  if (railwayVolume) {
    return path.join(railwayVolume, "team-task-manager.sqlite");
  }

  return path.join(ROOT, "data", "team-task-manager.sqlite");
}

function withStatus(error, statusCode) {
  error.statusCode = statusCode;
  return error;
}
