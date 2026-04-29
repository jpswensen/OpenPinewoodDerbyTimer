import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models.database import init_db
from .routers import certificates, connection, groups, import_export, racers, races, websocket
from .services.connection_manager import ConnectionManager
from .services.event_bus import event_bus

app = FastAPI(title="PWDTimer API")


def _cors_origins() -> list[str]:
    defaults = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    configured = os.environ.get("PWD_TIMER_CORS_ORIGINS", "")
    extras = [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [*defaults, *extras]


@app.on_event("startup")
async def _startup() -> None:
    await init_db()
    # Single shared manager for the process.
    app.state.connection_manager = ConnectionManager(event_bus=event_bus)


@app.on_event("shutdown")
async def _shutdown() -> None:
    mgr = getattr(app.state, "connection_manager", None)
    if mgr is not None:
        await mgr.shutdown()


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(groups.router)
app.include_router(racers.router)
app.include_router(import_export.router)
app.include_router(races.router)
app.include_router(connection.router)
app.include_router(certificates.router)
app.include_router(websocket.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# ── Production static file serving ───────────────────────────────────────────
# When PWD_TIMER_STATIC_DIR is set and points to a directory containing
# index.html, the backend serves the built frontend directly (no separate
# nginx or Vite dev server needed).
_static_dir = os.environ.get("PWD_TIMER_STATIC_DIR", "")
if _static_dir:
    _static_path = Path(_static_dir)
    if _static_path.is_dir() and (_static_path / "index.html").is_file():
        # Mount hashed assets with aggressive caching
        _assets = _static_path / "assets"
        if _assets.is_dir():
            app.mount(
                "/assets",
                StaticFiles(directory=str(_assets)),
                name="static-assets",
            )

        @app.get("/{full_path:path}")
        async def _serve_spa(request: Request, full_path: str) -> FileResponse:
            """Serve static files or fall back to index.html for SPA routing."""
            file = _static_path / full_path
            if full_path and file.is_file():
                return FileResponse(str(file))
            return FileResponse(str(_static_path / "index.html"))
