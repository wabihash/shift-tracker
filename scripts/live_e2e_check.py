#!/usr/bin/env python3
"""Live API smoke checks for Shift Tracker.

Set CLERK_SESSION_TOKEN in the environment to a short-lived Clerk session JWT.
The script creates one uniquely named activity and session, verifies their
calculation/analytics behavior, and deletes the activity in a finally block.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


@dataclass
class Response:
    status: int
    latency_ms: float
    body: Any


class SmokeCheck:
    def __init__(self, base_url: str, token: str | None, timeout: float) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.passed = 0
        self.failed = 0

    def report(self, name: str, success: bool, detail: str) -> None:
        status = "PASS" if success else "FAIL"
        print(f"[{status}] {name}: {detail}")
        if success:
            self.passed += 1
        else:
            self.failed += 1

    def call(self, method: str, path: str, body: dict[str, Any] | None = None, authenticated: bool = True) -> Response:
        headers = {"Accept": "application/json"}
        payload = None
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if authenticated and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(f"{self.base_url}{path}", data=payload, headers=headers, method=method)
        started = time.perf_counter()
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
                status = response.status
        except HTTPError as error:
            raw = error.read()
            status = error.code
        except (URLError, TimeoutError, OSError) as error:
            elapsed = (time.perf_counter() - started) * 1000
            reason = getattr(error, "reason", error)
            raise RuntimeError(f"{method} {path} could not be reached ({reason}); {elapsed:.1f} ms") from error
        elapsed = (time.perf_counter() - started) * 1000
        try:
            decoded: Any = json.loads(raw) if raw else None
        except (json.JSONDecodeError, UnicodeDecodeError):
            decoded = None
        return Response(status, elapsed, decoded)

    def check_health(self) -> None:
        for path, expected in (("/health", {"status": "healthy"}), ("/health/ready", {"status": "ready", "database": "connected", "auth": "reachable"})):
            try:
                response = self.call("GET", path, authenticated=False)
                good = response.status == 200 and isinstance(response.body, dict)
                good = good and all(response.body.get(key) == value for key, value in expected.items())
                description = f"HTTP {response.status}, {response.latency_ms:.1f} ms"
                if not good and response.status == 200 and isinstance(response.body, dict):
                    description += f", dependency status={response.body}"
                self.report(f"Dependency health {path}", good, description)
            except RuntimeError as error:
                self.report(f"Dependency health {path}", False, str(error))

    def check_profile(self) -> tuple[bool, str]:
        if not self.token:
            self.report("Authenticated profile defaults", False, "CLERK_SESSION_TOKEN is not set")
            return False, "No authenticated profile available"
        try:
            response = self.call("GET", "/api/profile")
        except RuntimeError as error:
            self.report("Authenticated profile defaults", False, str(error))
            return False, "Profile request failed"
        body = response.body if isinstance(response.body, dict) else {}
        rules = body.get("shift_rules")
        numbers = {rule.get("shift_number") for rule in rules if isinstance(rule, dict)} if isinstance(rules, list) else set()
        defaults_match = False
        if isinstance(rules, list) and all(isinstance(rule, dict) for rule in rules):
            rules_by_number = {rule.get("shift_number"): rule for rule in rules}
            defaults_match = all(
                rules_by_number.get(number, {}).get("name") == f"Shift {number}"
                for number in (1, 2, 3, 4)
            )
        rule_count = len(rules) if isinstance(rules, list) else None
        good = response.status == 200 and body.get("weekly_target_hours") == 68 and rule_count == 4 and numbers == {1, 2, 3, 4} and defaults_match
        detail = f"HTTP {response.status}, {response.latency_ms:.1f} ms; weekly goal={body.get('weekly_target_hours')}, shift rules={rule_count if rule_count is not None else 'missing'}"
        self.report("Authenticated profile defaults", good, detail)
        return response.status == 200, "Profile endpoint is available" if response.status == 200 else "Profile endpoint did not return HTTP 200"

    def check_session_and_cap(self) -> None:
        if not self.token:
            self.report("Session calculation (90 - 10 = 80 minutes)", False, "requires CLERK_SESSION_TOKEN")
            self.report("Variance tracking (>5 minute drift)", False, "requires CLERK_SESSION_TOKEN")
            self.report("Activity cap alert", False, "requires CLERK_SESSION_TOKEN")
            self.report("Temporary test-data cleanup", True, "no temporary data was created")
            return

        activity_id: int | None = None
        activity_name: str | None = None
        cleanup_success = True
        cleanup_confirmed = False
        try:
            target_hours = 80 / 60
            activity_name = f"E2E verification {uuid.uuid4()}"
            created = self.call(
                "POST",
                "/api/activities",
                {"name": activity_name, "weekly_target_hours": target_hours, "color": "#64748b"},
            )
            if created.status != 201 or not isinstance(created.body, dict) or not isinstance(created.body.get("id"), int):
                self.report("Session calculation (90 - 10 = 80 minutes)", False, f"temporary activity creation returned HTTP {created.status}")
                self.report("Variance tracking (>5 minute drift)", False, "temporary activity could not be created")
                self.report("Activity cap alert", False, "temporary activity could not be created")
                return
            activity_id = created.body["id"]

            ended = datetime.now(timezone.utc).replace(microsecond=0)
            started = ended - timedelta(minutes=90)
            scheduled_start = started - timedelta(minutes=6)
            session = self.call(
                "POST",
                "/api/sessions",
                {
                    "activity_id": activity_id,
                    "planned_shift_id": None,
                    "actual_start": started.isoformat(),
                    "actual_end": ended.isoformat(),
                    "scheduled_start": scheduled_start.isoformat(),
                    "scheduled_end": None,
                    "gross_minutes": 90,
                    "deducted_minutes": 10,
                    "notes": "Temporary automated smoke-check record",
                    "logged_date": ended.date().isoformat(),
                },
            )
            session_body = session.body if isinstance(session.body, dict) else {}
            saved = session.status == 201
            self.report(
                "Session calculation (90 - 10 = 80 minutes)",
                saved and session_body.get("net_minutes") == 80 and session_body.get("gross_minutes") == 90 and session_body.get("deducted_minutes") == 10,
                f"HTTP {session.status}, {session.latency_ms:.1f} ms; net_minutes={session_body.get('net_minutes')}",
            )
            variance_minutes = session_body.get("variance_minutes")
            variance_ok = saved and session_body.get("variance_type") == "LATE_START" and isinstance(variance_minutes, int) and variance_minutes >= 6
            self.report(
                "Variance tracking (>5 minute drift)",
                variance_ok,
                f"variance_type={session_body.get('variance_type')}, variance_minutes={variance_minutes}",
            )

            if not saved:
                self.report("Activity cap alert", False, "session was not saved; analytics cap could not be checked")
                return

            logged_date = date.fromisoformat(session_body.get("logged_date", ended.date().isoformat()))
            week_start = logged_date - timedelta(days=logged_date.weekday())
            week_end = week_start + timedelta(days=6)
            analytics = self.call(
                "GET",
                f"/api/analytics/weekly?week_start={week_start.isoformat()}&week_end={week_end.isoformat()}",
            )
            analytics_body = analytics.body if isinstance(analytics.body, dict) else {}
            activity_rows = analytics_body.get("activities", [])
            target_row = next((row for row in activity_rows if isinstance(row, dict) and row.get("activity_id") == activity_id), None) if isinstance(activity_rows, list) else None
            cap_reached = analytics.status == 200 and target_row is not None and target_row.get("is_cap_reached") is True
            self.report(
                "Activity cap alert",
                cap_reached,
                f"HTTP {analytics.status}, {analytics.latency_ms:.1f} ms; is_cap_reached={target_row.get('is_cap_reached') if target_row else 'activity missing'}",
            )
        except (RuntimeError, ValueError, TypeError, KeyError) as error:
            self.report("Session and cap runtime checks", False, str(error))
        finally:
            if activity_id is None and activity_name is not None:
                try:
                    activities = self.call("GET", "/api/activities")
                    rows = activities.body if isinstance(activities.body, list) else []
                    found = next((row for row in rows if isinstance(row, dict) and row.get("name") == activity_name), None)
                    if found and isinstance(found.get("id"), int):
                        activity_id = found["id"]
                    elif activities.status == 200 and isinstance(activities.body, list):
                        cleanup_confirmed = True
                except RuntimeError:
                    pass
            if activity_id is not None:
                try:
                    deleted = self.call("DELETE", f"/api/activities/{activity_id}")
                    cleanup_success = deleted.status == 204
                    self.report("Temporary test-data cleanup", cleanup_success, f"DELETE activity returned HTTP {deleted.status}")
                except RuntimeError as error:
                    cleanup_success = False
                    self.report("Temporary test-data cleanup", False, str(error))
            else:
                cleanup_success = activity_name is None or cleanup_confirmed
                detail = "no temporary data was created" if cleanup_success else "could not verify whether the temporary activity was created"
                self.report("Temporary test-data cleanup", cleanup_success, detail)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Shift Tracker live API smoke checks.")
    parser.add_argument("--api-url", default=os.getenv("API_BASE_URL", "http://localhost:8000"), help="API origin (default: API_BASE_URL or http://localhost:8000)")
    parser.add_argument("--timeout", type=float, default=8.0, help="HTTP request timeout in seconds")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_url = urlparse(args.api_url)
    if api_url.scheme not in {"http", "https"} or not api_url.hostname or api_url.username or api_url.password:
        print("[FAIL] Configuration: --api-url must be an HTTP(S) origin without embedded credentials")
        return 2
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        print("[FAIL] Configuration: --timeout must be a finite number greater than zero")
        return 2
    token = os.getenv("CLERK_SESSION_TOKEN", "").strip() or None
    smoke = SmokeCheck(args.api_url, token, args.timeout)
    print(f"Shift Tracker live E2E checks: {api_url.scheme}://{api_url.netloc}")
    if token:
        print("[INFO] Session, variance, and cap checks create temporary test data and remove it afterward.")
    smoke.check_health()
    smoke.check_profile()
    smoke.check_session_and_cap()
    print(f"\nChecklist: {smoke.passed} passed, {smoke.failed} failed")
    return 0 if smoke.failed == 0 else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n[FAIL] Interrupted by operator")
        raise SystemExit(130)
