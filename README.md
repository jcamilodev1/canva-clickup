# Orbit Work OS

MVP de gestión interna para una empresa de desarrollo. Next.js consume una API REST de FastAPI; los agentes autorizados usan MCP Streamable HTTP. Ambas interfaces ejecutan la misma capa de servicios y escriben en la misma base de datos.

## Lo que ya funciona

- Proyectos, miembros y tareas con datos iniciales.
- Tablero Kanban con drag and drop y vista de lista.
- Creación, búsqueda, filtros y edición de tareas.
- API REST documentada en OpenAPI.
- Servidor MCP con herramientas de lectura y escritura, recursos y prompts.
- SQLite para empezar sin infraestructura y PostgreSQL mediante configuración.
- Pruebas del flujo principal y diseño responsive.

## Requisitos

- Node.js 20 o superior.
- Python 3.11 o superior.
- uv.
- Docker, solo si se quiere usar PostgreSQL local.

## Ejecutar el backend

```powershell
cd apps/api
uv sync --extra dev
uv run uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000`, OpenAPI en `http://localhost:8000/docs` y MCP en `http://localhost:8000/mcp`.

Por defecto se crea `orbit.db` con datos de demostración. Para PostgreSQL:

```powershell
docker compose up -d postgres
$env:ORBIT_DATABASE_URL="postgresql+psycopg://orbit:orbit@localhost:5432/orbit"
uv run uvicorn app.main:app --reload --port 8000
```

## Ejecutar el frontend

En otra terminal:

```powershell
cd apps/web
npm install
npm run dev
```

Abre `http://localhost:3000`. Si la API cambia de dirección, copia `.env.example` a `.env.local` y actualiza `NEXT_PUBLIC_API_URL`.

## Probar

```powershell
cd apps/api
uv run pytest -q
uv run ruff check app tests

cd ../web
npm run typecheck
npm run build
```

## MCP

El servidor ofrece herramientas como `list_projects`, `list_tasks`, `get_task`, `get_blocked_tasks`, `create_work_task`, `update_task_status`, `assign_task` y `comment_on_task`.

Para inspeccionarlo con un cliente compatible, inicia el backend y conecta a:

```text
http://localhost:8000/mcp
```

Las herramientas que cambian datos registran `source=mcp` en la actividad. La autenticación todavía es deliberadamente local; antes de un despliegue compartido hay que implementar SSO/OAuth, permisos por proyecto y scopes MCP.

## Próximas prioridades

1. SSO corporativo y control de acceso por roles.
2. Migraciones Alembic y PostgreSQL como base principal.
3. Comentarios completos, actividad visible y archivos adjuntos.
4. Sprints, backlog y estimaciones.
5. Autorización OAuth para el endpoint MCP.
