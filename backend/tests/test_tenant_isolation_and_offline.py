from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.main import app


def test_tenant_isolation_activities_and_sessions(client: TestClient) -> None:
    # 1. User Alice creates an activity and a session
    app.dependency_overrides[get_current_user] = lambda: "user_alice"

    act_res = client.post(
        "/api/activities",
        json={"name": "Alice Deep Work", "weekly_target_hours": 20.0, "color": "#6366f1"},
    )
    assert act_res.status_code == 201
    alice_activity_id = act_res.json()["id"]

    now = datetime.now(timezone.utc).replace(microsecond=0)
    sess_res = client.post(
        "/api/sessions",
        json={
            "activity_id": alice_activity_id,
            "actual_start": (now - timedelta(minutes=60)).isoformat(),
            "actual_end": now.isoformat(),
            "gross_minutes": 60,
            "deducted_minutes": 10,
            "break_overrun_minutes": 5,
            "logged_date": now.date().isoformat(),
            "notes": "Alice session",
        },
    )
    assert sess_res.status_code == 201
    alice_session_id = sess_res.json()["id"]

    # 2. Switch to User Bob
    app.dependency_overrides[get_current_user] = lambda: "user_bob"

    # Bob lists activities: must NOT see Alice's activity
    bob_acts = client.get("/api/activities").json()
    assert not any(act["id"] == alice_activity_id for act in bob_acts)

    # Bob lists sessions: must NOT see Alice's session
    bob_sessions = client.get(
        "/api/sessions",
        params={"start_date": now.date().isoformat(), "end_date": now.date().isoformat()},
    ).json()
    assert not any(s["id"] == alice_session_id for s in bob_sessions)

    # Bob tries to delete Alice's activity: must return 404
    del_res = client.delete(f"/api/activities/{alice_activity_id}")
    assert del_res.status_code == 404

    # Bob tries to log a session against Alice's activity: must return 404 or reject
    fraud_res = client.post(
        "/api/sessions",
        json={
            "activity_id": alice_activity_id,
            "actual_start": (now - timedelta(minutes=30)).isoformat(),
            "actual_end": now.isoformat(),
            "gross_minutes": 30,
            "deducted_minutes": 0,
            "logged_date": now.date().isoformat(),
        },
    )
    assert fraud_res.status_code in (400, 404)

    # Clean up override
    app.dependency_overrides.pop(get_current_user, None)


def test_offline_outbox_sequential_replay_and_analytics(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: "user_offline_sync"

    # Create activity
    act_res = client.post(
        "/api/activities",
        json={"name": "Synced Stream", "weekly_target_hours": 10.0, "color": "#10b981"},
    )
    assert act_res.status_code == 201
    activity_id = act_res.json()["id"]

    today = date.today()
    today_iso = today.isoformat()
    now = datetime.now(timezone.utc).replace(microsecond=0)

    # Simulated offline outbox payload queue (3 sessions)
    outbox_items = [
        {
            "activity_id": activity_id,
            "actual_start": (now - timedelta(minutes=180)).isoformat(),
            "actual_end": (now - timedelta(minutes=120)).isoformat(),
            "gross_minutes": 60,
            "deducted_minutes": 10,
            "break_overrun_minutes": 5,
            "logged_date": today_iso,
            "notes": "Queued 1",
        },
        {
            "activity_id": activity_id,
            "actual_start": (now - timedelta(minutes=100)).isoformat(),
            "actual_end": (now - timedelta(minutes=40)).isoformat(),
            "gross_minutes": 60,
            "deducted_minutes": 0,
            "break_overrun_minutes": 0,
            "logged_date": today_iso,
            "notes": "Queued 2",
        },
        {
            "activity_id": activity_id,
            "actual_start": (now - timedelta(minutes=30)).isoformat(),
            "actual_end": now.isoformat(),
            "gross_minutes": 30,
            "deducted_minutes": 5,
            "break_overrun_minutes": 0,
            "logged_date": today_iso,
            "notes": "Queued 3",
        },
    ]

    # Replay sequentially like OfflineSyncListener does
    synced_ids = []
    for item in outbox_items:
        res = client.post("/api/sessions", json=item)
        assert res.status_code in (200, 201)
        body = res.json()
        assert body["id"] > 0
        synced_ids.append(body["id"])

    assert len(synced_ids) == 3

    # Verify analytics recalculation reflects all synced sessions
    # Total net minutes = (60-10) + (60-0) + (30-5) = 50 + 60 + 25 = 135 minutes = 2.25 hours
    # Total deductions = 10 + 0 + 5 = 15 minutes
    analytics_res = client.get(
        "/api/analytics/weekly",
        params={
            "week_start": (today - timedelta(days=today.weekday())).isoformat(),
            "week_end": (today + timedelta(days=6 - today.weekday())).isoformat(),
        },
    )
    assert analytics_res.status_code == 200
    analytics = analytics_res.json()
    assert analytics["total_net_hours"] == 2.25
    assert analytics["lost_minutes"]["total_lost_deductions_min"] == 15

    stream = next(a for a in analytics["activities"] if a["activity_id"] == activity_id)
    assert stream["completed_hours"] == 2.25
    assert stream["deducted_minutes"] == 15

    # Clean up override
    app.dependency_overrides.pop(get_current_user, None)
