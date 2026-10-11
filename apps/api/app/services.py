import json
from datetime import UTC, date, datetime

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ActivityEvent,
    ChecklistItem,
    Comment,
    Member,
    Project,
    Task,
    task_dependencies,
)
from app.schemas import (
    DEFAULT_STATUSES,
    PRIORITIES,
    BoardSettings,
    ChecklistItemCreate,
    ChecklistItemUpdate,
    DependencyCreate,
    ProjectCreate,
    ProjectUpdate,
    TaskCreate,
    TaskUpdate,
)


def utc_now() -> datetime:
    return datetime.now(UTC)


def task_options():
    return (
        selectinload(Task.project),
        selectinload(Task.assignee),
        selectinload(Task.comments),
        selectinload(Task.checklist),
        selectinload(Task.subtasks).selectinload(Task.project),
        selectinload(Task.dependencies).selectinload(Task.project),
    )


def serialize_task_reference(task: Task) -> dict:
    return {
        "id": task.id,
        "public_id": task.public_id,
        "title": task.title,
        "status": task.status,
    }


def serialize_task(task: Task) -> dict:
    return {
        "id": task.id,
        "public_id": task.public_id,
        "number": task.number,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "estimate": task.estimate,
        "labels": [label for label in task.labels.split(",") if label],
        "position": task.position,
        "project_id": task.project_id,
        "project_name": task.project.name,
        "assignee": task.assignee,
        "parent_id": task.parent_id,
        "archived_at": task.archived_at,
        "version": task.version,
        "comment_count": len(task.comments),
        "checklist": task.checklist,
        "subtasks": [serialize_task_reference(subtask) for subtask in task.subtasks],
        "dependencies": [
            serialize_task_reference(dependency) for dependency in task.dependencies
        ],
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def get_task_or_404(session: Session, task_id: str) -> Task:
    filters = [Task.id == task_id]
    if "-" in task_id:
        project_key, _, number = task_id.rpartition("-")
        if number.isdigit():
            filters.append((Project.key == project_key.upper()) & (Task.number == int(number)))
    statement = (
        select(Task)
        .join(Project)
        .options(*task_options())
        .where(or_(*filters))
    )
    task = session.scalar(statement)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def get_project_or_404(session: Session, project_id: str) -> Project:
    project = session.scalar(
        select(Project).options(selectinload(Project.members)).where(Project.id == project_id)
    )
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return project


def serialize_project(session: Session, project: Project) -> dict:
    active_task_filter = (Task.project_id == project.id, Task.archived_at.is_(None))
    total = session.scalar(select(func.count(Task.id)).where(*active_task_filter)) or 0
    completed = (
        session.scalar(
            select(func.count(Task.id)).where(*active_task_filter, Task.status == "done")
        )
        or 0
    )
    board_settings = json.loads(project.board_settings or "{}")
    if "statuses" not in board_settings:
        board_settings["statuses"] = DEFAULT_STATUSES
    return {
        "id": project.id,
        "key": project.key,
        "name": project.name,
        "client": project.client,
        "description": project.description,
        "color": project.color,
        "board_settings": board_settings,
        "created_at": project.created_at,
        "archived_at": project.archived_at,
        "members": project.members,
        "task_count": total,
        "completed_count": completed,
    }


def _project_status_ids(session: Session, project_id: str) -> set[str]:
    project = session.get(Project, project_id)
    settings = json.loads(project.board_settings or "{}") if project else {}
    statuses = settings.get("statuses") or DEFAULT_STATUSES
    return {status["id"] for status in statuses}


def list_projects(session: Session, include_archived: bool = False) -> list[dict]:
    statement = select(Project).options(selectinload(Project.members))
    if not include_archived:
        statement = statement.where(Project.archived_at.is_(None))
    projects = session.scalars(statement.order_by(Project.created_at)).all()
    result = []
    for project in projects:
        result.append(serialize_project(session, project))
    return result


def create_project(session: Session, payload: ProjectCreate) -> dict:
    if session.scalar(select(Project.id).where(Project.key == payload.key)):
        raise HTTPException(status_code=409, detail="La clave del proyecto ya existe")

    members = []
    if payload.member_ids:
        members = list(session.scalars(select(Member).where(Member.id.in_(payload.member_ids))).all())
        if len(members) != len(set(payload.member_ids)):
            raise HTTPException(status_code=404, detail="Uno o más miembros no existen")

    project = Project(
        key=payload.key,
        name=payload.name,
        client=payload.client,
        description=payload.description.strip(),
        color=payload.color.upper(),
        board_settings=json.dumps(payload.board_settings.model_dump()) if payload.board_settings else "{}",
        members=members,
    )
    session.add(project)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="La clave del proyecto ya existe") from error
    session.refresh(project)
    return serialize_project(session, get_project_or_404(session, project.id))


def update_project(session: Session, project_id: str, payload: ProjectUpdate) -> dict:
    project = get_project_or_404(session, project_id)
    changes = payload.model_dump(exclude_unset=True)
    member_ids = changes.pop("member_ids", None)
    board_settings = changes.pop("board_settings", None)
    if board_settings is not None:
        parsed = BoardSettings(**board_settings)
        statuses = parsed.statuses
        if not statuses:
            raise HTTPException(status_code=422, detail="Debe existir al menos una columna")
        status_ids = [status.id for status in statuses]
        if len(set(status_ids)) != len(status_ids):
            raise HTTPException(status_code=422, detail="Los estados no pueden repetirse")
        old_settings = json.loads(project.board_settings or "{}")
        old_ids = {
            status["id"] for status in (old_settings.get("statuses") or DEFAULT_STATUSES)
        }
        removed_ids = old_ids - set(status_ids)
        if removed_ids:
            session.execute(
                update(Task)
                .where(
                    Task.project_id == project.id,
                    Task.status.in_(removed_ids),
                )
                .values(status=status_ids[0])
            )
        project.board_settings = json.dumps(parsed.model_dump())
    if member_ids is not None:
        members = list(session.scalars(select(Member).where(Member.id.in_(member_ids))).all())
        if len(members) != len(set(member_ids)):
            raise HTTPException(status_code=404, detail="Uno o más miembros no existen")
        project.members = members
    for field, value in changes.items():
        if field == "description" and value is not None:
            value = value.strip()
        if field == "color" and value is not None:
            value = value.upper()
        setattr(project, field, value)
    session.commit()
    return serialize_project(session, get_project_or_404(session, project.id))


def archive_project(session: Session, project_id: str) -> dict:
    project = get_project_or_404(session, project_id)
    project.archived_at = project.archived_at or utc_now()
    session.commit()
    return serialize_project(session, get_project_or_404(session, project.id))


def restore_project(session: Session, project_id: str) -> dict:
    project = get_project_or_404(session, project_id)
    project.archived_at = None
    session.commit()
    return serialize_project(session, get_project_or_404(session, project.id))


def delete_project(session: Session, project_id: str, confirmation_key: str) -> None:
    project = get_project_or_404(session, project_id)
    if project.key != confirmation_key.strip().upper():
        raise HTTPException(status_code=422, detail="La clave de confirmación no coincide")
    project_tasks = list(
        session.scalars(
            select(Task)
            .options(selectinload(Task.dependencies))
            .where(Task.project_id == project.id)
        ).all()
    )
    task_ids = [task.id for task in project_tasks]
    if task_ids:
        for task in project_tasks:
            task.dependencies.clear()
        session.flush()
        session.execute(
            delete(task_dependencies).where(
                or_(
                    task_dependencies.c.task_id.in_(task_ids),
                    task_dependencies.c.depends_on_id.in_(task_ids),
                )
            )
        )
    session.delete(project)
    session.commit()


def list_tasks(
    session: Session,
    project_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    assignee_id: str | None = None,
    include_archived: bool = False,
    include_subtasks: bool = False,
) -> list[dict]:
    statement = select(Task).options(*task_options())
    if not include_archived:
        statement = statement.where(Task.archived_at.is_(None))
    if not include_subtasks:
        statement = statement.where(Task.parent_id.is_(None))
    if project_id:
        statement = statement.where(Task.project_id == project_id)
    if status:
        statement = statement.where(Task.status == status)
    if assignee_id:
        statement = statement.where(Task.assignee_id == assignee_id)
    if search:
        query = f"%{search.strip()}%"
        statement = statement.where(or_(Task.title.ilike(query), Task.description.ilike(query)))
    tasks = session.scalars(statement.order_by(Task.status, Task.position, Task.created_at)).all()
    return [serialize_task(task) for task in tasks]


def create_task(session: Session, payload: TaskCreate, source: str = "rest") -> dict:
    project = session.get(Project, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if project.archived_at:
        raise HTTPException(status_code=409, detail="No se pueden crear tareas en un proyecto archivado")
    if payload.status not in _project_status_ids(session, payload.project_id):
        raise HTTPException(status_code=422, detail="Invalid status")
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=422, detail="Invalid priority")
    if payload.assignee_id and not session.get(Member, payload.assignee_id):
        raise HTTPException(status_code=404, detail="Responsable no encontrado")
    labels = [label.strip() for label in payload.labels if label.strip()]
    if any("," in label for label in labels):
        raise HTTPException(status_code=422, detail="Las etiquetas no pueden contener comas")
    parent = None
    if payload.parent_id:
        parent = get_task_or_404(session, payload.parent_id)
        if parent.project_id != payload.project_id:
            raise HTTPException(status_code=422, detail="La subtarea debe pertenecer al mismo proyecto")
        if parent.archived_at:
            raise HTTPException(status_code=409, detail="La tarea principal está archivada")

    next_number = (
        session.scalar(select(func.max(Task.number)).where(Task.project_id == payload.project_id))
        or 0
    ) + 1
    next_position = (
        session.scalar(
            select(func.count(Task.id)).where(
                Task.project_id == payload.project_id,
                Task.status == payload.status,
                Task.parent_id == payload.parent_id,
                Task.archived_at.is_(None),
            )
        )
        or 0
    )
    task = Task(
        number=next_number,
        title=payload.title.strip(),
        description=payload.description.strip(),
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
        estimate=payload.estimate,
        assignee_id=payload.assignee_id,
        project_id=payload.project_id,
        parent_id=payload.parent_id,
        labels=",".join(dict.fromkeys(labels)),
        position=next_position,
    )
    session.add(task)
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Otra tarea fue creada al mismo tiempo; inténtalo de nuevo"
        ) from error
    session.add(
        ActivityEvent(action="task.created", detail=task.title, source=source, task_id=task.id)
    )
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def update_task(session: Session, task_id: str, payload: TaskUpdate, source: str = "rest") -> dict:
    task = get_task_or_404(session, task_id)
    changes = payload.model_dump(exclude_unset=True)
    expected_version = changes.pop("version", None)
    assert_task_version(task, expected_version)
    if "status" in changes and changes["status"] not in _project_status_ids(session, task.project_id):
        raise HTTPException(status_code=422, detail="Invalid status")
    if "priority" in changes and changes["priority"] not in PRIORITIES:
        raise HTTPException(status_code=422, detail="Invalid priority")
    if changes.get("assignee_id") and not session.get(Member, changes["assignee_id"]):
        raise HTTPException(status_code=404, detail="Responsable no encontrado")
    if "labels" in changes:
        labels = [label.strip() for label in changes["labels"] or [] if label.strip()]
        if any("," in label for label in labels):
            raise HTTPException(status_code=422, detail="Las etiquetas no pueden contener comas")
        changes["labels"] = ",".join(dict.fromkeys(labels))
    if "title" in changes and changes["title"] is not None:
        changes["title"] = changes["title"].strip()
        if len(changes["title"]) < 2:
            raise HTTPException(status_code=422, detail="El título es demasiado corto")
    if "description" in changes and changes["description"] is not None:
        changes["description"] = changes["description"].strip()
    for field, value in changes.items():
        setattr(task, field, value)
    task.version += 1
    session.add(
        ActivityEvent(
            action="task.updated",
            detail=", ".join(changes.keys()),
            source=source,
            task_id=task.id,
        )
    )
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def assert_task_version(task: Task, expected_version: int | None) -> None:
    if expected_version is not None and task.version != expected_version:
        raise HTTPException(
            status_code=409,
            detail="La tarea cambió en otra sesión. Recarga sus datos antes de guardar.",
        )


def normalize_task_positions(session: Session, task: Task) -> None:
    siblings = session.scalars(
        select(Task)
        .where(
            Task.project_id == task.project_id,
            Task.parent_id == task.parent_id,
            Task.status == task.status,
            Task.archived_at.is_(None),
        )
        .order_by(Task.position, Task.created_at)
    ).all()
    for index, sibling in enumerate(siblings):
        sibling.position = index


def move_task(
    session: Session,
    task_id: str,
    status: str,
    position: int,
    source: str = "rest",
    expected_version: int | None = None,
) -> dict:
    task = get_task_or_404(session, task_id)
    if status not in _project_status_ids(session, task.project_id):
        raise HTTPException(status_code=422, detail="Invalid status")
    assert_task_version(task, expected_version)
    previous_status = task.status
    previous_parent_id = task.parent_id
    previous_project_id = task.project_id
    old_siblings = list(
        session.scalars(
            select(Task)
            .where(
                Task.id != task.id,
                Task.project_id == previous_project_id,
                Task.parent_id == previous_parent_id,
                Task.status == previous_status,
                Task.archived_at.is_(None),
            )
            .order_by(Task.position, Task.created_at)
        ).all()
    )
    task.status = status
    target_siblings = list(
        session.scalars(
            select(Task)
            .where(
                Task.id != task.id,
                Task.project_id == task.project_id,
                Task.parent_id == task.parent_id,
                Task.status == status,
                Task.archived_at.is_(None),
            )
            .order_by(Task.position, Task.created_at)
        ).all()
    )
    insert_at = min(position, len(target_siblings))
    target_siblings.insert(insert_at, task)
    for index, sibling in enumerate(old_siblings):
        sibling.position = index
    for index, sibling in enumerate(target_siblings):
        if sibling.position != index:
            sibling.version += 1
        sibling.position = index
    task.version += 1
    session.add(
        ActivityEvent(
            action="task.moved",
            detail=f"{previous_status} -> {status}",
            source=source,
            task_id=task.id,
        )
    )
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def archive_task(session: Session, task_id: str, expected_version: int) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, expected_version)
    archived_at = utc_now()
    task.archived_at = archived_at
    task.version += 1
    for subtask in task.subtasks:
        subtask.archived_at = archived_at
        subtask.version += 1
    session.add(
        ActivityEvent(action="task.archived", source="rest", task_id=task.id)
    )
    session.flush()
    normalize_task_positions(session, task)
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def restore_task(session: Session, task_id: str, expected_version: int) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, expected_version)
    if task.parent_id:
        parent = get_task_or_404(session, task.parent_id)
        if parent.archived_at:
            raise HTTPException(
                status_code=409, detail="Restaura primero la tarea principal"
            )
    task.archived_at = None
    task.version += 1
    for subtask in task.subtasks:
        subtask.archived_at = None
        subtask.version += 1
    task.position = (
        session.scalar(
            select(func.count(Task.id)).where(
                Task.project_id == task.project_id,
                Task.parent_id == task.parent_id,
                Task.status == task.status,
                Task.archived_at.is_(None),
            )
        )
        or 0
    )
    session.add(
        ActivityEvent(action="task.restored", source="rest", task_id=task.id)
    )
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def delete_task(
    session: Session, task_id: str, expected_version: int, confirmation_public_id: str
) -> None:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, expected_version)
    if task.public_id != confirmation_public_id.strip().upper():
        raise HTTPException(status_code=422, detail="El ID de confirmación no coincide")
    project_id = task.project_id
    parent_id = task.parent_id
    status = task.status
    task_tree = [task, *task.subtasks]
    task_tree_ids = [item.id for item in task_tree]
    for item in task_tree:
        item.dependencies.clear()
    session.flush()
    session.execute(
        delete(task_dependencies).where(
            or_(
                task_dependencies.c.task_id.in_(task_tree_ids),
                task_dependencies.c.depends_on_id.in_(task_tree_ids),
            )
        )
    )
    session.delete(task)
    session.flush()
    siblings = session.scalars(
        select(Task)
        .where(
            Task.project_id == project_id,
            Task.parent_id == parent_id,
            Task.status == status,
            Task.archived_at.is_(None),
        )
        .order_by(Task.position, Task.created_at)
    ).all()
    for index, sibling in enumerate(siblings):
        sibling.position = index
    session.commit()


def add_checklist_item(
    session: Session, task_id: str, payload: ChecklistItemCreate
) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, payload.version)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="El elemento no puede estar vacío")
    item = ChecklistItem(
        body=body,
        position=len(task.checklist),
    )
    task.checklist.append(item)
    task.version += 1
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def update_checklist_item(
    session: Session,
    task_id: str,
    item_id: str,
    payload: ChecklistItemUpdate,
) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, payload.version)
    item = session.scalar(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id, ChecklistItem.task_id == task.id
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Elemento de checklist no encontrado")
    changes = payload.model_dump(exclude={"version"}, exclude_unset=True)
    if "body" in changes:
        changes["body"] = changes["body"].strip()
        if not changes["body"]:
            raise HTTPException(status_code=422, detail="El elemento no puede estar vacío")
    for field, value in changes.items():
        setattr(item, field, value)
    task.version += 1
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def delete_checklist_item(
    session: Session, task_id: str, item_id: str, expected_version: int
) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, expected_version)
    item = session.scalar(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id, ChecklistItem.task_id == task.id
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Elemento de checklist no encontrado")
    session.delete(item)
    task.version += 1
    session.flush()
    remaining_items = [
        checklist_item for checklist_item in task.checklist if checklist_item.id != item_id
    ]
    for index, checklist_item in enumerate(remaining_items):
        checklist_item.position = index
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def dependency_reaches(session: Session, start_id: str, target_id: str) -> bool:
    pending = [start_id]
    visited: set[str] = set()
    while pending:
        current_id = pending.pop()
        if current_id == target_id:
            return True
        if current_id in visited:
            continue
        visited.add(current_id)
        pending.extend(
            session.scalars(
                select(task_dependencies.c.depends_on_id).where(
                    task_dependencies.c.task_id == current_id
                )
            ).all()
        )
    return False


def add_dependency(session: Session, task_id: str, payload: DependencyCreate) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, payload.version)
    dependency = get_task_or_404(session, payload.depends_on_id)
    if dependency.id == task.id:
        raise HTTPException(status_code=422, detail="Una tarea no puede depender de sí misma")
    if dependency.project_id != task.project_id:
        raise HTTPException(status_code=422, detail="La dependencia debe ser del mismo proyecto")
    if any(existing.id == dependency.id for existing in task.dependencies):
        raise HTTPException(status_code=409, detail="La dependencia ya existe")
    if dependency_reaches(session, dependency.id, task.id):
        raise HTTPException(status_code=422, detail="La dependencia crearía un ciclo")
    task.dependencies.append(dependency)
    task.version += 1
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def delete_dependency(
    session: Session, task_id: str, dependency_id: str, expected_version: int
) -> dict:
    task = get_task_or_404(session, task_id)
    assert_task_version(task, expected_version)
    dependency = next(
        (existing for existing in task.dependencies if existing.id == dependency_id), None
    )
    if not dependency:
        raise HTTPException(status_code=404, detail="Dependencia no encontrada")
    task.dependencies.remove(dependency)
    task.version += 1
    session.commit()
    return serialize_task(get_task_or_404(session, task.id))


def add_comment(
    session: Session,
    task_id: str,
    body: str,
    author_id: str | None = None,
    source: str = "rest",
) -> Comment:
    task = get_task_or_404(session, task_id)
    if author_id and not session.get(Member, author_id):
        raise HTTPException(status_code=404, detail="Author not found")
    comment = Comment(body=body.strip(), task_id=task.id, author_id=author_id)
    session.add(comment)
    session.flush()
    session.add(
        ActivityEvent(action="comment.added", detail=body[:120], source=source, task_id=task.id)
    )
    session.commit()
    session.refresh(comment)
    return comment


def get_overview(session: Session) -> dict:
    active_task = Task.archived_at.is_(None)
    total = session.scalar(select(func.count(Task.id)).where(active_task)) or 0
    completed = (
        session.scalar(select(func.count(Task.id)).where(active_task, Task.status == "done"))
        or 0
    )
    blocked = (
        session.scalar(select(func.count(Task.id)).where(active_task, Task.status == "blocked"))
        or 0
    )
    projects = (
        session.scalar(select(func.count(Project.id)).where(Project.archived_at.is_(None))) or 0
    )
    due_soon = (
        session.scalar(
            select(func.count(Task.id)).where(
                active_task, Task.due_date <= date.today(), Task.status != "done"
            )
        )
        or 0
    )
    focus_score = max(
        0, min(100, round((completed / total * 100 if total else 100) - due_soon * 3))
    )
    return {
        "total_tasks": total,
        "completed_tasks": completed,
        "blocked_tasks": blocked,
        "active_projects": projects,
        "focus_score": focus_score,
    }
