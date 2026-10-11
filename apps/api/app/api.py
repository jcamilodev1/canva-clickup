from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_session
from app.models import Comment, Member
from app.schemas import (
    ChecklistItemCreate,
    ChecklistItemUpdate,
    CommentCreate,
    CommentOut,
    DependencyCreate,
    MemberOut,
    OverviewOut,
    ProjectCreate,
    ProjectDeleteConfirm,
    ProjectOut,
    ProjectUpdate,
    TaskCreate,
    TaskDeleteConfirm,
    TaskMove,
    TaskOut,
    TaskUpdate,
    VersionPayload,
)
from app.services import (
    add_checklist_item,
    add_comment,
    add_dependency,
    archive_project,
    archive_task,
    create_project,
    create_task,
    delete_checklist_item,
    delete_dependency,
    delete_project,
    delete_task,
    get_overview,
    get_task_or_404,
    list_projects,
    list_tasks,
    move_task,
    restore_project,
    restore_task,
    serialize_task,
    update_checklist_item,
    update_project,
    update_task,
)

router = APIRouter(prefix="/api/v1")


@router.get("/overview", response_model=OverviewOut)
def overview(session: Session = Depends(get_session)) -> dict:
    return get_overview(session)


@router.get("/projects", response_model=list[ProjectOut])
def projects(
    include_archived: bool = False, session: Session = Depends(get_session)
) -> list[dict]:
    return list_projects(session, include_archived=include_archived)


@router.post("/projects", response_model=ProjectOut, status_code=201)
def project_create(payload: ProjectCreate, session: Session = Depends(get_session)) -> dict:
    return create_project(session, payload)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def project_update(
    project_id: str, payload: ProjectUpdate, session: Session = Depends(get_session)
) -> dict:
    return update_project(session, project_id, payload)


@router.post("/projects/{project_id}/archive", response_model=ProjectOut)
def project_archive(project_id: str, session: Session = Depends(get_session)) -> dict:
    return archive_project(session, project_id)


@router.post("/projects/{project_id}/restore", response_model=ProjectOut)
def project_restore(project_id: str, session: Session = Depends(get_session)) -> dict:
    return restore_project(session, project_id)


@router.delete("/projects/{project_id}", status_code=204)
def project_delete(
    project_id: str,
    payload: ProjectDeleteConfirm,
    session: Session = Depends(get_session),
) -> None:
    delete_project(session, project_id, payload.key)


@router.get("/members", response_model=list[MemberOut])
def members(session: Session = Depends(get_session)) -> list[Member]:
    return list(session.scalars(select(Member).order_by(Member.name)).all())


@router.get("/tasks", response_model=list[TaskOut])
def tasks(
    project_id: str | None = None,
    status: str | None = None,
    search: str | None = Query(default=None, max_length=120),
    assignee_id: str | None = None,
    include_archived: bool = False,
    include_subtasks: bool = False,
    session: Session = Depends(get_session),
) -> list[dict]:
    return list_tasks(
        session,
        project_id,
        status,
        search,
        assignee_id,
        include_archived,
        include_subtasks,
    )


@router.get("/tasks/{task_id}", response_model=TaskOut)
def task_detail(task_id: str, session: Session = Depends(get_session)) -> dict:
    return serialize_task(get_task_or_404(session, task_id))


@router.post("/tasks", response_model=TaskOut, status_code=201)
def task_create(payload: TaskCreate, session: Session = Depends(get_session)) -> dict:
    return create_task(session, payload)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def task_update(task_id: str, payload: TaskUpdate, session: Session = Depends(get_session)) -> dict:
    return update_task(session, task_id, payload)


@router.post("/tasks/{task_id}/move", response_model=TaskOut)
def task_move(task_id: str, payload: TaskMove, session: Session = Depends(get_session)) -> dict:
    return move_task(
        session,
        task_id,
        payload.status,
        payload.position,
        expected_version=payload.version,
    )


@router.post("/tasks/{task_id}/archive", response_model=TaskOut)
def task_archive(
    task_id: str, payload: VersionPayload, session: Session = Depends(get_session)
) -> dict:
    return archive_task(session, task_id, payload.version)


@router.post("/tasks/{task_id}/restore", response_model=TaskOut)
def task_restore(
    task_id: str, payload: VersionPayload, session: Session = Depends(get_session)
) -> dict:
    return restore_task(session, task_id, payload.version)


@router.delete("/tasks/{task_id}", status_code=204)
def task_delete(
    task_id: str,
    payload: TaskDeleteConfirm,
    session: Session = Depends(get_session),
) -> None:
    delete_task(session, task_id, payload.version, payload.public_id)


@router.post("/tasks/{task_id}/checklist", response_model=TaskOut, status_code=201)
def checklist_create(
    task_id: str,
    payload: ChecklistItemCreate,
    session: Session = Depends(get_session),
) -> dict:
    return add_checklist_item(session, task_id, payload)


@router.patch("/tasks/{task_id}/checklist/{item_id}", response_model=TaskOut)
def checklist_update(
    task_id: str,
    item_id: str,
    payload: ChecklistItemUpdate,
    session: Session = Depends(get_session),
) -> dict:
    return update_checklist_item(session, task_id, item_id, payload)


@router.delete("/tasks/{task_id}/checklist/{item_id}", response_model=TaskOut)
def checklist_delete(
    task_id: str,
    item_id: str,
    payload: VersionPayload,
    session: Session = Depends(get_session),
) -> dict:
    return delete_checklist_item(session, task_id, item_id, payload.version)


@router.post("/tasks/{task_id}/dependencies", response_model=TaskOut, status_code=201)
def dependency_create(
    task_id: str,
    payload: DependencyCreate,
    session: Session = Depends(get_session),
) -> dict:
    return add_dependency(session, task_id, payload)


@router.delete("/tasks/{task_id}/dependencies/{dependency_id}", response_model=TaskOut)
def dependency_delete(
    task_id: str,
    dependency_id: str,
    payload: VersionPayload,
    session: Session = Depends(get_session),
) -> dict:
    return delete_dependency(session, task_id, dependency_id, payload.version)


@router.get("/tasks/{task_id}/comments", response_model=list[CommentOut])
def comments(task_id: str, session: Session = Depends(get_session)) -> list[Comment]:
    task = get_task_or_404(session, task_id)
    statement = (
        select(Comment)
        .options(selectinload(Comment.author))
        .where(Comment.task_id == task.id)
        .order_by(Comment.created_at)
    )
    return list(session.scalars(statement).all())


@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=201)
def comment_create(
    task_id: str,
    payload: CommentCreate,
    session: Session = Depends(get_session),
) -> Comment:
    comment = add_comment(session, task_id, payload.body, payload.author_id)
    return session.scalar(
        select(Comment).options(selectinload(Comment.author)).where(Comment.id == comment.id)
    )
