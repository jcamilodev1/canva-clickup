export type Status = string;
export type Priority = "low" | "medium" | "high" | "urgent";

export interface StatusConfig {
  id: string;
  short: string;
  label: string;
  color: string;
}

export const defaultStatuses: StatusConfig[] = [
  { id: "backlog", short: "BK", label: "Backlog", color: "#E4E5DE" },
  { id: "todo", short: "PH", label: "Por hacer", color: "#E4E5DE" },
  { id: "in_progress", short: "EC", label: "En curso", color: "#D9EFFC" },
  { id: "review", short: "RV", label: "Revisión", color: "#FFF0BD" },
  { id: "blocked", short: "BL", label: "Bloqueado", color: "#FFDED7" },
  { id: "done", short: "OK", label: "Terminado", color: "#DFF3AB" },
];

export interface BoardSettings {
  priority: boolean;
  due_date: boolean;
  assignee: boolean;
  labels: boolean;
  checklist: boolean;
  subtasks: boolean;
  statuses: StatusConfig[];
}

export const defaultBoardSettings: BoardSettings = {
  priority: true,
  due_date: true,
  assignee: true,
  labels: true,
  checklist: true,
  subtasks: true,
  statuses: defaultStatuses,
};

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  client: string;
  description: string;
  color: string;
  archived_at: string | null;
  board_settings?: Partial<BoardSettings>;
  members: Member[];
  task_count: number;
  completed_count: number;
}

export interface ProjectInput {
  key: string;
  name: string;
  client: string;
  description?: string;
  color?: string;
  board_settings?: Partial<BoardSettings>;
  member_ids?: string[];
}

export interface ProjectUpdate {
  name?: string;
  client?: string;
  description?: string;
  color?: string;
  board_settings?: Partial<BoardSettings>;
  member_ids?: string[];
}

export interface ChecklistItem {
  id: string;
  body: string;
  is_done: boolean;
  position: number;
}

export interface TaskReference {
  id: string;
  public_id: string;
  title: string;
  status: Status;
}

export interface Task {
  id: string;
  public_id: string;
  number: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  estimate: number;
  labels: string[];
  position: number;
  project_id: string;
  project_name: string;
  assignee: Member | null;
  parent_id: string | null;
  archived_at: string | null;
  version: number;
  comment_count: number;
  checklist: ChecklistItem[];
  subtasks: TaskReference[];
  dependencies: TaskReference[];
  created_at: string;
  updated_at: string;
}

export interface Overview {
  total_tasks: number;
  completed_tasks: number;
  blocked_tasks: number;
  active_projects: number;
  focus_score: number;
}

export interface TaskInput {
  project_id: string;
  title: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  due_date?: string | null;
  estimate?: number;
  assignee_id?: string | null;
  labels?: string[];
  parent_id?: string | null;
}
