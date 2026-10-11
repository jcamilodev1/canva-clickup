import type { Member, Overview, Project, ProjectInput, ProjectUpdate, Status, Task, TaskInput } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "Error inesperado" }));
    const detail = Array.isArray(payload.detail)
      ? payload.detail.map((item: { msg?: string }) => item.msg ?? "Dato inválido").join(". ")
      : payload.detail;
    throw new Error(detail ?? "No fue posible completar la operación");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  overview: () => request<Overview>("/overview"),
  projects: (includeArchived = false) =>
    request<Project[]>(includeArchived ? "/projects?include_archived=true" : "/projects"),
  createProject: (payload: ProjectInput) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (id: string, payload: ProjectUpdate) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  archiveProject: (id: string) => request<Project>(`/projects/${id}/archive`, { method: "POST" }),
  restoreProject: (id: string) => request<Project>(`/projects/${id}/restore`, { method: "POST" }),
  deleteProject: (id: string, key: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE", body: JSON.stringify({ key }) }),
  members: () => request<Member[]>("/members"),
  tasks: (projectId?: string, includeArchived = false, includeSubtasks = false) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (includeArchived) params.set("include_archived", "true");
    if (includeSubtasks) params.set("include_subtasks", "true");
    const query = params.toString();
    return request<Task[]>(query ? `/tasks?${query}` : "/tasks");
  },
  task: (id: string) => request<Task>(`/tasks/${id}`),
  createTask: (payload: TaskInput) =>
    request<Task>("/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (id: string, payload: Partial<Omit<TaskInput, "project_id">> & { version?: number }) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  moveTask: (id: string, status: Status, position: number, version: number) =>
    request<Task>(`/tasks/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ status, position, version }),
    }),
  archiveTask: (task: Task) =>
    request<Task>(`/tasks/${task.id}/archive`, { method: "POST", body: JSON.stringify({ version: task.version }) }),
  restoreTask: (task: Task) =>
    request<Task>(`/tasks/${task.id}/restore`, { method: "POST", body: JSON.stringify({ version: task.version }) }),
  deleteTask: (task: Task) =>
    request<void>(`/tasks/${task.id}`, { method: "DELETE", body: JSON.stringify({ version: task.version, public_id: task.public_id }) }),
  addChecklistItem: (task: Task, body: string) =>
    request<Task>(`/tasks/${task.id}/checklist`, { method: "POST", body: JSON.stringify({ body, version: task.version }) }),
  updateChecklistItem: (task: Task, itemId: string, payload: { body?: string; is_done?: boolean }) =>
    request<Task>(`/tasks/${task.id}/checklist/${itemId}`, { method: "PATCH", body: JSON.stringify({ ...payload, version: task.version }) }),
  deleteChecklistItem: (task: Task, itemId: string) =>
    request<Task>(`/tasks/${task.id}/checklist/${itemId}`, { method: "DELETE", body: JSON.stringify({ version: task.version }) }),
  addDependency: (task: Task, dependsOnId: string) =>
    request<Task>(`/tasks/${task.id}/dependencies`, { method: "POST", body: JSON.stringify({ depends_on_id: dependsOnId, version: task.version }) }),
  deleteDependency: (task: Task, dependencyId: string) =>
    request<Task>(`/tasks/${task.id}/dependencies/${dependencyId}`, { method: "DELETE", body: JSON.stringify({ version: task.version }) }),
};
