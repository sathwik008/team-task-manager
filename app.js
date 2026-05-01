const state = {
  token: localStorage.getItem("team-task-token") || "",
  user: null,
  dashboard: null,
  projects: [],
  currentProjectId: null,
  currentProject: null,
  authTab: "login"
};

const authView = document.querySelector("#authView");
const workspaceView = document.querySelector("#workspaceView");
const authFeedback = document.querySelector("#authFeedback");
const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const tabButtons = Array.from(document.querySelectorAll("[data-auth-tab]"));
const welcomeHeading = document.querySelector("#welcomeHeading");
const currentUserBadge = document.querySelector("#currentUserBadge");
const logoutButton = document.querySelector("#logoutButton");
const dashboardMetrics = document.querySelector("#dashboardMetrics");
const assignedTasks = document.querySelector("#assignedTasks");
const projectForm = document.querySelector("#projectForm");
const projectList = document.querySelector("#projectList");
const projectDetailPanel = document.querySelector("#projectDetailPanel");
const emptyProjectState = document.querySelector("#emptyProjectState");
const projectTitle = document.querySelector("#projectTitle");
const projectMeta = document.querySelector("#projectMeta");
const projectRoleBadge = document.querySelector("#projectRoleBadge");
const projectSummary = document.querySelector("#projectSummary");
const memberForm = document.querySelector("#memberForm");
const memberList = document.querySelector("#memberList");
const taskForm = document.querySelector("#taskForm");
const taskList = document.querySelector("#taskList");
const taskAssigneeSelect = document.querySelector("#taskAssigneeSelect");

initialize();

async function initialize() {
  bindEvents();

  if (!state.token) {
    renderAuth();
    return;
  }

  try {
    const response = await api("/api/auth/me");
    state.user = response.user;
    await loadWorkspace();
  } catch {
    clearSession();
    renderAuth("Your session expired. Please log in again.");
  }
}

function bindEvents() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.authTab = button.dataset.authTab;
      renderAuth();
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuthForm(loginForm, "/api/auth/login");
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuthForm(signupForm, "/api/auth/signup");
  });

  logoutButton.addEventListener("click", () => {
    clearSession();
    renderAuth("You’ve been logged out.");
  });

  projectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(projectForm);
    try {
      await api("/api/projects", {
        method: "POST",
        body: {
          name: formData.get("name"),
          description: formData.get("description"),
          dueDate: formData.get("dueDate")
        }
      });
      projectForm.reset();
      await loadWorkspace();
    } catch (error) {
      showInlineMessage(projectForm, error.message);
    }
  });

  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentProjectId) {
      return;
    }

    const formData = new FormData(memberForm);
    try {
      await api(`/api/projects/${state.currentProjectId}/members`, {
        method: "POST",
        body: {
          email: formData.get("email"),
          role: formData.get("role")
        }
      });
      memberForm.reset();
      await loadProjectDetail(state.currentProjectId);
      await loadDashboardOnly();
    } catch (error) {
      showInlineMessage(memberForm, error.message);
    }
  });

  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentProjectId) {
      return;
    }

    const formData = new FormData(taskForm);
    try {
      await api(`/api/projects/${state.currentProjectId}/tasks`, {
        method: "POST",
        body: {
          title: formData.get("title"),
          description: formData.get("description"),
          priority: formData.get("priority"),
          status: formData.get("status"),
          dueDate: formData.get("dueDate"),
          assignedTo: formData.get("assignedTo")
        }
      });
      taskForm.reset();
      taskForm.priority.value = "medium";
      taskForm.status.value = "todo";
      await loadWorkspace(state.currentProjectId);
    } catch (error) {
      showInlineMessage(taskForm, error.message);
    }
  });
}

async function submitAuthForm(form, endpoint) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await api(endpoint, {
      method: "POST",
      body: payload,
      auth: false
    });
    setSession(response);
    form.reset();
    await loadWorkspace();
  } catch (error) {
    renderAuth(error.message);
  }
}

function setSession(response) {
  state.token = response.token;
  state.user = response.user;
  localStorage.setItem("team-task-token", response.token);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.dashboard = null;
  state.projects = [];
  state.currentProjectId = null;
  state.currentProject = null;
  localStorage.removeItem("team-task-token");
}

function renderAuth(message) {
  authView.classList.remove("hidden");
  workspaceView.classList.add("hidden");

  const isLogin = state.authTab === "login";
  loginForm.classList.toggle("hidden", !isLogin);
  signupForm.classList.toggle("hidden", isLogin);

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === state.authTab);
  });

  authFeedback.textContent = message || "Create an account to start a project, or log in if you already have one.";
}

async function loadWorkspace(preferredProjectId) {
  authView.classList.add("hidden");
  workspaceView.classList.remove("hidden");

  await Promise.all([loadDashboardOnly(), loadProjectsOnly()]);

  const fallbackProjectId =
    preferredProjectId ||
    state.currentProjectId ||
    (state.projects[0] ? state.projects[0].id : null);

  if (fallbackProjectId) {
    await loadProjectDetail(fallbackProjectId);
  } else {
    state.currentProjectId = null;
    state.currentProject = null;
  }

  renderWorkspace();
}

async function loadDashboardOnly() {
  state.dashboard = await api("/api/dashboard");
}

async function loadProjectsOnly() {
  const response = await api("/api/projects");
  state.projects = response.projects;
}

async function loadProjectDetail(projectId) {
  state.currentProjectId = projectId;
  const response = await api(`/api/projects/${projectId}`);
  state.currentProject = response.project;
}

function renderWorkspace() {
  welcomeHeading.textContent = `Welcome back, ${state.user.name}`;
  currentUserBadge.textContent = state.user.email;

  renderDashboardMetrics();
  renderAssignedTasks();
  renderProjectList();
  renderProjectDetail();
}

function renderDashboardMetrics() {
  const stats = state.dashboard?.stats || {};
  const items = [
    ["Total Tasks", stats.totalTasks || 0, "All tasks across your projects"],
    ["To Do", stats.todoCount || 0, "Work that has not started yet"],
    ["In Progress", stats.inProgressCount || 0, "Tasks currently moving"],
    ["Completed", stats.doneCount || 0, "Finished delivery items"],
    ["Overdue", stats.overdueCount || 0, "Open tasks past their due date"]
  ];

  dashboardMetrics.innerHTML = items.map(([label, value, caption]) => `
    <article class="metric-card">
      <span class="metric-label">${label}</span>
      <strong class="metric-value">${value}</strong>
      <p class="metric-caption">${caption}</p>
    </article>
  `).join("");
}

function renderAssignedTasks() {
  const tasks = state.dashboard?.assignedTasks || [];

  if (!tasks.length) {
    assignedTasks.innerHTML = `<div class="empty-card">No tasks are assigned to you yet.</div>`;
    return;
  }

  assignedTasks.innerHTML = tasks.map((task) => `
    <article class="list-card">
      <div class="list-card-row">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <p>${escapeHtml(task.projectName)}</p>
        </div>
        <div class="pill-row">
          <span class="pill ${task.status}">${prettyStatus(task.status)}</span>
          <span class="pill priority-${task.priority}">${capitalize(task.priority)}</span>
        </div>
      </div>
      <p class="list-meta">${task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date set"}</p>
    </article>
  `).join("");
}

function renderProjectList() {
  if (!state.projects.length) {
    projectList.innerHTML = `<div class="empty-card">No projects yet. Create your first workspace here.</div>`;
    return;
  }

  projectList.innerHTML = state.projects.map((project) => `
    <button class="project-card ${project.id === state.currentProjectId ? "selected" : ""}" data-project-id="${project.id}" type="button">
      <div class="project-card-row">
        <strong>${escapeHtml(project.name)}</strong>
        <span class="badge subtle">${project.role}</span>
      </div>
      <p>${escapeHtml(project.description || "No project description yet.")}</p>
      <div class="project-progress">
        <div class="project-progress-bar"><div style="width:${project.progress}%"></div></div>
        <span>${project.completedCount}/${project.taskCount} done</span>
      </div>
      <div class="project-foot">
        <span>${project.overdueCount} overdue</span>
        <span>${project.dueDate ? formatDate(project.dueDate) : "No deadline"}</span>
      </div>
    </button>
  `).join("");

  Array.from(projectList.querySelectorAll("[data-project-id]")).forEach((button) => {
    button.addEventListener("click", async () => {
      const projectId = Number(button.dataset.projectId);
      await loadProjectDetail(projectId);
      renderWorkspace();
    });
  });
}

function renderProjectDetail() {
  const project = state.currentProject;

  if (!project) {
    projectDetailPanel.classList.add("hidden");
    emptyProjectState.classList.remove("hidden");
    return;
  }

  projectDetailPanel.classList.remove("hidden");
  emptyProjectState.classList.add("hidden");

  projectTitle.textContent = project.name;
  projectMeta.textContent = `${project.description || "No description provided."} ${project.dueDate ? `Due ${formatDate(project.dueDate)}.` : "No due date."}`;
  projectRoleBadge.textContent = `Role: ${project.currentRole}`;

  projectSummary.innerHTML = [
    ["Total", project.metrics.totalTasks],
    ["Done", project.metrics.completedTasks],
    ["In Progress", project.metrics.inProgressTasks],
    ["Overdue", project.metrics.overdueTasks]
  ].map(([label, value]) => `
    <article class="summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  const isAdmin = project.currentRole === "admin";
  memberForm.classList.toggle("hidden", !isAdmin);
  renderMembers(project.members, isAdmin);
  renderTasks(project.tasks, project.currentRole);
  renderAssigneeOptions(project.members, isAdmin);
}

function renderMembers(members, isAdmin) {
  memberList.innerHTML = members.map((member) => `
    <article class="member-card">
      <div>
        <strong>${escapeHtml(member.name)}</strong>
        <p>${escapeHtml(member.email)}</p>
      </div>
      <div class="member-actions">
        ${isAdmin ? `
          <select data-member-role="${member.id}">
            <option value="admin" ${member.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="member" ${member.role === "member" ? "selected" : ""}>Member</option>
          </select>
          <button class="ghost-button danger" type="button" data-member-remove="${member.id}">Remove</button>
        ` : `<span class="badge subtle">${member.role}</span>`}
      </div>
    </article>
  `).join("");

  if (!isAdmin) {
    return;
  }

  Array.from(memberList.querySelectorAll("[data-member-role]")).forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api(`/api/projects/${state.currentProjectId}/members/${select.dataset.memberRole}`, {
          method: "PATCH",
          body: { role: select.value }
        });
        await loadWorkspace(state.currentProjectId);
      } catch (error) {
        await loadProjectDetail(state.currentProjectId);
        renderProjectDetail();
        alert(error.message);
      }
    });
  });

  Array.from(memberList.querySelectorAll("[data-member-remove]")).forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/projects/${state.currentProjectId}/members/${button.dataset.memberRemove}`, {
          method: "DELETE"
        });
        await loadWorkspace(state.currentProjectId);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderTasks(tasks, role) {
  if (!tasks.length) {
    taskList.innerHTML = `<div class="empty-card">No tasks yet. Create the first one for this project.</div>`;
    return;
  }

  taskList.innerHTML = tasks.map((task) => `
    <article class="task-card">
      <div class="list-card-row">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <p>${escapeHtml(task.description || "No description added.")}</p>
        </div>
        <div class="pill-row">
          <span class="pill ${task.status}">${prettyStatus(task.status)}</span>
          <span class="pill priority-${task.priority}">${capitalize(task.priority)}</span>
        </div>
      </div>
      <div class="task-meta">
        <span>${task.assigneeName ? `Assigned to ${escapeHtml(task.assigneeName)}` : "Unassigned"}</span>
        <span>${task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No deadline"}</span>
        <span>Created by ${escapeHtml(task.creatorName)}</span>
      </div>
      <div class="task-controls">
        <label>
          <span>Status</span>
          <select data-task-status="${task.id}">
            <option value="todo" ${task.status === "todo" ? "selected" : ""}>To Do</option>
            <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>In Progress</option>
            <option value="done" ${task.status === "done" ? "selected" : ""}>Done</option>
          </select>
        </label>
        ${role === "admin" ? `
          <label>
            <span>Assignee</span>
            <select data-task-assignee="${task.id}">
              <option value="">Unassigned</option>
              ${state.currentProject.members.map((member) => `
                <option value="${member.id}" ${task.assigneeId === member.id ? "selected" : ""}>${escapeHtml(member.name)}</option>
              `).join("")}
            </select>
          </label>
        ` : ""}
      </div>
    </article>
  `).join("");

  Array.from(taskList.querySelectorAll("[data-task-status]")).forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api(`/api/tasks/${select.dataset.taskStatus}`, {
          method: "PATCH",
          body: { status: select.value }
        });
        await loadWorkspace(state.currentProjectId);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  Array.from(taskList.querySelectorAll("[data-task-assignee]")).forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api(`/api/tasks/${select.dataset.taskAssignee}`, {
          method: "PATCH",
          body: { assignedTo: select.value || null }
        });
        await loadWorkspace(state.currentProjectId);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderAssigneeOptions(members, isAdmin) {
  const options = [`<option value="">Unassigned</option>`];
  const currentUserId = state.user.id;

  members.forEach((member) => {
    if (isAdmin || member.id === currentUserId) {
      options.push(`<option value="${member.id}">${escapeHtml(member.name)}</option>`);
    }
  });

  taskAssigneeSelect.innerHTML = options.join("");
}

async function api(pathname, { method = "GET", body, auth = true } = {}) {
  const response = await fetch(pathname, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && state.token ? { Authorization: `Bearer ${state.token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function showInlineMessage(form, message) {
  const existing = form.querySelector(".inline-feedback");
  if (existing) {
    existing.remove();
  }

  const feedback = document.createElement("p");
  feedback.className = "inline-feedback";
  feedback.textContent = message;
  form.appendChild(feedback);

  window.setTimeout(() => {
    feedback.remove();
  }, 4000);
}

function prettyStatus(status) {
  return status === "in_progress" ? "In Progress" : capitalize(status.replace("_", " "));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function capitalize(value) {
  return String(value)
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
