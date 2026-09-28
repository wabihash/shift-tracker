from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.models import VarianceType
from app.routers.analytics import is_activity_cap_reached
from app.routers.sessions import _compute_variance, compute_net_minutes


def test_deductions_calculate_net_minutes_bounded_at_zero() -> None:
    assert compute_net_minutes(90, 15) == 75
    assert compute_net_minutes(45, 45) == 0
    assert compute_net_minutes(20, 35) == 0
    assert compute_net_minutes(0, 0) == 0


def test_variance_late_start_and_early_exit() -> None:
    scheduled_start = datetime(2026, 9, 28, 6, 0, tzinfo=timezone.utc)
    scheduled_end = datetime(2026, 9, 28, 14, 0, tzinfo=timezone.utc)

    late_start, late_minutes = _compute_variance(
        actual_start=scheduled_start + timedelta(minutes=6),
        actual_end=scheduled_end,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
    )
    assert late_start == VarianceType.LATE_START
    assert late_minutes == 6

    on_time, on_time_minutes = _compute_variance(
        actual_start=scheduled_start + timedelta(minutes=5),
        actual_end=scheduled_end,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
    )
    assert on_time == VarianceType.ON_TIME
    assert on_time_minutes == 0

    early_exit, early_exit_minutes = _compute_variance(
        actual_start=scheduled_start,
        actual_end=scheduled_end - timedelta(minutes=12),
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
    )
    assert early_exit == VarianceType.EARLY_EXIT
    assert early_exit_minutes == 12


def test_cap_alert_triggers_when_completed_meets_or_exceeds_target() -> None:
    assert is_activity_cap_reached(21.0, 21.0) is True
    assert is_activity_cap_reached(21.5, 21.0) is True
    assert is_activity_cap_reached(20.99, 21.0) is False
    assert is_activity_cap_reached(8.0, 0.0) is False


def test_unauthenticated_request_to_protected_endpoint_returns_401(
    client: TestClient,
) -> None:
    response = client.get("/api/profile")
    assert response.status_code == 401
    assert response.headers.get("www-authenticate", "").lower().startswith("bearer")
    body = response.json()
    assert "detail" in body
