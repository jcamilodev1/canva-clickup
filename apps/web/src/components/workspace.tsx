"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { ProjectSettings } from "@/components/project-settings";
import { TaskDrawer, type TaskDraft } from "@/components/task-drawer";
import { api } from "@/lib/api";
import { defaultBoardSettings, defaultStatuses, type BoardSettings, type Member, type Overview, type Priority, type Project, type ProjectInput, type ProjectUpdate, type Status, type StatusConfig, type Task, type TaskInput } from "@/types";

const priorityLabel: Record<Priority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

function statusTextColor(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#151715" : "#FFFFFF";
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function isLate(value: string | null, status: Status) {
  if (!value || status === "done") return false;
  return new Date(`${value}T23:59:59`) < new Date();
}

export function Workspace() {
  const [section, setSection] = useState<"command" | "my-work" | "reports">("my-work");
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeProjects = projects.filter((project) => !project.archived_at);
  const archivedProjects = projects.filter((project) => project.archived_at);
  const currentProject =
    projects.find((project) => project.id === projectId) ?? activeProjects[0] ?? projects[0];
  const assignableMembers = currentProject?.members?.length ? currentProject.members : members;
  const currentMember = members.find((member) => member.email === "juan@orbit.dev") ?? members[0];
  const boardSettings = { ...defaultBoardSettings, ...currentProject?.board_settings };
  const statuses = boardSettings.statuses?.length ? boardSettings.statuses : defaultStatuses;
  const myWorkTasks = workspaceTasks.filter(
    (task) => task.assignee?.id === currentMember?.id && !task.archived_at,
  );

  async function loadWorkspace(preferredProjectId?: string) {
    try {
      setError("");
      const [projectData, memberData, overviewData, workspaceTaskData] = await Promise.all([
        api.projects(true),
        api.members(),
        api.overview(),
        api.tasks(),
      ]);
      setProjects(projectData);
      setMembers(memberData);
      setOverview(overviewData);
      setWorkspaceTasks(workspaceTaskData);
      const requestedId = preferredProjectId || projectId;
      const selectedId =
        projectData.find((project) => project.id === requestedId)?.id ||
        projectData.find((project) => !project.archived_at)?.id ||
        projectData[0]?.id;
      if (selectedId) {
        setProjectId(selectedId);
        const [taskData, allTaskData] = await Promise.all([
          api.tasks(selectedId, showArchivedTasks),
          api.tasks(selectedId, false, true),
        ]);
        setTasks(taskData);
        setProjectTasks(allTaskData);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo conectar con el backend");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeProject(id: string) {
    setSection("command");
    setProjectId(id);
    setSidebarOpen(false);
    try {
      const [taskData, allTaskData] = await Promise.all([
        api.tasks(id, showArchivedTasks),
        api.tasks(id, false, true),
      ]);
      setTasks(taskData);
      setProjectTasks(allTaskData);
      setSelectedTask(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar las tareas");
    }
  }

  const visibleTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesSearch =
        !term ||
        task.title.toLowerCase().includes(term) ||
        task.public_id.toLowerCase().includes(term) ||
        task.labels.some((label) => label.toLowerCase().includes(term));
      return matchesSearch && (priority === "all" || task.priority === priority);
    });
  }, [priority, search, tasks]);

  async function refreshSummaries() {
    const [projectData, overviewData, workspaceTaskData] = await Promise.all([
      api.projects(true),
      api.overview(),
      api.tasks(),
    ]);
    setProjects(projectData);
    setOverview(overviewData);
    setWorkspaceTasks(workspaceTaskData);
  }

  function navigateSection(nextSection: "command" | "my-work" | "reports") {
    setSection(nextSection);
    setSelectedTask(null);
    setSidebarOpen(false);
    setSearch("");
  }

  async function openWorkspaceTask(task: Task) {
    setProjectId(task.project_id);
    const [taskData, allTaskData, freshTask] = await Promise.all([
      api.tasks(task.project_id, showArchivedTasks),
      api.tasks(task.project_id, false, true),
      api.task(task.id),
    ]);
    setTasks(taskData);
    setProjectTasks(allTaskData);
    setSelectedTask(freshTask);
  }

  function syncTask(updated: Task) {
    setTasks((items) => {
      const shouldShow = showArchivedTasks || !updated.archived_at;
      if (!shouldShow) return items.filter((item) => item.id !== updated.id);
      return items.some((item) => item.id === updated.id)
        ? items.map((item) => (item.id === updated.id ? updated : item))
        : [...items, updated];
    });
    setProjectTasks((items) =>
      items.some((item) => item.id === updated.id)
        ? items.map((item) => (item.id === updated.id ? updated : item))
        : [...items, updated],
    );
    setSelectedTask((current) => (current?.id === updated.id ? updated : current));
  }

  async function reloadCurrentTasks() {
    if (!projectId) return;
    const [taskData, allTaskData] = await Promise.all([
      api.tasks(projectId, showArchivedTasks),
      api.tasks(projectId, false, true),
    ]);
    setTasks(taskData);
    setProjectTasks(allTaskData);
  }

  async function handleMove(task: Task, status: Status, position = 0): Promise<Task> {
    try {
      const updated = await api.moveTask(task.id, status, position, task.version);
      await Promise.all([reloadCurrentTasks(), refreshSummaries()]);
      if (selectedTask?.id === updated.id) setSelectedTask(updated);
      return updated;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo mover la tarea");
      throw caught;
    }
  }

  async function handleCreate(payload: TaskInput) {
    const created = await api.createTask(payload);
    await Promise.all([reloadCurrentTasks(), refreshSummaries()]);
    setIsCreating(false);
    setSelectedTask(created);
  }

  async function handleCreateProject(payload: ProjectInput) {
    const created = await api.createProject({
      ...payload,
      member_ids: payload.member_ids?.length ? payload.member_ids : members.map((member) => member.id),
    });
    setProjectId(created.id);
    setTasks([]);
    setProjectTasks([]);
    setSelectedTask(null);
    await refreshSummaries();
    setIsCreatingProject(false);
    setSidebarOpen(false);
  }

  async function handleSaveTask(task: Task, draft: TaskDraft): Promise<Task> {
    let current = task;
    if (draft.status !== task.status) {
      current = await api.moveTask(task.id, draft.status, 0, task.version);
    }
    const updated = await api.updateTask(current.id, {
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      due_date: draft.due_date,
      estimate: draft.estimate,
      assignee_id: draft.assignee_id,
      labels: draft.labels,
      version: current.version,
    });
    syncTask(updated);
    await Promise.all([reloadCurrentTasks(), refreshSummaries()]);
    setSelectedTask(updated);
    return updated;
  }

  async function handleSaveProject(id: string, payload: ProjectUpdate) {
    const updated = await api.updateProject(id, payload);
    setProjects((items) => items.map((project) => (project.id === id ? updated : project)));
    setIsEditingProject(false);
    await Promise.all([reloadCurrentTasks(), refreshSummaries()]);
  }

  async function handleArchiveProject(project: Project) {
    await api.archiveProject(project.id);
    setIsEditingProject(false);
    const nextProject = activeProjects.find((candidate) => candidate.id !== project.id);
    await loadWorkspace(nextProject?.id);
  }

  async function handleRestoreProject(project: Project) {
    await api.restoreProject(project.id);
    setIsEditingProject(false);
    await loadWorkspace(project.id);
  }

  async function handleDeleteProject(project: Project, confirmationKey: string) {
    await api.deleteProject(project.id, confirmationKey);
    setIsEditingProject(false);
    const nextProject = activeProjects.find((candidate) => candidate.id !== project.id);
    await loadWorkspace(nextProject?.id);
  }

  async function handleCreateSubtask(task: Task, title: string): Promise<Task> {
    await api.createTask({
      project_id: task.project_id,
      parent_id: task.id,
      title,
      status: "todo",
      priority: task.priority,
    });
    const updated = await api.task(task.id);
    syncTask(updated);
    await Promise.all([reloadCurrentTasks(), refreshSummaries()]);
    return updated;
  }

  async function handleArchiveTask(task: Task) {
    const updated = await api.archiveTask(task);
    if (showArchivedTasks) syncTask(updated);
    else {
      setTasks((items) => items.filter((item) => item.id !== task.id));
      setSelectedTask(null);
    }
    await refreshSummaries();
  }

  async function handleRestoreTask(task: Task) {
    const updated = await api.restoreTask(task);
    syncTask(updated);
    await refreshSummaries();
  }

  async function handleDeleteTask(task: Task) {
    await api.deleteTask(task);
    setTasks((items) => items.filter((item) => item.id !== task.id));
    setProjectTasks((items) => items.filter((item) => item.id !== task.id));
    setSelectedTask(null);
    await refreshSummaries();
  }

  async function toggleArchivedTasks() {
    const next = !showArchivedTasks;
    setShowArchivedTasks(next);
    if (projectId) setTasks(await api.tasks(projectId, next));
  }

  async function handleTaskMutation(action: () => Promise<Task>): Promise<Task> {
    const updated = await action();
    syncTask(updated);
    return updated;
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand__mark"><span>O</span></div>
          <div><strong>ORBIT</strong><small>WORK OPERATING SYSTEM</small></div>
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          <button className={section === "my-work" ? "nav-item nav-item--active" : "nav-item"} onClick={() => navigateSection("my-work")}><Icon name="check" />Mi trabajo <span className="nav-count">{myWorkTasks.length}</span></button>
          <button className={section === "reports" ? "nav-item nav-item--active" : "nav-item"} onClick={() => navigateSection("reports")}><Icon name="pulse" />Reportes</button>
        </nav>

        <div className="sidebar-section">
          <div className="section-label"><span>Proyectos</span><button aria-label="Crear proyecto" onClick={() => setIsCreatingProject(true)}><Icon name="plus" /></button></div>
          <div className="project-list">
            {activeProjects.map((project) => (
              <button key={project.id} className={`project-link ${project.id === projectId ? "project-link--active" : ""}`} onClick={() => void changeProject(project.id)}>
                <span className="project-sigil" style={{ "--project-color": project.color } as React.CSSProperties}>{project.key.slice(0, 2)}</span>
                <span><strong>{project.name}</strong><small>{project.client}</small></span>
                <span className="project-total">{project.task_count}</span>
              </button>
            ))}
            {archivedProjects.length > 0 && <div className="archived-projects-label">Archivados · {archivedProjects.length}</div>}
            {archivedProjects.map((project) => (
              <button key={project.id} className={`project-link project-link--archived ${project.id === projectId ? "project-link--active" : ""}`} onClick={() => void changeProject(project.id)}>
                <span className="project-sigil" style={{ "--project-color": project.color } as React.CSSProperties}>{project.key.slice(0, 2)}</span>
                <span><strong>{project.name}</strong><small>{project.client}</small></span>
                <span className="project-total">AR</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="mcp-status"><span className="signal"/><div><strong>MCP conectado</strong><small>8 tools · 2 resources</small></div><Icon name="bolt" /></div>
          <button className="profile"><span className="avatar avatar--me">JR</span><span><strong>Juan Rojas</strong><small>Administrador</small></span><Icon name="more" /></button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú"><Icon name="menu" /></button>
          <div className="breadcrumbs"><span>{section === "command" ? "Proyectos" : "Orbit"}</span><Icon name="arrow"/><strong>{section === "command" ? currentProject?.name ?? "Cargando" : section === "my-work" ? "Mi trabajo" : "Reportes"}</strong></div>
          {section !== "reports" && <label className="global-search"><Icon name="search"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={section === "my-work" ? "Buscar en mis tareas…" : "Buscar tarea, ID o etiqueta…"}/><kbd>⌘ K</kbd></label>}
          <button className="icon-button" aria-label="Mensajes"><Icon name="message"/><span className="unread"/></button>
          {section === "command" && <button className="create-button" onClick={() => setIsCreating(true)} disabled={Boolean(currentProject?.archived_at)}><Icon name="plus"/>Nueva tarea</button>}
        </header>

        {error && <div className="workspace-error"><div className="error-banner"><Icon name="warning"/><span>{error}. Verifica que FastAPI esté ejecutándose en el puerto 8000.</span><button onClick={() => setError("")}><Icon name="close"/></button></div></div>}

        {section === "command" ? <>
          <div className="project-head">
            <div className="eyebrow"><span className="eyebrow-line"/>{currentProject?.archived_at ? "PROYECTO ARCHIVADO" : "PROYECTO ACTIVO"} · {currentProject?.key}</div>
            <div className="project-title-row">
              <div><h1>{currentProject?.name ?? "Tu operación"}</h1><p>{currentProject?.description ?? "Organiza el trabajo del equipo."}</p></div>
              <div className="project-head-actions"><div className="head-avatars">{assignableMembers.slice(0, 4).map((member) => <span key={member.id} className="avatar" title={member.name} style={{ "--avatar-color": member.color } as React.CSSProperties}>{member.initials}</span>)}</div><button className="project-settings-button" onClick={() => setIsEditingProject(true)}><Icon name="more"/>Configurar</button></div>
            </div>

            <div className="metrics-strip">
              <Metric label="Avance" value={`${currentProject?.task_count ? Math.round((currentProject.completed_count / currentProject.task_count) * 100) : 0}%`} detail={`${currentProject?.completed_count ?? 0} de ${currentProject?.task_count ?? 0} terminadas`} accent />
              <Metric label="En movimiento" value={String(tasks.filter((task) => ["in_progress", "review"].includes(task.status)).length)} detail="Trabajo activo" />
              <Metric label="Bloqueos" value={String(tasks.filter((task) => task.status === "blocked").length)} detail="Requieren atención" warning />
              <Metric label="Foco global" value={`${overview?.focus_score ?? 0}`} detail="Índice de entrega" />
            </div>
          </div>

          <div className="toolbar">
            <div className="view-switcher"><button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><Icon name="board"/>Tablero</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><Icon name="list"/>Lista</button></div>
            <div className="toolbar-actions">
              <button className={showArchivedTasks ? "archive-toggle archive-toggle--active" : "archive-toggle"} onClick={() => void toggleArchivedTasks()}>Archivadas</button>
              <label className="priority-filter"><Icon name="filter"/><select value={priority} onChange={(event) => setPriority(event.target.value as Priority | "all")}><option value="all">Toda prioridad</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select></label>
              <span className="result-count">{visibleTasks.length} tareas</span>
            </div>
          </div>

          <div className="work-area">
            {loading ? <LoadingBoard /> : view === "board" ? (
              <Board tasks={visibleTasks} statuses={statuses} boardSettings={boardSettings} onSelect={setSelectedTask} onMove={handleMove} onCreate={() => setIsCreating(true)} />
            ) : (
              <TaskList tasks={visibleTasks} statuses={statuses} onSelect={setSelectedTask} onMove={handleMove} />
            )}
          </div>
        </> : section === "my-work" ? (
          <MyWorkView member={currentMember} projects={projects} tasks={myWorkTasks} search={search} onSelect={(task) => void openWorkspaceTask(task)} />
        ) : (
          <ReportsView projects={activeProjects} tasks={workspaceTasks} overview={overview} />
        )}
      </section>

      {selectedTask && <TaskDrawer
        task={selectedTask}
        statuses={statuses}
        members={assignableMembers}
        projectTasks={projectTasks}
        onClose={() => setSelectedTask(null)}
        onSave={handleSaveTask}
        onCreateSubtask={handleCreateSubtask}
        onAddChecklist={(task, body) => handleTaskMutation(() => api.addChecklistItem(task, body))}
        onToggleChecklist={(task, itemId, isDone) => handleTaskMutation(() => api.updateChecklistItem(task, itemId, { is_done: isDone }))}
        onDeleteChecklist={(task, itemId) => handleTaskMutation(() => api.deleteChecklistItem(task, itemId))}
        onAddDependency={(task, dependencyId) => handleTaskMutation(() => api.addDependency(task, dependencyId))}
        onDeleteDependency={(task, dependencyId) => handleTaskMutation(() => api.deleteDependency(task, dependencyId))}
        onArchive={handleArchiveTask}
        onRestore={handleRestoreTask}
        onDelete={handleDeleteTask}
      />}
      {isCreating && currentProject && !currentProject.archived_at && <CreateTaskModal project={currentProject} statuses={statuses} members={assignableMembers} onClose={() => setIsCreating(false)} onCreate={handleCreate} />}
      {isCreatingProject && <CreateProjectModal onClose={() => setIsCreatingProject(false)} onCreate={handleCreateProject} />}
      {isEditingProject && currentProject && <ProjectSettings
        key={currentProject.id}
        project={currentProject}
        members={members}
        onClose={() => setIsEditingProject(false)}
        onSave={handleSaveProject}
        onArchive={handleArchiveProject}
        onRestore={handleRestoreProject}
        onDelete={handleDeleteProject}
      />}
    </main>
  );
}

function Metric({ label, value, detail, accent, warning }: { label: string; value: string; detail: string; accent?: boolean; warning?: boolean }) {
  return <div className={`metric ${accent ? "metric--accent" : ""} ${warning ? "metric--warning" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function MyWorkView({ member, projects, tasks, search, onSelect }: { member?: Member; projects: Project[]; tasks: Task[]; search: string; onSelect: (task: Task) => void }) {
  const [filter, setFilter] = useState<"active" | "due" | "blocked" | "done">("active");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const projectStatuses = new Map<string, StatusConfig[]>();
  for (const project of projects) {
    projectStatuses.set(project.id, project.board_settings?.statuses?.length ? project.board_settings.statuses : defaultStatuses);
  }
  function statusLabel(status: string, projectId: string): string {
    const list = projectStatuses.get(projectId) ?? defaultStatuses;
    return list.find((item) => item.id === status)?.label ?? "Sin estado";
  }
  function statusColor(status: string, projectId: string): StatusConfig | undefined {
    const list = projectStatuses.get(projectId) ?? defaultStatuses;
    return list.find((item) => item.id === status);
  }
  const activeTasks = tasks.filter((task) => task.status !== "done");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const dueTasks = activeTasks.filter((task) => task.due_date && new Date(`${task.due_date}T12:00:00`) <= new Date(today.getTime() + 7 * 86_400_000));
  const blockedTasks = activeTasks.filter((task) => task.status === "blocked" || task.dependencies.length > 0);
  const term = search.trim().toLocaleLowerCase("es");
  const filteredTasks = tasks
    .filter((task) => {
      if (filter === "active") return task.status !== "done";
      if (filter === "done") return task.status === "done";
      if (filter === "blocked") return task.status === "blocked" || task.dependencies.length > 0;
      return Boolean(task.due_date) && task.status !== "done" && new Date(`${task.due_date}T12:00:00`) <= new Date(today.getTime() + 7 * 86_400_000);
    })
    .filter((task) => !term || [task.title, task.public_id, task.project_name, ...task.labels].some((value) => value.toLocaleLowerCase("es").includes(term)))
    .sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  const completedPercent = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  return <div className="special-view my-work-view">
    <section className="my-work-hero">
      <div>
        <span className="special-eyebrow">COLA PERSONAL · {member?.initials ?? "YO"}</span>
        <h1>Lo que necesita<br/><em>tu atención.</em></h1>
        <p>Una vista enfocada del trabajo que tienes asignado en todos los proyectos activos.</p>
      </div>
      <div className="my-work-identity">
        <span className="my-work-avatar" style={{ "--avatar-color": member?.color ?? "#B8F23D" } as React.CSSProperties}>{member?.initials ?? "—"}</span>
        <div><small>RESPONSABLE</small><strong>{member?.name ?? "Sin usuario"}</strong><span>{member?.email}</span></div>
      </div>
    </section>

    <div className="personal-metrics">
      <Metric label="Abiertas" value={String(activeTasks.length)} detail="En tu cola personal" accent />
      <Metric label="Próximas" value={String(dueTasks.length)} detail="Vencen en 7 días" />
      <Metric label="Con bloqueos" value={String(blockedTasks.length)} detail="Dependencias o estado" warning />
      <Metric label="Completado" value={`${completedPercent}%`} detail={`${doneTasks.length} tareas cerradas`} />
    </div>

    <div className="personal-toolbar">
      <div className="personal-filters" aria-label="Filtrar mi trabajo">
        <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Abiertas <span>{activeTasks.length}</span></button>
        <button className={filter === "due" ? "active" : ""} onClick={() => setFilter("due")}>Próximas <span>{dueTasks.length}</span></button>
        <button className={filter === "blocked" ? "active" : ""} onClick={() => setFilter("blocked")}>Bloqueadas <span>{blockedTasks.length}</span></button>
        <button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Cerradas <span>{doneTasks.length}</span></button>
      </div>
      <span className="personal-result-count">{filteredTasks.length} resultados</span>
    </div>

    <div className="my-work-layout">
      <section className="personal-task-list">
        <header><span>Tarea</span><span>Estado</span><span>Entrega</span><span>Proyecto</span></header>
        {filteredTasks.map((task) => <button className="personal-task" key={task.id} onClick={() => onSelect(task)}>
          <span className="personal-task__main"><i className={`priority-mark priority-mark--${task.priority}`}/><span><small>{task.public_id}</small><strong>{task.title}</strong></span></span>
          <span className={`status-pill status-pill--${task.status}`} style={{ background: statusColor(task.status, task.project_id)?.color ?? "#E4E5DE", color: statusTextColor(statusColor(task.status, task.project_id)?.color ?? "#E4E5DE") }}>{statusLabel(task.status, task.project_id)}</span>
          <span className={isLate(task.due_date, task.status) ? "personal-date personal-date--late" : "personal-date"}>{formatDate(task.due_date)}</span>
          <span className="project-tag"><i/>{task.project_name}</span>
        </button>)}
        {filteredTasks.length === 0 && <div className="personal-empty"><span>✓</span><strong>No hay tareas en este filtro.</strong><small>Tu cola está al día.</small></div>}
      </section>

      <aside className="personal-progress-card">
        <span className="special-eyebrow">RITMO PERSONAL</span>
        <div className="progress-orbit" style={{ "--progress": `${completedPercent * 3.6}deg` } as React.CSSProperties}><div><strong>{completedPercent}%</strong><small>completado</small></div></div>
        <p>{activeTasks.length ? `Tienes ${activeTasks.length} tareas abiertas. Prioriza las marcadas en rojo para proteger tus fechas.` : "No tienes trabajo pendiente en este momento."}</p>
        <div className="progress-legend"><span><i className="legend-dot legend-dot--lime"/>Cerradas {doneTasks.length}</span><span><i className="legend-dot"/>Abiertas {activeTasks.length}</span></div>
      </aside>
    </div>
  </div>;
}

function ReportsView({ projects, tasks, overview }: { projects: Project[]; tasks: Task[]; overview: Overview | null }) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const moving = tasks.filter((task) => ["in_progress", "review"].includes(task.status)).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const estimatedPoints = tasks.reduce((sum, task) => sum + task.estimate, 0);
  const completedPoints = tasks.filter((task) => task.status === "done").reduce((sum, task) => sum + task.estimate, 0);
  const statusMap = new Map<string, StatusConfig>();
  for (const status of defaultStatuses) statusMap.set(status.id, status);
  for (const project of projects) {
    for (const status of project.board_settings?.statuses ?? []) {
      if (!statusMap.has(status.id)) statusMap.set(status.id, status);
    }
  }
  const statusData = [...statusMap.values()].map((status) => ({ ...status, count: tasks.filter((task) => task.status === status.id).length }));
  const maxStatusCount = Math.max(...statusData.map((status) => status.count), 1);
  const projectRows = projects.map((project) => {
    const projectTaskList = tasks.filter((task) => task.project_id === project.id);
    const projectDone = projectTaskList.filter((task) => task.status === "done").length;
    return {
      project,
      total: projectTaskList.length,
      done: projectDone,
      blocked: projectTaskList.filter((task) => task.status === "blocked").length,
      progress: projectTaskList.length ? Math.round((projectDone / projectTaskList.length) * 100) : 0,
    };
  });
  const riskTasks = tasks
    .filter((task) => task.status === "blocked" || task.priority === "urgent" || isLate(task.due_date, task.status))
    .sort((a, b) => Number(isLate(b.due_date, b.status)) - Number(isLate(a.due_date, a.status)))
    .slice(0, 5);

  return <div className="special-view reports-view">
    <header className="reports-head">
      <div><span className="special-eyebrow">PULSO OPERATIVO · TIEMPO REAL</span><h1>Reportes</h1><p>Lectura ejecutiva del portafolio activo, sus cuellos de botella y el ritmo de entrega.</p></div>
      <div className="report-stamp"><small>FOCO GLOBAL</small><strong>{overview?.focus_score ?? 0}</strong><span>de 100</span></div>
    </header>

    <div className="report-kpis">
      <Metric label="Tareas activas" value={String(total - completed)} detail={`${total} en el portafolio`} accent />
      <Metric label="En movimiento" value={String(moving)} detail="Curso + revisión" />
      <Metric label="Bloqueadas" value={String(blocked)} detail="Necesitan intervención" warning />
      <Metric label="Puntos cerrados" value={String(completedPoints)} detail={`de ${estimatedPoints} estimados`} />
    </div>

    <div className="reports-grid">
      <section className="report-panel delivery-panel">
        <div className="report-panel__head"><div><span>Entrega global</span><small>Avance sobre tareas activas</small></div><em>{completionRate}%</em></div>
        <div className="delivery-visual">
          <div className="delivery-ring" style={{ "--progress": `${completionRate * 3.6}deg` } as React.CSSProperties} role="progressbar" aria-valuenow={completionRate} aria-valuemin={0} aria-valuemax={100}><div><strong>{completed}</strong><small>cerradas</small></div></div>
          <div className="delivery-copy"><strong>{completionRate >= 70 ? "Ritmo saludable" : completionRate >= 40 ? "Ritmo en construcción" : "Ritmo bajo"}</strong><p>{total - completed} tareas siguen abiertas en {projects.length} proyectos activos.</p><span>Meta sugerida <i>75%</i></span></div>
        </div>
      </section>

      <section className="report-panel status-panel">
        <div className="report-panel__head"><div><span>Distribución</span><small>Trabajo por estado</small></div><em>{total}</em></div>
        <div className="status-bars">{statusData.map((status) => <div className="status-bar" key={status.id}><span>{status.short}</span><div><i style={{ width: `${(status.count / maxStatusCount) * 100}%` }}/></div><strong>{status.count}</strong></div>)}</div>
      </section>

      <section className="report-panel portfolio-panel">
        <div className="report-panel__head"><div><span>Portafolio</span><small>Progreso por proyecto</small></div><em>{projects.length}</em></div>
        <div className="portfolio-list">{projectRows.map(({ project, total: projectTotal, done, blocked: projectBlocked, progress }) => <div className="portfolio-row" key={project.id}>
          <span className="portfolio-sigil" style={{ "--project-color": project.color } as React.CSSProperties}>{project.key.slice(0,2)}</span>
          <div className="portfolio-main"><div><strong>{project.name}</strong><small>{done}/{projectTotal} cerradas · {projectBlocked} bloqueadas</small></div><div className="portfolio-progress"><i style={{ width: `${progress}%`, "--project-color": project.color } as React.CSSProperties}/></div></div>
          <em>{progress}%</em>
        </div>)}</div>
      </section>

      <section className="report-panel risk-panel">
        <div className="report-panel__head"><div><span>Cola de riesgo</span><small>Urgentes, vencidas o bloqueadas</small></div><em>{riskTasks.length}</em></div>
        <div className="risk-list">{riskTasks.map((task) => <div className="risk-row" key={task.id}><i className={`priority-mark priority-mark--${task.priority}`}/><div><small>{task.public_id} · {task.project_name}</small><strong>{task.title}</strong></div><span className={isLate(task.due_date, task.status) ? "late-text" : ""}>{task.status === "blocked" ? "Bloqueada" : formatDate(task.due_date)}</span></div>)}{riskTasks.length === 0 && <div className="report-empty">Sin riesgos críticos detectados.</div>}</div>
      </section>
    </div>
  </div>;
}

function Board({ tasks, statuses, boardSettings, onSelect, onMove, onCreate }: { tasks: Task[]; statuses: StatusConfig[]; boardSettings: BoardSettings; onSelect: (task: Task) => void; onMove: (task: Task, status: Status, position: number) => void; onCreate: () => void }) {
  const [dragged, setDragged] = useState<Task | null>(null);
  return <div className="board">{statuses.map((status, index) => {
    const columnTasks = tasks.filter((task) => task.status === status.id);
    return <section className={`board-column board-column--${status.id}`} key={status.id} style={{ "--delay": `${index * 45}ms` } as React.CSSProperties} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void onMove(dragged, status.id, columnTasks.length); setDragged(null); }}>
      <header className="column-head"><div><span className="status-code" style={{ background: status.color, color: statusTextColor(status.color) }}>{status.short}</span><strong>{status.label}</strong><span className="column-count">{columnTasks.length}</span></div><button onClick={onCreate} aria-label={`Crear en ${status.label}`}><Icon name="plus"/></button></header>
      <div className="task-stack">{columnTasks.map((task, taskIndex) => <TaskCard key={task.id} task={task} boardSettings={boardSettings} onClick={() => onSelect(task)} onDragStart={() => setDragged(task)} onDropBefore={() => { if (dragged && dragged.id !== task.id) void onMove(dragged, status.id, taskIndex); setDragged(null); }} />)}{columnTasks.length === 0 && <div className="empty-column"><span>+</span><p>Suelta una tarea aquí</p></div>}</div>
    </section>;
  })}</div>;
}

function TaskCard({ task, boardSettings, onClick, onDragStart, onDropBefore }: { task: Task; boardSettings: BoardSettings; onClick: () => void; onDragStart: () => void; onDropBefore: () => void }) {
  const showMeta = boardSettings.due_date || (boardSettings.checklist && task.checklist.length > 0) || (boardSettings.subtasks && task.subtasks.length > 0) || boardSettings.assignee;
  return <article className={`task-card priority-${task.priority} ${task.archived_at ? "task-card--archived" : ""}`} draggable={!task.archived_at} onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); onDropBefore(); }} onClick={onClick} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onClick()}>
    <div className="card-top"><span className="task-id">{task.public_id}</span>{boardSettings.priority && <span className={`priority-dot priority-dot--${task.priority}`} title={priorityLabel[task.priority]}/>}</div>
    <h3>{task.title}</h3>
    {boardSettings.labels && task.labels.length > 0 && <div className="labels">{task.labels.slice(0, 2).map((label) => <span key={label}>{label}</span>)}</div>}
    {showMeta && <div className="card-meta">{boardSettings.due_date && <span className={`date-chip ${isLate(task.due_date, task.status) ? "date-chip--late" : ""}`}><Icon name="calendar"/>{task.archived_at ? "Archivada" : formatDate(task.due_date)}</span>}{boardSettings.checklist && task.checklist.length > 0 && <span><Icon name="check"/>{task.checklist.filter((item) => item.is_done).length}/{task.checklist.length}</span>}{boardSettings.subtasks && task.subtasks.length > 0 && <span>{task.subtasks.length} sub</span>}{boardSettings.assignee && <span className="avatar avatar--small" style={{ "--avatar-color": task.assignee?.color ?? "#D7D9D4" } as React.CSSProperties}>{task.assignee?.initials ?? "—"}</span>}</div>}
  </article>;
}

function TaskList({ tasks, statuses, onSelect, onMove }: { tasks: Task[]; statuses: StatusConfig[]; onSelect: (task: Task) => void; onMove: (task: Task, status: Status, position: number) => void }) {
  return <div className="task-table"><div className="task-row task-row--head"><span>Tarea</span><span>Estado</span><span>Responsable</span><span>Prioridad</span><span>Entrega</span></div>{tasks.map((task) => <button className={`task-row ${task.archived_at ? "task-row--archived" : ""}`} key={task.id} onClick={() => onSelect(task)}><span className="task-cell-main"><small>{task.public_id}</small><strong>{task.title}</strong></span><span><select value={task.status} disabled={Boolean(task.archived_at)} onClick={(event) => event.stopPropagation()} onChange={(event) => void onMove(task, event.target.value as Status, 0)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></span><span className="member-cell"><span className="avatar avatar--small" style={{ "--avatar-color": task.assignee?.color ?? "#D7D9D4" } as React.CSSProperties}>{task.assignee?.initials ?? "—"}</span>{task.assignee?.name ?? "Sin asignar"}</span><span><i className={`priority-dot priority-dot--${task.priority}`}/>{priorityLabel[task.priority]}</span><span className={isLate(task.due_date, task.status) ? "late-text" : ""}>{task.archived_at ? "Archivada" : formatDate(task.due_date)}</span></button>)}</div>;
}

function CreateTaskModal({ project, statuses, members, onClose, onCreate }: { project: Project; statuses: StatusConfig[]; members: Member[]; onClose: () => void; onCreate: (payload: TaskInput) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<TaskInput>({ project_id: project.id, title: "", description: "", status: "todo", priority: "medium", labels: [] });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await onCreate(form);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "No se pudo crear la tarea");
    } finally {
      setSaving(false);
    }
  }
  return <div className="modal-wrap"><button className="modal-scrim" onClick={onClose} aria-label="Cerrar modal"/><form className="create-modal" onSubmit={(event) => void submit(event)}><header><div><span className="eyebrow">NUEVO TRABAJO · {project.key}</span><h2>Convierte una idea en acción.</h2></div><button type="button" onClick={onClose}><Icon name="close"/></button></header>{formError && <div className="form-error"><Icon name="warning"/><span>{formError}</span></div>}<label className="hero-field"><span>¿Qué hay que hacer?</span><input autoFocus required minLength={2} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Preparar release de pagos"/></label><label><span>Contexto</span><textarea rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Objetivo, alcance o definición de terminado…"/></label><div className="form-grid"><label><span>Estado inicial</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as Status }))}>{statuses.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}</select></label><label><span>Prioridad</span><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as Priority }))}>{Object.entries(priorityLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Responsable</span><select value={form.assignee_id ?? ""} onChange={(event) => setForm((current) => ({ ...current, assignee_id: event.target.value || null }))}><option value="">Sin asignar</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label><span>Fecha límite</span><input type="date" value={form.due_date ?? ""} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value || null }))}/></label><label><span>Estimación</span><input type="number" min={0} max={1000} value={form.estimate ?? 0} onChange={(event) => setForm((current) => ({ ...current, estimate: Number(event.target.value) }))}/></label><label><span>Etiquetas</span><input value={form.labels?.join(", ") ?? ""} onChange={(event) => setForm((current) => ({ ...current, labels: event.target.value.split(",").map((label) => label.trim()) }))} placeholder="frontend, release"/></label></div><footer><span>La tarea será visible para todo el proyecto.</span><button className="create-button" disabled={saving}><Icon name="plus"/>{saving ? "Creando…" : "Crear tarea"}</button></footer></form></div>;
}

const projectColors = ["#B8F23D", "#FF8066", "#7CCBFF", "#F4C95D", "#C4A7FF"];

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: ProjectInput) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<ProjectInput>({ key: "", name: "", client: "", description: "", color: projectColors[0] });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await onCreate({ ...form, key: form.key.trim().toUpperCase() });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "No se pudo crear el proyecto");
    } finally {
      setSaving(false);
    }
  }

  const previewKey = form.key.trim().toUpperCase() || "NUEVO";

  return <div className="modal-wrap"><button className="modal-scrim" onClick={onClose} aria-label="Cerrar modal"/><form className="create-modal project-modal" onSubmit={(event) => void submit(event)}>
    <header><div><span className="eyebrow">NUEVA ÓRBITA · ESPACIO DE TRABAJO</span><h2>Abre un proyecto con identidad propia.</h2></div><button type="button" onClick={onClose} aria-label="Cerrar"><Icon name="close"/></button></header>
    <div className="project-preview" style={{ "--preview-color": form.color } as React.CSSProperties}><span>{previewKey.slice(0, 2)}</span><div><small>CLAVE DEL PROYECTO</small><strong>{previewKey}</strong></div></div>
    {formError && <div className="form-error"><Icon name="warning"/><span>{formError}</span></div>}
    <div className="form-grid project-form-grid">
      <label><span>Clave corta</span><input autoFocus required minLength={2} maxLength={8} pattern="[A-Za-z][A-Za-z0-9_-]{1,7}" value={form.key} onChange={(event) => setForm((current) => ({ ...current, key: event.target.value.toUpperCase() }))} placeholder="Ej. LUNA"/><small>2–8 caracteres, sin espacios.</small></label>
      <label><span>Color identificador</span><div className="color-options">{projectColors.map((color) => <button type="button" key={color} className={(form.color ?? "").toUpperCase() === color ? "color-swatch color-swatch--active" : "color-swatch"} style={{ "--swatch": color } as React.CSSProperties} onClick={() => setForm((current) => ({ ...current, color }))} aria-label={`Usar color ${color}`} />)}<span className={projectColors.some((color) => (form.color ?? "").toUpperCase() === color) ? "color-picker" : "color-picker color-picker--active"} title="Elegir un color personalizado"><input type="color" value={form.color ?? "#B8F23D"} aria-label="Elegir un color personalizado" onChange={(event) => setForm((current) => ({ ...current, color: event.target.value.toUpperCase() }))} /></span></div></label>
      <label><span>Nombre</span><input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Luna Mobile"/></label>
      <label><span>Cliente o área</span><input required minLength={2} maxLength={120} value={form.client} onChange={(event) => setForm((current) => ({ ...current, client: event.target.value }))} placeholder="Ej. Operaciones internas"/></label>
    </div>
    <label><span>Propósito</span><textarea rows={4} maxLength={5000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Qué quiere conseguir el equipo y por qué importa…"/></label>
    <footer><span>El proyecto aparecerá vacío y listo para recibir tareas.</span><button className="create-button" disabled={saving}><Icon name="plus"/>{saving ? "Creando…" : "Crear proyecto"}</button></footer>
  </form></div>;
}

function LoadingBoard() { return <div className="loading-board">{[1,2,3,4].map((column) => <div className="loading-column" key={column}><span/><i/><i/><i/></div>)}</div>; }
