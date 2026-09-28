from __future__ import annotations

import http.client
import json
import logging
import re
import time
import urllib.error
import urllib.request
import uuid
from contextvars import ContextVar, Token
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import event, text

from app import auth
from app.db import engine

SLOW_REQUEST_MS = 800.0
JWKS_TIMEOUT_SECONDS = 3.0

request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_context: ContextVar[str | None] = ContextVar("user_id", default=None)
path_context: ContextVar[str | None] = ContextVar("request_path", default=None)


def configure_logging() -> None:
    """Configure one JSON stream handler for application observability logs."""
    logger = logging.getLogger("shift_tracker")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not any(getattr(handler, "_shift_tracker_json", False) for handler in logger.handlers):
        handler = logging.StreamHandler()
        handler._shift_tracker_json = True  # type: ignore[attr-defined]
        handler.setFormatter(JsonLogFormatter())
        logger.addHandler(handler)


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", request_id_context.get()),
            "user_id": getattr(record, "user_id", user_id_context.get()),
            "response_latency_ms": getattr(record, "response_latency_ms", None),
        }
        for key in ("method", "path", "status_code", "query_latency_ms", "query_kind", "dependency"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


logger = logging.getLogger("shift_tracker")
router = APIRouter(tags=["health"])


def set_current_user_id(user_id: str) -> None:
    """Attach the authenticated Clerk subject to this request's structured logs."""
    user_id_context.set(user_id)


def _check_database() -> bool:
    try:
        with engine.connect() as connection:
            return connection.execute(text("SELECT 1")).scalar_one() == 1
    except Exception:
        logger.warning("readiness dependency check failed", extra={"dependency": "database"}, exc_info=True)
        return False


def _check_clerk_jwks() -> bool:
    if not auth.JWKS_URL:
        logger.warning("readiness dependency check failed", extra={"dependency": "clerk_jwks"})
        return False
    request = urllib.request.Request(
        auth.JWKS_URL,
        headers={"Accept": "application/json", "User-Agent": "shift-tracker-readiness/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=JWKS_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                logger.warning(
                    "readiness dependency check failed",
                    extra={"dependency": "clerk_jwks", "status_code": response.status},
                )
                return False
            document = json.loads(response.read(1_048_576))
            reachable = isinstance(document, dict) and isinstance(document.get("keys"), list) and bool(document["keys"])
            if not reachable:
                logger.warning("readiness dependency returned an invalid JWKS document", extra={"dependency": "clerk_jwks"})
            return reachable
    except (http.client.HTTPException, urllib.error.URLError, TimeoutError, ValueError, OSError):
        logger.warning("readiness dependency check failed", extra={"dependency": "clerk_jwks"}, exc_info=True)
        return False


@router.get("/health/ready")
def readiness_check() -> JSONResponse:
    database_ready = _check_database()
    auth_ready = _check_clerk_jwks()
    ready = database_ready and auth_ready
    body = {
        "status": "ready" if ready else "degraded",
        "database": "connected" if database_ready else "unavailable",
        "auth": "reachable" if auth_ready else "unreachable",
    }
    return JSONResponse(status_code=200 if ready else 503, content=body)


class MonitoringMiddleware:
    """Pure ASGI request ID and structured latency logging middleware."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming_id = next(
            (value.decode("latin-1") for key, value in scope.get("headers", []) if key.lower() == b"x-request-id"),
            "",
        )
        request_id = incoming_id if re.fullmatch(r"[A-Za-z0-9._-]{1,128}", incoming_id) else str(uuid.uuid4())
        request_id_token: Token[str | None] = request_id_context.set(request_id)
        user_id_token: Token[str | None] = user_id_context.set(None)
        path_token: Token[str | None] = path_context.set(str(scope.get("path", "/")))
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        started_at = time.perf_counter()
        status_code = 500
        request_failed = False

        async def send_with_request_id(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = [
                    (key, value)
                    for key, value in message.get("headers", [])
                    if key.lower() != b"x-request-id"
                ]
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            request_failed = True
            raise
        finally:
            latency_ms = (time.perf_counter() - started_at) * 1000
            user_id = state.get("user_id") or user_id_context.get()
            log = logger.warning if latency_ms > SLOW_REQUEST_MS else logger.info
            if request_failed:
                log = logger.warning if latency_ms > SLOW_REQUEST_MS else logger.error
            log(
                "slow endpoint" if latency_ms > SLOW_REQUEST_MS else ("request failed" if request_failed else "request completed"),
                extra={
                    "request_id": request_id,
                    "user_id": user_id,
                    "response_latency_ms": round(latency_ms, 2),
                    "method": scope.get("method", ""),
                    "path": scope.get("path", "/"),
                    "status_code": status_code,
                },
                exc_info=request_failed,
            )
            path_context.reset(path_token)
            user_id_context.reset(user_id_token)
            request_id_context.reset(request_id_token)


@event.listens_for(engine, "before_cursor_execute")
def _start_query_timer(
    connection: Any,
    cursor: Any,
    statement: str,
    parameters: Any,
    context: Any,
    executemany: bool,
) -> None:
    connection.info["_shift_tracker_query_started_at"] = time.perf_counter()


@event.listens_for(engine, "after_cursor_execute")
def _log_slow_query(
    connection: Any,
    cursor: Any,
    statement: str,
    parameters: Any,
    context: Any,
    executemany: bool,
) -> None:
    started_at = connection.info.pop("_shift_tracker_query_started_at", None)
    if started_at is None:
        return
    _emit_slow_query_warning(started_at, statement)


def _emit_slow_query_warning(started_at: float, statement: str) -> None:
    latency_ms = (time.perf_counter() - started_at) * 1000
    if latency_ms <= SLOW_REQUEST_MS:
        return
    query_kind = statement.lstrip().split(None, 1)[0].upper() if statement.strip() else "UNKNOWN"
    logger.warning(
        "slow database query",
        extra={
            "request_id": request_id_context.get(),
            "user_id": user_id_context.get(),
            "response_latency_ms": None,
            "query_latency_ms": round(latency_ms, 2),
            "query_kind": query_kind,
            "path": path_context.get(),
        },
    )


@event.listens_for(engine, "handle_error")
def _log_slow_failed_query(exception_context: Any) -> None:
    connection = exception_context.connection
    if connection is None:
        return
    started_at = connection.info.pop("_shift_tracker_query_started_at", None)
    statement = exception_context.statement or ""
    if started_at is not None:
        _emit_slow_query_warning(started_at, statement)
