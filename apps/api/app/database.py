from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session


def create_database() -> None:
    from app import models  # noqa: F401

    existing_tables = set(inspect(engine).get_table_names())
    Base.metadata.create_all(bind=engine)

    timestamp_type = "DATETIME" if engine.dialect.name == "sqlite" else "TIMESTAMP WITH TIME ZONE"
    required_columns = {
        "projects": {
            "archived_at": timestamp_type,
            "board_settings": "TEXT NOT NULL DEFAULT '{}'",
        },
        "tasks": {
            "parent_id": "VARCHAR(36)",
            "archived_at": timestamp_type,
            "version": "INTEGER NOT NULL DEFAULT 1",
        },
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table_name, columns in required_columns.items():
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                    )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_task_project_number "
                "ON tasks (project_id, number)"
            )
        )
        if {
            "projects",
            "members",
        }.issubset(existing_tables) and "project_members" not in existing_tables:
            connection.execute(
                text(
                    "INSERT INTO project_members (project_id, member_id) "
                    "SELECT projects.id, members.id FROM projects CROSS JOIN members"
                )
            )
