from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models.database import init_db

app = FastAPI(title="PWDTimer API")


@app.on_event("startup")
async def _startup() -> None:
    await init_db()


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


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
