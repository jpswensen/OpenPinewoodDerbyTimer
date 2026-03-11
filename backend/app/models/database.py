from __future__ import annotations

import os
from pathlib import Path
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


def _default_sqlite_path() -> Path:
    # .../PWDTimer/backend/app/models/database.py -> parents[2] == .../PWDTimer/backend
    backend_dir = Path(__file__).resolve().parents[2]
    return backend_dir / "pwdtimer.db"


def get_database_url() -> str:
    return os.getenv("PWDTIMER_DB_URL", f"sqlite+aiosqlite:///{_default_sqlite_path()}")


class Base(DeclarativeBase):
    pass


_app_engine: AsyncEngine | None = None
_app_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def make_engine(db_url: str | None = None) -> AsyncEngine:
    return create_async_engine(db_url or get_database_url(), echo=False)


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def get_app_engine() -> AsyncEngine:
    global _app_engine
    if _app_engine is None:
        _app_engine = make_engine()
    return _app_engine


def get_app_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _app_sessionmaker
    if _app_sessionmaker is None:
        _app_sessionmaker = make_sessionmaker(get_app_engine())
    return _app_sessionmaker


async def init_db(engine: AsyncEngine | None = None) -> None:
    # Ensure model classes are imported/registered on Base.metadata
    from . import models  # noqa: F401

    engine = engine or get_app_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    session_maker = get_app_sessionmaker()
    async with session_maker() as session:
        yield session
