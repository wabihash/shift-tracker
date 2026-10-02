from __future__ import annotations

import os
from collections.abc import Generator
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

_DEFAULT_DATABASE_URL = "sqlite:///./schedule.db"


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    # Keep the timeout in the URL too so tools such as Alembic that read
    # DATABASE_URL directly get the same fail-fast behavior as the app engine.
    parsed_url = make_url(url)
    if parsed_url.drivername.startswith("postgresql"):
        query = dict(parsed_url.query)
        query.setdefault("connect_timeout", "5")
        parsed_url = parsed_url.set(query=query)
        return parsed_url.render_as_string(hide_password=False)

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
    profile_columns = {column["name"] for column in inspect(engine).get_columns("user_profiles")}
    if "week_start_day" not in profile_columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE user_profiles ADD COLUMN week_start_day INTEGER NOT NULL DEFAULT 1"
            ))
