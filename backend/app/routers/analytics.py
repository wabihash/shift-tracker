from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Activity, SessionLog, VarianceType
from app.routers.profile import get_or_create_profile

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def is_activity_cap_reached(completed_hours: float, target_hours: float) -> bool:
    return target_hours > 0 and completed_hours >= target_hours


class ActivityWeeklyStats(BaseModel):
    activity_id: int
    activity_name: str
    color: str
    target_hours: float
    completed_hours: float
    remaining_hours: float
    percentage: float
    deducted_minutes: int
    is_cap_reached: bool


class CapAlert(BaseModel):
    activity_id: int
    activity_name: str
    message: str


class LostMinutesBreakdown(BaseModel):
    total_lost_deductions_min: int
    total_late_arrival_min: int


class WeeklyAnalyticsResponse(BaseModel):
    week_start: date
    week_end: date
    weekly_target_hours: float
    total_net_hours: float
    overall_completion_percentage: float
    activities: list[ActivityWeeklyStats]
    cap_alerts: list[CapAlert]
    lost_minutes: LostMinutesBreakdown


@router.get("/weekly", response_model=WeeklyAnalyticsResponse)
def get_weekly_analytics(
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
    week_start: Annotated[date, Query(description="Inclusive week start (logged_date)")],
    week_end: Annotated[date, Query(description="Inclusive week end (logged_date)")],
) -> WeeklyAnalyticsResponse:
    if week_end < week_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="week_end must be on or after week_start",
        )

    profile = get_or_create_profile(session, clerk_user_id)

    activities = list(
        session.exec(
            select(Activity)
            .where(Activity.profile_id == profile.id)
            .order_by(Activity.name)
        ).all()
    )

    sessions = list(
        session.exec(
            select(SessionLog).where(
                SessionLog.clerk_user_id == clerk_user_id,
                SessionLog.logged_date >= week_start,
                SessionLog.logged_date <= week_end,
            )
        ).all()
    )

    sessions_by_activity: dict[int, list[SessionLog]] = {}
    for log in sessions:
        sessions_by_activity.setdefault(log.activity_id, []).append(log)

    total_net_minutes = sum(log.net_minutes for log in sessions)
    total_net_hours = total_net_minutes / 60.0
    weekly_target = profile.weekly_target_hours
    overall_completion = (
        min(100.0, (total_net_hours / weekly_target) * 100.0)
        if weekly_target > 0
        else (100.0 if total_net_hours > 0 else 0.0)
    )

    activity_stats: list[ActivityWeeklyStats] = []
    cap_alerts: list[CapAlert] = []

    for activity in activities:
        activity_logs = sessions_by_activity.get(activity.id, [])
        net_minutes = sum(log.net_minutes for log in activity_logs)
        deducted_minutes = sum(log.deducted_minutes for log in activity_logs)
        completed_hours = net_minutes / 60.0
        target = activity.weekly_target_hours
        remaining_hours = max(0.0, target - completed_hours)
        if target > 0:
            percentage = min(100.0, (completed_hours / target) * 100.0)
        else:
            percentage = 100.0 if completed_hours > 0 else 0.0
        is_cap_reached = is_activity_cap_reached(completed_hours, target)

        stats = ActivityWeeklyStats(
            activity_id=activity.id,
            activity_name=activity.name,
            color=activity.color,
            target_hours=target,
            completed_hours=round(completed_hours, 2),
            remaining_hours=round(remaining_hours, 2),
            percentage=round(percentage, 2),
            deducted_minutes=deducted_minutes,
            is_cap_reached=is_cap_reached,
        )
        activity_stats.append(stats)

        if is_cap_reached:
            cap_alerts.append(
                CapAlert(
                    activity_id=activity.id,
                    activity_name=activity.name,
                    message=f"{activity.name} reached its weekly target of {target:g} hours.",
                )
            )

    total_lost_deductions_min = sum(log.deducted_minutes for log in sessions)
    total_late_arrival_min = sum(
        log.variance_minutes
        for log in sessions
        if log.variance_type == VarianceType.LATE_START
    )

    return WeeklyAnalyticsResponse(
        week_start=week_start,
        week_end=week_end,
        weekly_target_hours=weekly_target,
        total_net_hours=round(total_net_hours, 2),
        overall_completion_percentage=round(overall_completion, 2),
        activities=activity_stats,
        cap_alerts=cap_alerts,
        lost_minutes=LostMinutesBreakdown(
            total_lost_deductions_min=total_lost_deductions_min,
            total_late_arrival_min=total_late_arrival_min,
        ),
    )
