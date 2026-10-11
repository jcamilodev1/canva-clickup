from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

STATUSES = ("backlog", "todo", "in_progress", "review", "blocked", "done")
PRIORITIES = ("low", "medium", "high", "urgent")

DEFAULT_STATUSES = [
    {"id": "backlog", "short": "BK", "label": "Backlog", "color": "#E4E5DE"},
    {"id": "todo", "short": "PH", "label": "Por hacer", "color": "#E4E5DE"},
    {"id": "in_progress", "short": "EC", "label": "En curso", "color": "#D9EFFC"},
    {"id": "review", "short": "RV", "label": "Revisión", "color": "#FFF0BD"},
    {"id": "blocked", "short": "BL", "label": "Bloqueado", "color": "#FFDED7"},
    {"id": "done", "short": "OK", "label": "Terminado", "color": "#DFF3AB"},
]


class StatusConfig(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    short: str = Field(min_length=1, max_length=4)
    label: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class BoardSettings(BaseModel):
    priority: bool = True
    due_date: bool = True
    assignee: bool = True
    labels: bool = True
    checklist: bool = True
    subtasks: bool = True
    statuses: list[StatusConfig] = Field(
        default_factory=lambda: [StatusConfig(**status) for status in DEFAULT_STATUSES]
    )


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str
    role: str
    initials: str
    color: str


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    name: str
    client: str
    description: str
    color: str
    created_at: datetime
    archived_at: datetime | None = None
    board_settings: BoardSettings = Field(default_factory=BoardSettings)
    members: list[MemberOut] = Field(default_factory=list)
    task_count: int = 0
    completed_count: int = 0


class ProjectCreate(BaseModel):
    key: str = Field(min_length=2, max_length=8, pattern=r"^[A-Z][A-Z0-9_-]*$")
    name: str = Field(min_length=2, max_length=120)
    client: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=5000)
    color: str = Field(default="#B8F23D", pattern=r"^#[0-9A-Fa-f]{6}$")
    board_settings: BoardSettings | None = None
    member_ids: list[str] = Field(default_factory=list)

    @field_validator("key", mode="before")
    @classmethod
    def normalize_key(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("name", "client", mode="before")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return value.strip()


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    client: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    board_settings: BoardSettings | None = None
    member_ids: list[str] | None = None

    @field_validator("name", "client", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class ProjectDeleteConfirm(BaseModel):
    key: str


class TaskCreate(BaseModel):
    project_id: str
    title: str = Field(min_length=2, max_length=240)
    description: str = ""
    status: str = "todo"
    priority: str = "medium"
    due_date: date | None = None
    estimate: int = Field(default=0, ge=0, le=1000)
    assignee_id: str | None = None
    labels: list[str] = Field(default_factory=list)
    parent_id: str | None = None

    @field_validator("title", mode="before")
    @classmethod
    def normalize_task_title(cls, value: str) -> str:
        return value.strip()


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: date | None = None
    estimate: int | None = Field(default=None, ge=0, le=1000)
    assignee_id: str | None = None
    labels: list[str] | None = None
    version: int | None = Field(default=None, ge=1)

    @field_validator("title", mode="before")
    @classmethod
    def normalize_updated_title(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class TaskMove(BaseModel):
    status: str
    position: int = Field(default=0, ge=0)
    version: int | None = Field(default=None, ge=1)


class VersionPayload(BaseModel):
    version: int = Field(ge=1)


class TaskDeleteConfirm(VersionPayload):
    public_id: str


class ChecklistItemCreate(VersionPayload):
    body: str = Field(min_length=1, max_length=500)


class ChecklistItemUpdate(VersionPayload):
    body: str | None = Field(default=None, min_length=1, max_length=500)
    is_done: bool | None = None


class DependencyCreate(VersionPayload):
    depends_on_id: str


class ChecklistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    body: str
    is_done: bool
    position: int


class TaskReferenceOut(BaseModel):
    id: str
    public_id: str
    title: str
    status: str


class TaskOut(BaseModel):
    id: str
    public_id: str
    number: int
    title: str
    description: str
    status: str
    priority: str
    due_date: date | None
    estimate: int
    labels: list[str]
    position: int
    project_id: str
    project_name: str
    assignee: MemberOut | None
    parent_id: str | None
    archived_at: datetime | None
    version: int
    comment_count: int
    checklist: list[ChecklistItemOut] = Field(default_factory=list)
    subtasks: list[TaskReferenceOut] = Field(default_factory=list)
    dependencies: list[TaskReferenceOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    author_id: str | None = None


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    body: str
    author: MemberOut | None
    created_at: datetime


class OverviewOut(BaseModel):
    total_tasks: int
    completed_tasks: int
    blocked_tasks: int
    active_projects: int
    focus_score: int
