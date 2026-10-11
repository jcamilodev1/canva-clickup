import os
import tempfile
import uuid
from pathlib import Path

test_directory = tempfile.TemporaryDirectory(prefix="orbit-api-tests-")
test_database = Path(test_directory.name) / "orbit.db"
os.environ["ORBIT_DATABASE_URL"] = f"sqlite:///{test_database.as_posix()}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        engine.dispose()
        test_directory.cleanup()


def test_health_and_seeded_projects(client: TestClient):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    projects = client.get("/api/v1/projects")
    assert projects.status_code == 200
    assert len(projects.json()) == 3


def test_create_and_move_task(client: TestClient):
    project_id = client.get("/api/v1/projects").json()[0]["id"]
    created = client.post(
        "/api/v1/tasks",
        json={"project_id": project_id, "title": "Verificar flujo REST", "priority": "high"},
    )
    assert created.status_code == 201
    task_id = created.json()["id"]

    moved = client.post(f"/api/v1/tasks/{task_id}/move", json={"status": "done", "position": 0})
    assert moved.status_code == 200
    assert moved.json()["status"] == "done"


def test_create_project_and_reject_duplicate_key(client: TestClient):
    key = f"T{uuid.uuid4().hex[:6]}".upper()
    payload = {
        "key": key.lower(),
        "name": "Proyecto de prueba",
        "client": "Cliente de prueba",
        "description": "Creado desde el flujo REST.",
        "color": "#7CCBFF",
    }

    created = client.post("/api/v1/projects", json=payload)
    assert created.status_code == 201
    assert created.json()["key"] == key
    assert created.json()["task_count"] == 0

    duplicate = client.post("/api/v1/projects", json=payload)
    assert duplicate.status_code == 409


def test_project_lifecycle_and_members(client: TestClient):
    key = f"P{uuid.uuid4().hex[:6]}".upper()
    members = client.get("/api/v1/members").json()
    created = client.post(
        "/api/v1/projects",
        json={
            "key": key,
            "name": "Proyecto administrable",
            "client": "Equipo interno",
            "member_ids": [members[0]["id"], members[1]["id"]],
        },
    )
    assert created.status_code == 201
    project = created.json()
    assert len(project["members"]) == 2

    updated = client.patch(
        f"/api/v1/projects/{project['id']}",
        json={"name": "Proyecto actualizado", "member_ids": [members[0]["id"]]},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Proyecto actualizado"
    assert len(updated.json()["members"]) == 1

    archived = client.post(f"/api/v1/projects/{project['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert project["id"] not in {item["id"] for item in client.get("/api/v1/projects").json()}
    assert project["id"] in {
        item["id"]
        for item in client.get("/api/v1/projects?include_archived=true").json()
    }

    restored = client.post(f"/api/v1/projects/{project['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None

    rejected = client.request(
        "DELETE", f"/api/v1/projects/{project['id']}", json={"key": "NOPE"}
    )
    assert rejected.status_code == 422
    deleted = client.request(
        "DELETE", f"/api/v1/projects/{project['id']}", json={"key": key}
    )
    assert deleted.status_code == 204


def test_advanced_task_management(client: TestClient):
    key = f"W{uuid.uuid4().hex[:6]}".upper()
    project = client.post(
        "/api/v1/projects",
        json={"key": key, "name": "Flujo avanzado", "client": "Interno"},
    ).json()

    dependency = client.post(
        "/api/v1/tasks",
        json={"project_id": project["id"], "title": "Preparar insumos"},
    ).json()
    parent = client.post(
        "/api/v1/tasks",
        json={
            "project_id": project["id"],
            "title": "Entregar funcionalidad",
            "labels": ["backend", "release"],
            "estimate": 8,
        },
    ).json()
    subtask = client.post(
        "/api/v1/tasks",
        json={
            "project_id": project["id"],
            "parent_id": parent["id"],
            "title": "Validar contrato",
        },
    ).json()
    assert subtask["parent_id"] == parent["id"]

    checklist = client.post(
        f"/api/v1/tasks/{parent['id']}/checklist",
        json={"body": "Ejecutar pruebas", "version": parent["version"]},
    )
    assert checklist.status_code == 201
    parent = checklist.json()
    item = parent["checklist"][0]

    toggled = client.patch(
        f"/api/v1/tasks/{parent['id']}/checklist/{item['id']}",
        json={"is_done": True, "version": parent["version"]},
    )
    assert toggled.status_code == 200
    parent = toggled.json()
    assert parent["checklist"][0]["is_done"] is True

    linked = client.post(
        f"/api/v1/tasks/{parent['id']}/dependencies",
        json={"depends_on_id": dependency["id"], "version": parent["version"]},
    )
    assert linked.status_code == 201
    parent = linked.json()
    assert parent["dependencies"][0]["id"] == dependency["id"]
    assert parent["subtasks"][0]["id"] == subtask["id"]

    moved = client.post(
        f"/api/v1/tasks/{parent['id']}/move",
        json={"status": "done", "position": 0, "version": parent["version"]},
    )
    assert moved.status_code == 200
    parent = moved.json()
    assert parent["status"] == "done"

    conflict = client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"title": "Cambio obsoleto", "version": parent["version"] - 1},
    )
    assert conflict.status_code == 409

    archived = client.post(
        f"/api/v1/tasks/{parent['id']}/archive", json={"version": parent["version"]}
    )
    assert archived.status_code == 200
    parent = archived.json()
    active_ids = {
        task["id"]
        for task in client.get(f"/api/v1/tasks?project_id={project['id']}").json()
    }
    assert parent["id"] not in active_ids

    restored = client.post(
        f"/api/v1/tasks/{parent['id']}/restore", json={"version": parent["version"]}
    )
    assert restored.status_code == 200
    parent = restored.json()

    deleted = client.request(
        "DELETE",
        f"/api/v1/tasks/{parent['id']}",
        json={"version": parent["version"], "public_id": parent["public_id"]},
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/tasks/{parent['id']}").status_code == 404
