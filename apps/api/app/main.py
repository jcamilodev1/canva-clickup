from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router
from app.config import settings
from app.database import SessionLocal, create_database
from app.mcp_server import mcp
from app.seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_database()
    with SessionLocal() as session:
        seed_database(session)
    async with mcp.session_manager.run():
        yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Internal project operations API with REST and MCP interfaces.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.mount("/mcp", mcp.streamable_http_app())


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": settings.app_name, "mcp": "/mcp"}
