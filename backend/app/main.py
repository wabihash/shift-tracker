from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.db import init_db
from app.monitoring import MonitoringMiddleware, configure_logging, router as monitoring_router
from app.routers import activities, analytics, auth, planner, profile, sessions

load_dotenv()

logger = logging.getLogger(__name__)

env_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]

default_origins = [
    "https://shift-tracker-henna.vercel.app",
    "https://shift-tracker-git-main-wabihashs-projects.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]
allowed_origins = list(dict.fromkeys(env_origins + default_origins))


class PreserveCORSErrorsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        try:
            return await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled exception while processing %s %s",
                request.method,
                request.url.path,
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal Server Error"},
            )


app = FastAPI(title="Shift Architecture & Time Engine API")
configure_logging()

app.add_middleware(MonitoringMiddleware)
app.add_middleware(PreserveCORSErrorsMiddleware)

# Starlette wraps middleware in reverse registration order: CORS is outermost,
# so it can attach headers to responses from the error and monitoring layers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.include_router(monitoring_router)
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(activities.router)
app.include_router(planner.router)
app.include_router(sessions.router)
app.include_router(analytics.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
