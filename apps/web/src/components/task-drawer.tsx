"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import type { Member, Priority, Status, StatusConfig, Task } from "@/types";

const priorities: { id: Priority; label: string }[] = [
  { id: "urgent", label: "Urgente" },
  { id: "high", label: "Alta" },
  { id: "medium", label: "Media" },
  { id: "low", label: "Baja" },
];

export interface TaskDraft {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  estimate: number;
  assignee_id: string | null;
  labels: string[];
}

interface TaskDrawerProps {
  task: Task;
  statuses: StatusConfig[];
  members: Member[];
  projectTasks: Task[];
  onClose: () => void;
  onSave: (task: Task, draft: TaskDraft) => Promise<Task>;
  onCreateSubtask: (task: Task, title: string) => Promise<Task>;
  onAddChecklist: (task: Task, body: string) => Promise<Task>;
  onToggleChecklist: (task: Task, itemId: string, isDone: boolean) => Promise<Task>;
  onDeleteChecklist: (task: Task, itemId: string) => Promise<Task>;
  onAddDependency: (task: Task, dependencyId: string) => Promise<Task>;
  onDeleteDependency: (task: Task, dependencyId: string) => Promise<Task>;
  onArchive: (task: Task) => Promise<void>;
  onRestore: (task: Task) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}

export function TaskDrawer({
  task,
  statuses,
  members,
  projectTasks,
  onClose,
  onSave,
  onCreateSubtask,
  onAddChecklist,
  onToggleChecklist,
  onDeleteChecklist,
  onAddDependency,
  onDeleteDependency,
  onArchive,
  onRestore,
  onDelete,
}: TaskDrawerProps) {
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromTask(task));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newDependency, setNewDependency] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setDraft(draftFromTask(task));
  }, [task.id, task.version]);

  const availableDependencies = useMemo(
    () =>
      projectTasks.filter(
        (candidate) =>
          candidate.id !== task.id &&
          !candidate.archived_at &&
          !task.dependencies.some((dependency) => dependency.id === candidate.id),
      ),
    [projectTasks, task.archived_at, task.dependencies, task.id],
  );
  const checklistDone = task.checklist.filter((item) => item.is_done).length;

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setSaving(true);
    setError("");
    try {
      return await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo completar la operación");
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => onSave(task, draft));
  }

  async function createChecklistItem() {
    const body = newChecklistItem.trim();
    if (!body) return;
    const updated = await run(() => onAddChecklist(task, body));
    if (updated) setNewChecklistItem("");
  }

  async function createSubtask() {
    const title = newSubtask.trim();
    if (!title) return;
    const updated = await run(() => onCreateSubtask(task, title));
    if (updated) setNewSubtask("");
  }

  async function createDependency() {
    if (!newDependency) return;
    const updated = await run(() => onAddDependency(task, newDependency));
    if (updated) setNewDependency("");
  }

  return (
    <div className="drawer-wrap">
      <button className="drawer-scrim" onClick={onClose} aria-label="Cerrar detalle" />
      <aside className="task-drawer task-drawer--advanced">
        <header>
          <div className="drawer-header-id">
            <span className="drawer-id">{task.public_id}</span>
            <small>v{task.version}</small>
          </div>
          <div className="drawer-header-actions">
            <span className={task.archived_at ? "record-state record-state--archived" : "record-state"}>
              {task.archived_at ? "Archivada" : "Activa"}
            </span>
            <button onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
          </div>
        </header>

        <form className="drawer-body" onSubmit={submit}>
          {error && <div className="form-error"><Icon name="warning" /><span>{error}</span></div>}

          <textarea
            className="drawer-title"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            rows={2}
            disabled={Boolean(task.archived_at)}
          />

          <div className="drawer-fields drawer-fields--dense">
            <label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Status }))} disabled={Boolean(task.archived_at)}>{statuses.map((status) => <option value={status.id} key={status.id}>{status.label}</option>)}</select></label>            <label><span>Responsable</span><select value={draft.assignee_id ?? ""} onChange={(event) => setDraft((current) => ({ ...current, assignee_id: event.target.value || null }))} disabled={Boolean(task.archived_at)}><option value="">Sin asignar</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
            <label><span>Prioridad</span><select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))} disabled={Boolean(task.archived_at)}>{priorities.map((priority) => <option value={priority.id} key={priority.id}>{priority.label}</option>)}</select></label>
            <label><span>Fecha límite</span><input type="date" value={draft.due_date ?? ""} onChange={(event) => setDraft((current) => ({ ...current, due_date: event.target.value || null }))} disabled={Boolean(task.archived_at)} /></label>
            <label><span>Estimación</span><div className="estimate-input"><input type="number" min={0} max={1000} value={draft.estimate} onChange={(event) => setDraft((current) => ({ ...current, estimate: Number(event.target.value) }))} disabled={Boolean(task.archived_at)} /><small>puntos</small></div></label>
            <label><span>Etiquetas</span><input value={draft.labels.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, labels: event.target.value.split(",").map((label) => label.trim()) }))} placeholder="frontend, release" disabled={Boolean(task.archived_at)} /></label>
          </div>

          <section className="drawer-section">
            <div className="drawer-section-title"><span>Descripción</span><small>Contexto y criterios</small></div>
            <textarea className="description-field" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Añade decisiones, alcance y criterios…" rows={6} disabled={Boolean(task.archived_at)} />
          </section>

          <section className="drawer-section detail-module">
            <div className="drawer-section-title"><span>Checklist</span><small>{checklistDone}/{task.checklist.length} completados</small></div>
            <div className="checklist-progress"><i style={{ width: `${task.checklist.length ? (checklistDone / task.checklist.length) * 100 : 0}%` }} /></div>
            <div className="checklist-list">
              {task.checklist.map((item) => (
                <div className={item.is_done ? "checklist-row checklist-row--done" : "checklist-row"} key={item.id}>
                  <input type="checkbox" checked={item.is_done} onChange={() => void run(() => onToggleChecklist(task, item.id, !item.is_done))} disabled={saving || Boolean(task.archived_at)} />
                  <span>{item.body}</span>
                  <button type="button" onClick={() => void run(() => onDeleteChecklist(task, item.id))} aria-label={`Eliminar ${item.body}`} disabled={saving || Boolean(task.archived_at)}><Icon name="close" /></button>
                </div>
              ))}
            </div>
            {!task.archived_at && <div className="inline-create"><input value={newChecklistItem} onChange={(event) => setNewChecklistItem(event.target.value)} placeholder="Añadir punto de control…" /><button type="button" onClick={() => void createChecklistItem()} disabled={saving || !newChecklistItem.trim()}><Icon name="plus" />Añadir</button></div>}
          </section>

          <section className="drawer-section detail-module">
            <div className="drawer-section-title"><span>Subtareas</span><small>{task.subtasks.length} elementos</small></div>
            <div className="reference-list">
              {task.subtasks.map((subtask) => <div className="reference-row" key={subtask.id}><span>{subtask.public_id}</span><strong>{subtask.title}</strong><em>{statuses.find((status) => status.id === subtask.status)?.label}</em></div>)}
            </div>
            {!task.archived_at && <div className="inline-create"><input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} placeholder="Nueva subtarea…" /><button type="button" onClick={() => void createSubtask()} disabled={saving || !newSubtask.trim()}><Icon name="plus" />Crear</button></div>}
          </section>

          <section className="drawer-section detail-module">
            <div className="drawer-section-title"><span>Dependencias</span><small>{task.dependencies.length} bloqueos previos</small></div>
            <div className="reference-list">
              {task.dependencies.map((dependency) => <div className="reference-row" key={dependency.id}><span>{dependency.public_id}</span><strong>{dependency.title}</strong><button type="button" onClick={() => void run(() => onDeleteDependency(task, dependency.id))} disabled={saving || Boolean(task.archived_at)} aria-label={`Quitar dependencia ${dependency.public_id}`}><Icon name="close" /></button></div>)}
            </div>
            {!task.archived_at && <div className="inline-create"><select value={newDependency} onChange={(event) => setNewDependency(event.target.value)}><option value="">Selecciona una tarea…</option>{availableDependencies.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.public_id} · {candidate.title}</option>)}</select><button type="button" onClick={() => void createDependency()} disabled={saving || !newDependency}><Icon name="plus" />Vincular</button></div>}
          </section>

          <section className="task-lifecycle">
            <div><strong>Ciclo de vida</strong><small>Archivar es reversible; eliminar requiere confirmar el ID.</small></div>
            <div className="task-lifecycle__actions">
              {task.archived_at ? <button type="button" className="secondary-button" onClick={() => void run(() => onRestore(task))} disabled={saving}>Restaurar</button> : <button type="button" className="secondary-button" onClick={() => void run(() => onArchive(task))} disabled={saving}>Archivar</button>}
              <button type="button" className="danger-button" onClick={() => setShowDelete(true)}>Eliminar</button>
            </div>
            {showDelete && <div className="delete-confirmation"><p>Escribe <strong>{task.public_id}</strong> para eliminarla definitivamente.</p><div><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())} /><button type="button" className="danger-button" disabled={saving || deleteConfirmation !== task.public_id} onClick={() => void run(() => onDelete(task))}>Confirmar</button></div></div>}
          </section>

          <div className="drawer-savebar">
            <span>{task.archived_at ? "Restaura la tarea para editarla." : "Los cambios se guardan juntos para evitar conflictos."}</span>
            <button className="create-button" disabled={saving || Boolean(task.archived_at)}>{saving ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    estimate: task.estimate,
    assignee_id: task.assignee?.id ?? null,
    labels: task.labels,
  };
}
