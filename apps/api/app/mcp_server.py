import json
from datetime import date

from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Project
from app.schemas import TaskCreate, TaskUpdate
from app.services import (
    add_comment,
    create_task,
    get_overview,
    get_task_or_404,
    move_task,
    serialize_task,
    update_task,
)
from app.services import (
    list_projects as service_list_projects,
)
from app.services import (
    list_tasks as service_list_tasks,
)

mcp = FastMCP(
    "Orbit Work OS",
    instructions=(
        "Internal work-management server. Read project context before changing tasks. "
        "Never archive or perform broad changes without explicit user confirmation."
    ),
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
)


def json_ready(value):
    return json.loads(json.dumps(value, default=str))


@mcp.tool()
def workspace_overview() -> dict:
    """Get a concise overview of project delivery health. This tool is read-only."""
    with SessionLocal() as session:
        return get_overview(session)


@mcp.tool()
def list_projects() -> list[dict]:
    """List active internal and client projects. This tool is read-only."""
    with SessionLocal() as session:
        return json_ready(service_list_projects(session))


@mcp.tool()
def list_tasks(
    project_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    assignee_id: str | None = None,
) -> list[dict]:
    """Find tasks using optional project, status, text, or assignee filters. Read-only."""
    with SessionLocal() as session:
        return json_ready(service_list_tasks(session, project_id, status, search, assignee_id))


@mcp.tool()
def get_task(task_id: str) -> dict:
    """Get one task by UUID or human-readable ID such as NOVA-3. Read-only."""
    with SessionLocal() as session:
        return json_ready(serialize_task(get_task_or_404(session, task_id)))


@mcp.tool()
def get_blocked_tasks(project_id: str | None = None) -> list[dict]:
    """List blocked tasks, optionally restricted to a project. Read-only."""
    with SessionLocal() as session:
        return json_ready(service_list_tasks(session, project_id=project_id, status="blocked"))


@mcp.tool()
def create_work_task(
    project_id: str,
    title: str,
    description: str = "",
    priority: str = "medium",
    assignee_id: str | None = None,
    due_date: str | None = None,
) -> dict:
    """Create a task after the user has clearly requested it. This tool writes data."""
    parsed_date = date.fromisoformat(due_date) if due_date else None
    payload = TaskCreate(
        project_id=project_id,
        title=title,
        description=description,
        priority=priority,
        assignee_id=assignee_id,
        due_date=parsed_date,
    )
    with SessionLocal() as session:
        return json_ready(create_task(session, payload, source="mcp"))


@mcp.tool()
def update_task_status(task_id: str, status: str) -> dict:
    """Move one task to a new workflow status. This tool writes data."""
    with SessionLocal() as session:
        return json_ready(move_task(session, task_id, status, 0, source="mcp"))


@mcp.tool()
def assign_task(task_id: str, assignee_id: str | None) -> dict:
    """Assign or unassign one task. This tool writes data."""
    with SessionLocal() as session:
        return json_ready(
            update_task(session, task_id, TaskUpdate(assignee_id=assignee_id), source="mcp")
        )


@mcp.tool()
def comment_on_task(task_id: str, body: str, author_id: str | None = None) -> dict:
    """Add a comment to a task after explicit user intent. This tool writes data."""
    with SessionLocal() as session:
        comment = add_comment(session, task_id, body, author_id, source="mcp")
        return {"id": comment.id, "task_id": comment.task_id, "body": comment.body}


@mcp.resource("workspace://overview")
def workspace_resource() -> str:
    """Current workspace delivery overview."""
    with SessionLocal() as session:
        return json.dumps(get_overview(session), ensure_ascii=False, default=str)


@mcp.resource("project://{project_id}")
def project_resource(project_id: str) -> str:
    """Project details and its current tasks."""
    with SessionLocal() as session:
        project = session.scalar(select(Project).where(Project.id == project_id))
        if not project:
            return json.dumps({"error": "Project not found"})
        payload = {
            "project": {"id": project.id, "key": project.key, "name": project.name},
            "tasks": service_list_tasks(session, project_id=project.id),
        }
        return json.dumps(payload, ensure_ascii=False, default=str)


@mcp.prompt()
def daily_standup(member_name: str = "el equipo") -> str:
    """Prepare a concise daily standup using live workspace data."""
    return (
        f"Prepara el standup de {member_name}. Consulta sus tareas activas, identifica bloqueos "
        "y fechas vencidas. Organiza el resultado en: terminado, en curso, siguiente y bloqueos. "
        "No modifiques ninguna tarea."
    )


@mcp.prompt()
def sprint_health(project_name: str) -> str:
    """Analyze delivery health for one project without changing data."""
    return (
        f"Analiza la salud de entrega de {project_name}. Resume avance, carga por estado, "
        "tareas urgentes, bloqueos y tres acciones recomendadas. No modifiques datos."
    )
