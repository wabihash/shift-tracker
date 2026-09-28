from __future__ import annotations

import os
from collections.abc import Generator
from typing import Any

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

_DEFAULT_DATABASE_URL = "sqlite:///./schedule.db"


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def _build_engine(url: str):
    connect_args: dict[str, Any] = {}
    engine_options: dict[str, Any] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    elif url.startswith("postgresql"):
        connect_args["connect_timeout"] = 5
        engine_options["pool_timeout"] = 5
    return create_engine(url, connect_args=connect_args, **engine_options)


DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", _DEFAULT_DATABASE_URL)
)

engine = _build_engine(DATABASE_URL)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def init_db() -> None:
    """Initialize local development tables; production schema is managed by Alembic."""
    if os.getenv("APP_ENV", "development").lower() == "production":
        return

    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
