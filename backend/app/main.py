from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.monitoring import MonitoringMiddleware, configure_logging, router as monitoring_router
from app.routers import activities, analytics, planner, profile, sessions

load_dotenv()


def _parse_cors_origins(raw: str) -> list[str]:
    value = raw.strip()
    if not value or value == "*":
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


app = FastAPI(title="Shift Architecture & Time Engine API")
configure_logging()

app.add_middleware(MonitoringMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(os.getenv("CORS_ORIGINS", "*")),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.include_router(monitoring_router)
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
    return {"status": "healthy"}
