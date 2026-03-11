from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models.database import init_db
from .routers import connection, groups, import_export, racers, races, websocket
from .services.connection_manager import ConnectionManager
from .services.event_bus import event_bus

app = FastAPI(title="PWDTimer API")


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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(groups.router)
app.include_router(racers.router)
app.include_router(import_export.router)
app.include_router(races.router)
app.include_router(connection.router)
app.include_router(websocket.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
