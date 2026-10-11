"use client";

import { FormEvent, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { defaultBoardSettings, type BoardSettings, type Member, type Project, type ProjectUpdate, type StatusConfig } from "@/types";

const colors = ["#B8F23D", "#FF8066", "#7CCBFF", "#F4C95D", "#C4A7FF"];
const statusPalette = ["#E4E5DE", "#D9EFFC", "#FFF0BD", "#FFDED7", "#DFF3AB", "#B8F23D", "#FF8066", "#7CCBFF", "#F4C95D", "#C4A7FF"];

const boardFieldMeta: { key: Exclude<keyof BoardSettings, "statuses">; label: string; hint: string }[] = [
  { key: "priority", label: "Prioridad", hint: "Punto de color junto al ID de la tarea." },
  { key: "labels", label: "Etiquetas", hint: "Etiquetas visibles bajo el título." },
  { key: "due_date", label: "Fecha de entrega", hint: "Chip con la fecha límite y alerta de vencimiento." },
  { key: "assignee", label: "Responsable", hint: "Avatar de la persona asignada." },
  { key: "checklist", label: "Progreso de checklist", hint: "Conteo de ítems completados." },
  { key: "subtasks", label: "Subtareas", hint: "Cantidad de subtareas anidadas." },
];

interface ProjectSettingsProps {
  project: Project;
  members: Member[];
  onClose: () => void;
  onSave: (projectId: string, payload: ProjectUpdate) => Promise<void>;
  onArchive: (project: Project) => Promise<void>;
  onRestore: (project: Project) => Promise<void>;
  onDelete: (project: Project, confirmationKey: string) => Promise<void>;
}

export function ProjectSettings({
  project,
  members,
  onClose,
  onSave,
  onArchive,
  onRestore,
  onDelete,
}: ProjectSettingsProps) {
  const [form, setForm] = useState<ProjectUpdate>({
    name: project.name,
    client: project.client,
    description: project.description,
    color: project.color,
    board_settings: { ...defaultBoardSettings, ...project.board_settings },
    member_ids: project.members?.map((member) => member.id) ?? [],
  });
  const [tab, setTab] = useState<"general" | "board">("general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [confirmationKey, setConfirmationKey] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);

  const selectedMemberIds = form.member_ids ?? [];
  const selectedMembers = useMemo(
    () => members.filter((member) => selectedMemberIds.includes(member.id)),
    [members, selectedMemberIds],
  );
  const availableMembers = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase("es");
    return members
      .filter((member) => !selectedMemberIds.includes(member.id))
      .filter((member) => {
        if (!query) return true;
        return [member.name, member.email, member.initials]
          .some((value) => value.toLocaleLowerCase("es").includes(query));
      })
      .slice(0, 8);
  }, [memberQuery, members, selectedMemberIds]);

  function addMember(memberId: string) {
    setForm((current) => {
      const currentSelected = current.member_ids ?? [];
      if (currentSelected.includes(memberId)) return current;
      return {
        ...current,
        member_ids: [...currentSelected, memberId],
      };
    });
    setMemberQuery("");
  }

  function removeMember(memberId: string) {
    setForm((current) => ({
      ...current,
      member_ids: (current.member_ids ?? []).filter((id) => id !== memberId),
    }));
  }

  function updateStatus(index: number, patch: Partial<StatusConfig>) {
    setForm((current) => {
      const statuses = [...(current.board_settings?.statuses ?? defaultBoardSettings.statuses)];
      statuses[index] = { ...statuses[index], ...patch };
      return { ...current, board_settings: { ...current.board_settings, statuses } };
    });
  }

  function moveStatus(index: number, delta: number) {
    setForm((current) => {
      const statuses = [...(current.board_settings?.statuses ?? defaultBoardSettings.statuses)];
      const target = index + delta;
      if (target < 0 || target >= statuses.length) return current;
      const [moved] = statuses.splice(index, 1);
      statuses.splice(target, 0, moved);
      return { ...current, board_settings: { ...current.board_settings, statuses } };
    });
  }

  function removeStatus(index: number) {
    setForm((current) => {
      const statuses = [...(current.board_settings?.statuses ?? defaultBoardSettings.statuses)];
      if (statuses.length <= 1) return current;
      statuses.splice(index, 1);
      return { ...current, board_settings: { ...current.board_settings, statuses } };
    });
  }

  function addStatus() {
    setForm((current) => {
      const statuses = [...(current.board_settings?.statuses ?? defaultBoardSettings.statuses)];
      const label = `Nuevo estado ${statuses.length + 1}`;
      const short = label
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 4)
        .toUpperCase();
      statuses.push({
        id: `s_${Math.random().toString(36).slice(2, 8)}`,
        short,
        label,
        color: statusPalette[statuses.length % statusPalette.length],
      });
      return { ...current, board_settings: { ...current.board_settings, statuses } };
    });
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo completar la operación");
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => onSave(project.id, form));
  }

  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={onClose} aria-label="Cerrar configuración" />
      <form className="create-modal project-settings-modal" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">CONTROL DE PROYECTO · {project.key}</span>
            <h2>Ajusta la órbita del equipo.</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div
          className="project-settings-banner"
          style={{ "--project-accent": form.color } as React.CSSProperties}
        >
          <span>{project.key.slice(0, 2)}</span>
          <div>
            <small>{project.archived_at ? "PROYECTO ARCHIVADO" : "PROYECTO ACTIVO"}</small>
            <strong>{project.key}</strong>
          </div>
          <em>{project.task_count} tareas</em>
        </div>

        {error && (
          <div className="form-error">
            <Icon name="warning" />
            <span>{error}</span>
          </div>
        )}

        <div className="settings-tabs" role="tablist" aria-label="Secciones de configuración">
          <button type="button" role="tab" aria-selected={tab === "general"} className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>
            <Icon name="more" />General
          </button>
          <button type="button" role="tab" aria-selected={tab === "board"} className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}>
            <Icon name="board" />Tablero
          </button>
        </div>

        {tab === "general" && (
          <>
        <div className="form-grid project-form-grid">
          <label>
            <span>Nombre</span>
            <input
              required
              minLength={2}
              value={form.name ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Cliente o área</span>
            <input
              required
              minLength={2}
              value={form.client ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, client: event.target.value }))}
            />
          </label>
        </div>

        <label>
          <span>Descripción</span>
          <textarea
            rows={4}
            value={form.description ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
        </label>

        <section className="settings-section">
          <div className="settings-section__head">
            <div>
              <span>Identidad visual</span>
              <small>Se usa en navegación, avatares y estados vacíos.</small>
            </div>
          </div>
          <div className="color-options">
            {colors.map((color) => (
              <button
                type="button"
                key={color}
                className={(form.color ?? "").toUpperCase() === color ? "color-swatch color-swatch--active" : "color-swatch"}
                style={{ "--swatch": color } as React.CSSProperties}
                onClick={() => setForm((current) => ({ ...current, color }))}
                aria-label={`Usar color ${color}`}
              />
            ))}
            <span className={colors.some((color) => (form.color ?? "").toUpperCase() === color) ? "color-picker" : "color-picker color-picker--active"} title="Elegir un color personalizado">
              <input type="color" value={form.color ?? "#B8F23D"} aria-label="Elegir un color personalizado" onChange={(event) => setForm((current) => ({ ...current, color: event.target.value.toUpperCase() }))} />
            </span>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__head">
            <div>
              <span>Equipo del proyecto</span>
              <small>{form.member_ids?.length ?? 0} personas con acceso operativo.</small>
            </div>
          </div>
          <div
            className="member-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setMemberSearchOpen(false);
              }
            }}
          >
            <div className="member-chip-cloud" aria-label="Miembros seleccionados">
              {selectedMembers.map((member) => (
                <span className="member-chip" key={member.id}>
                  <span
                    className="member-chip__avatar"
                    style={{ "--avatar-color": member.color } as React.CSSProperties}
                  >
                    {member.initials}
                  </span>
                  <span>{member.name}</span>
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    aria-label={`Quitar a ${member.name}`}
                  >
                    <Icon name="close" />
                  </button>
                </span>
              ))}
              {selectedMembers.length === 0 && (
                <span className="member-chip-cloud__empty">Aún no hay personas en este proyecto.</span>
              )}
            </div>

            <div className="member-search-shell">
              <Icon name="search" />
              <input
                value={memberQuery}
                onFocus={() => setMemberSearchOpen(true)}
                onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setMemberSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && availableMembers[0]) {
                    event.preventDefault();
                    addMember(availableMembers[0].id);
                  }
                  if (event.key === "Backspace" && !memberQuery && selectedMembers.length) {
                    removeMember(selectedMembers[selectedMembers.length - 1].id);
                  }
                  if (event.key === "Escape") {
                    setMemberSearchOpen(false);
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Buscar por nombre o correo…"
                role="combobox"
                aria-label="Buscar personas"
                aria-expanded={memberSearchOpen}
                aria-controls="member-suggestions"
                aria-autocomplete="list"
                autoComplete="off"
              />
              <kbd>↵</kbd>
            </div>

            {memberSearchOpen && (
              <div className="member-suggestions" id="member-suggestions" role="listbox">
                {availableMembers.map((member) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="member-suggestion"
                    key={member.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addMember(member.id)}
                  >
                    <span
                      className="avatar avatar--small"
                      style={{ "--avatar-color": member.color } as React.CSSProperties}
                    >
                      {member.initials}
                    </span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                    <i>Agregar</i>
                  </button>
                ))}
                {availableMembers.length === 0 && (
                  <div className="member-suggestions__empty">
                    {members.length === selectedMembers.length
                      ? "Todo el equipo ya está incluido."
                      : `No encontramos “${memberQuery.trim()}”.`}
                  </div>
                )}
              </div>
            )}
            <div className="member-picker-hint">
              <span>Escribe para filtrar · Enter agrega · Retroceso quita el último</span>
              <strong>{selectedMembers.length}/{members.length}</strong>
            </div>
          </div>
        </section>

        <section className="danger-zone">
          <div>
            <strong>Ciclo de vida</strong>
            <small>Archivar conserva todo. Eliminar no se puede deshacer.</small>
          </div>
          <div className="danger-zone__actions">
            {project.archived_at ? (
              <button type="button" className="secondary-button" onClick={() => void run(() => onRestore(project))} disabled={saving}>
                Restaurar proyecto
              </button>
            ) : (
              <button type="button" className="secondary-button" onClick={() => void run(() => onArchive(project))} disabled={saving}>
                Archivar proyecto
              </button>
            )}
            <button type="button" className="danger-button" onClick={() => setShowDelete(true)}>
              Eliminar
            </button>
          </div>
          {showDelete && (
            <div className="delete-confirmation">
              <p>Escribe <strong>{project.key}</strong> para eliminar el proyecto y todas sus tareas.</p>
              <div>
                <input value={confirmationKey} onChange={(event) => setConfirmationKey(event.target.value.toUpperCase())} />
                <button
                  type="button"
                  className="danger-button"
                  disabled={saving || confirmationKey !== project.key}
                  onClick={() => void run(() => onDelete(project, confirmationKey))}
                >
                  Confirmar eliminación
                </button>
              </div>
            </div>
          )}
        </section>
          </>
        )}

        {tab === "board" && (
          <>
            <section className="settings-section">
              <div className="settings-section__head">
                <div>
                  <span>Columnas del tablero</span>
                  <small>Renombra, crea, elimina y ordena los estados. Al eliminar una columna, sus tareas pasan a la primera.</small>
                </div>
              </div>
              <div className="status-editor">
                {(form.board_settings?.statuses ?? defaultBoardSettings.statuses).map((status, index) => (
                  <div className="status-editor__row" key={status.id}>
                    <span className="status-editor__grip" title="Arrastrar para ordenar"><Icon name="more" /></span>
                    <label className="status-editor__color" style={{ "--row-color": status.color } as React.CSSProperties} title="Color de la columna">
                      <input type="color" value={status.color} onChange={(event) => updateStatus(index, { color: event.target.value.toUpperCase() })} aria-label={`Color de ${status.label || "la columna"}`} />
                    </label>
                    <input className="status-editor__short" maxLength={4} required value={status.short} onChange={(event) => updateStatus(index, { short: event.target.value.toUpperCase() })} aria-label="Código corto" placeholder="CÓD" />
                    <input className="status-editor__label" required value={status.label} onChange={(event) => updateStatus(index, { label: event.target.value })} aria-label="Nombre de la columna" placeholder="Nombre de la columna" />
                    <div className="status-editor__actions">
                      <button type="button" disabled={index === 0} onClick={() => moveStatus(index, -1)} aria-label={`Subir ${status.label || "columna"}`}><Icon name="arrow" /></button>
                      <button type="button" disabled={index === (form.board_settings?.statuses ?? defaultBoardSettings.statuses).length - 1} onClick={() => moveStatus(index, 1)} aria-label={`Bajar ${status.label || "columna"}`}><Icon name="arrow" /></button>
                      <button type="button" className="status-editor__delete" disabled={(form.board_settings?.statuses ?? defaultBoardSettings.statuses).length <= 1} onClick={() => removeStatus(index)} aria-label={`Eliminar ${status.label || "columna"}`}><Icon name="close" /></button>
                    </div>
                  </div>
                ))}
                <button type="button" className="status-editor__add" onClick={addStatus}><Icon name="plus" />Agregar columna</button>
              </div>
            </section>

            <section className="settings-section board-settings-section">
            <div className="settings-section__head">
              <div>
                <span>Campos del tablero</span>
                <small>Elige qué información se muestra en las tarjetas del tablero.</small>
              </div>
            </div>
            <div className="board-fields">
              {boardFieldMeta.map((field) => (
                <label className="board-field" key={field.key}>
                  <div>
                    <strong>{field.label}</strong>
                    <small>{field.hint}</small>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.board_settings?.[field.key] ?? true}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        board_settings: { ...current.board_settings, [field.key]: event.target.checked },
                      }))
                    }
                  />
                  <i className="board-switch" aria-hidden="true" />
                </label>
              ))}
            </div>
          </section>
          </>
        )}

        <footer>
          <span>Los cambios afectan a todas las vistas del proyecto.</span>
          <button className="create-button" disabled={saving || Boolean(project.archived_at)}>
            {saving ? "Guardando…" : "Guardar proyecto"}
          </button>
        </footer>
      </form>
    </div>
  );
}
