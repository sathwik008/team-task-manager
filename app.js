const state = {
  token: localStorage.getItem("team-task-token") || "",
  user: null,
  dashboard: null,
  projects: [],
  currentProjectId: null,
  currentProject: null,
  authTab: "login",
  sidebarOpen: false
};

/* ── DOM References ── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const authView = $("#authView");
const workspaceView = $("#workspaceView");
const authFeedback = $("#authFeedback");
const loginForm = $("#loginForm");
const signupForm = $("#signupForm");
const tabButtons = $$("[data-auth-tab]");
const welcomeHeading = $("#welcomeHeading");
const userName = $("#userName");
const userEmail = $("#userEmail");
const userAvatar = $("#userAvatar");
const logoutButton = $("#logoutButton");
const dashboardMetrics = $("#dashboardMetrics");
const assignedTasks = $("#assignedTasks");
const projectForm = $("#projectForm");
const projectFormWrap = $("#projectFormWrap");
const newProjectToggle = $("#newProjectToggle");
const projectList = $("#projectList");
const projectDetailPanel = $("#projectDetailPanel");
const emptyProjectState = $("#emptyProjectState");
const projectTitle = $("#projectTitle");
const projectMeta = $("#projectMeta");
const projectRoleBadge = $("#projectRoleBadge");
const projectSummary = $("#projectSummary");
const memberForm = $("#memberForm");
const memberList = $("#memberList");
const taskForm = $("#taskForm");
const taskList = $("#taskList");
const taskAssigneeSelect = $("#taskAssigneeSelect");
const sidebar = $("#sidebar");
const sidebarToggle = $("#sidebarToggle");
const quickActive = $("#quickActive");
const quickTotal = $("#quickTotal");
const dateDisplay = $("#dateDisplay");

/* ── Initialize ── */
initialize();

async function initialize() {
  bindEvents();
  renderDate();

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
    renderAuth("Your session expired. Please sign in again.");
  }
}

function renderDate() {
  if (dateDisplay) {
    const now = new Date();
    dateDisplay.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }
}

/* ── Events ── */
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
    renderAuth("You've been logged out.");
  });

  // Sidebar toggle
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      state.sidebarOpen = !state.sidebarOpen;
      sidebar.classList.toggle("open", state.sidebarOpen);

      // Create / remove backdrop on mobile
      let backdrop = document.querySelector(".sidebar-backdrop");
      if (state.sidebarOpen && window.innerWidth <= 1080) {
        if (!backdrop) {
          backdrop = document.createElement("div");
          backdrop.className = "sidebar-backdrop";
          backdrop.addEventListener("click", () => {
            state.sidebarOpen = false;
            sidebar.classList.remove("open");
            backdrop.remove();
          });
          document.body.appendChild(backdrop);
        }
      } else if (backdrop) {
        backdrop.remove();
      }
    });
  }

  // New project toggle
  if (newProjectToggle) {
    newProjectToggle.addEventListener("click", () => {
      projectFormWrap.classList.toggle("hidden");
      newProjectToggle.textContent = projectFormWrap.classList.contains("hidden") ? "＋" : "✕";
    });
  }

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
      projectFormWrap.classList.add("hidden");
      newProjectToggle.textContent = "＋";
      await loadWorkspace();
    } catch (error) {
      showInlineMessage(projectForm, error.message);
    }
  });

  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentProjectId) return;

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
      renderWorkspace();
    } catch (error) {
      showInlineMessage(memberForm, error.message);
    }
  });

  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.currentProjectId) return;

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

  // Handle project modal form (mobile)
  const projectFormModal = $("#projectFormModal");
  const projectModal = $("#projectModal");
  const closeProjectModal = $("#closeProjectModal");

  if (projectFormModal) {
    projectFormModal.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(projectFormModal);
      try {
        await api("/api/projects", {
          method: "POST",
          body: {
            name: formData.get("name"),
            description: formData.get("description"),
            dueDate: formData.get("dueDate")
          }
        });
        projectFormModal.reset();
        if (projectModal) projectModal.classList.add("hidden");
        await loadWorkspace();
      } catch (error) {
        showInlineMessage(projectFormModal, error.message);
      }
    });
  }

  if (closeProjectModal) {
    closeProjectModal.addEventListener("click", () => {
      if (projectModal) projectModal.classList.add("hidden");
    });
  }
}

/* ── Auth ── */
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

  authFeedback.textContent = message || "Create an account or sign in to get started.";
}

/* ── Data Loading ── */
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

/* ── Render ── */
function renderWorkspace() {
  const name = state.user.name;
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  welcomeHeading.textContent = `Welcome, ${name}`;
  if (userName) userName.textContent = name;
  if (userEmail) userEmail.textContent = state.user.email;
  if (userAvatar) userAvatar.textContent = initials;

  renderQuickStats();
  renderDashboardMetrics();
  renderAssignedTasks();
  renderProjectList();
  renderProjectDetail();
}

function renderQuickStats() {
  const stats = state.dashboard?.stats || {};
  if (quickActive) quickActive.textContent = `${stats.inProgressCount || 0} active`;
  if (quickTotal) quickTotal.textContent = `${stats.totalTasks || 0} tasks`;
}

function renderDashboardMetrics() {
  const stats = state.dashboard?.stats || {};
  const items = [
    { label: "Total Tasks", value: stats.totalTasks || 0, caption: "Across all projects", type: "total" },
    { label: "To Do", value: stats.todoCount || 0, caption: "Not started yet", type: "todo" },
    { label: "In Progress", value: stats.inProgressCount || 0, caption: "Currently active", type: "progress" },
    { label: "Completed", value: stats.doneCount || 0, caption: "Finished items", type: "done" },
    { label: "Overdue", value: stats.overdueCount || 0, caption: "Past due date", type: "overdue" }
  ];

  dashboardMetrics.innerHTML = items.map((item, i) => `
    <article class="metric-card animate-in" style="animation-delay: ${i * 60}ms">
      <span class="metric-label">${item.label}</span>
      <strong class="metric-value">${item.value}</strong>
      <p class="metric-caption">${item.caption}</p>
    </article>
  `).join("");
}

function renderAssignedTasks() {
  const tasks = state.dashboard?.assignedTasks || [];

  if (!tasks.length) {
    assignedTasks.innerHTML = `<div class="empty-card">No tasks are assigned to you yet. Create a project and add your first task!</div>`;
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
    projectList.innerHTML = `<div class="empty-card" style="margin: 0 12px;">No projects yet. Click ＋ to create one.</div>`;
    return;
  }

  projectList.innerHTML = state.projects.map((project) => `
    <button class="project-card ${project.id === state.currentProjectId ? "selected" : ""}" data-project-id="${project.id}" type="button">
      <div class="project-card-row">
        <strong>${escapeHtml(project.name)}</strong>
        <span class="badge subtle">${project.role}</span>
      </div>
      <p>${escapeHtml(project.description || "No description")}</p>
      <div class="project-progress">
        <div class="project-progress-bar"><div style="width:${project.progress}%"></div></div>
        <span>${project.completedCount}/${project.taskCount} done</span>
      </div>
    </button>
  `).join("");

  Array.from(projectList.querySelectorAll("[data-project-id]")).forEach((button) => {
    button.addEventListener("click", async () => {
      const projectId = Number(button.dataset.projectId);
      await loadProjectDetail(projectId);
      renderWorkspace();

      // Close sidebar on mobile
      if (window.innerWidth <= 1080) {
        state.sidebarOpen = false;
        sidebar.classList.remove("open");
        const backdrop = document.querySelector(".sidebar-backdrop");
        if (backdrop) backdrop.remove();
      }
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
  projectMeta.textContent = `${project.description || "No description."} ${project.dueDate ? `· Due ${formatDate(project.dueDate)}` : ""}`;
  projectRoleBadge.textContent = project.currentRole.toUpperCase();

  projectSummary.innerHTML = [
    ["Total", project.metrics.totalTasks],
    ["Done", project.metrics.completedTasks],
    ["Active", project.metrics.inProgressTasks],
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
  memberList.innerHTML = members.map((member) => {
    const initials = member.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
    return `
      <article class="member-card">
        <div class="member-info">
          <div class="member-avatar">${initials}</div>
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <p>${escapeHtml(member.email)}</p>
          </div>
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
    `;
  }).join("");

  if (!isAdmin) return;

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
      if (!confirm("Remove this member from the project?")) return;
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
    taskList.innerHTML = `<div class="empty-card">No tasks yet. Create the first one!</div>`;
    return;
  }

  taskList.innerHTML = tasks.map((task) => `
    <article class="task-card">
      <div class="list-card-row">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <p style="color: var(--ink-muted); font-size: 0.85rem; margin-top: 4px;">${escapeHtml(task.description || "No description")}</p>
        </div>
        <div class="pill-row">
          <span class="pill ${task.status}">${prettyStatus(task.status)}</span>
          <span class="pill priority-${task.priority}">${capitalize(task.priority)}</span>
        </div>
      </div>
      <div class="task-meta">
        <span>${task.assigneeName ? escapeHtml(task.assigneeName) : "Unassigned"}</span>
        <span>${task.dueDate ? formatDate(task.dueDate) : "No deadline"}</span>
        <span>By ${escapeHtml(task.creatorName)}</span>
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

/* ── API ── */
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

/* ── Helpers ── */
function showInlineMessage(form, message) {
  const existing = form.querySelector(".inline-feedback");
  if (existing) existing.remove();

  const feedback = document.createElement("p");
  feedback.className = "inline-feedback";
  feedback.textContent = message;
  form.appendChild(feedback);

  window.setTimeout(() => feedback.remove(), 4000);
}

function prettyStatus(status) {
  return status === "in_progress" ? "In Progress" : capitalize(status.replace("_", " "));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
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
