from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Activity, SessionLog, ShiftRule, UserProfile, VarianceType
from app.routers.profile import _load_profile

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
    weekly_buffer: float
    daily_buffer: float
    logged_sleep_hours: float


class HistorySummaryRow(BaseModel):
    period_label: str
    period_start: date
    logged_hours: float
    target_hours: float
    completion_percentage: float
    total_deducted_minutes: int
    late_arrival_minutes: int
    logged_sleep_hours: float
    sleep_target_hours: float
    weekly_buffer: float
    daily_buffer: float


class HistorySummaryResponse(BaseModel):
    group_by: str
    rows: list[HistorySummaryRow]
    weekly_buffer: float
    daily_buffer: float


@router.get("/history-summary", response_model=HistorySummaryResponse)
def get_history_summary(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
    group_by: Annotated[str, Query(pattern="^(week|month)$")],
) -> HistorySummaryResponse:
    profile = _load_profile(session, user_id)
    logs = list(session.exec(
        select(SessionLog)
        .where(SessionLog.user_id == user_id)
        .order_by(SessionLog.logged_date)
    ).all())
    groups: dict[date, list[SessionLog]] = {}
    for log in logs:
        if group_by == "week":
            period_start = log.logged_date - timedelta(days=log.logged_date.weekday())
        else:
            period_start = log.logged_date.replace(day=1)
        groups.setdefault(period_start, []).append(log)

    rows: list[HistorySummaryRow] = []
    activities = list(session.exec(select(Activity).join(UserProfile, Activity.profile_id == UserProfile.id).where(UserProfile.user_id == user_id)).all())
    activity_by_id = {activity.id: activity for activity in activities}
    sleep_activity = next((a for a in activities if a.name.strip().lower() == "sleep"), None)
    planned_sleep = sleep_activity.weekly_target_hours if sleep_activity and sleep_activity.weekly_target_hours > 0 else 56.0
    for period_start, period_logs in sorted(groups.items(), reverse=True):
        sleep_logs = [log for log in period_logs if activity_by_id.get(log.activity_id) and activity_by_id[log.activity_id].name.strip().lower() == "sleep"]
        work_logs = [log for log in period_logs if log not in sleep_logs]
        scale_days = 7
        if group_by == "month":
            next_month = date(period_start.year + (1 if period_start.month == 12 else 0), period_start.month % 12 + 1, 1)
            scale_days = (next_month - period_start).days
        scale = scale_days / 7.0
        work_target = (profile.weekly_target_hours if profile else 0.0) * scale
        target = round(work_target, 1)
        sleep_target = round(planned_sleep * scale, 1)
        logged_hours = sum(log.net_minutes for log in work_logs) / 60.0
        logged_sleep_hours = sum(log.net_minutes for log in sleep_logs) / 60.0
        completion = min(100.0, logged_hours / target * 100.0) if target > 0 else (100.0 if logged_hours > 0 else 0.0)
        if group_by == "week":
            label = f"Week {period_start.isocalendar().week}"
        else:
            label = period_start.strftime("%b %Y")
        rows.append(HistorySummaryRow(
            period_label=label,
            period_start=period_start,
            logged_hours=round(logged_hours, 2),
            target_hours=target,
            completion_percentage=round(completion, 2),
            total_deducted_minutes=sum(log.deducted_minutes for log in period_logs),
            late_arrival_minutes=sum(log.variance_minutes for log in period_logs if log.variance_type == VarianceType.LATE_START),
            logged_sleep_hours=round(logged_sleep_hours, 1),
            sleep_target_hours=sleep_target,
            weekly_buffer=max(0.0, round((scale_days * 24.0) - (target + sleep_target), 1)),
            daily_buffer=round(max(0.0, round((scale_days * 24.0) - (target + sleep_target), 1)) / scale_days, 1),
        ))
    weekly_target = profile.weekly_target_hours if profile else 0.0
    weekly_buffer = _weekly_buffer(weekly_target, planned_sleep, profile.shift_rules if profile else [])
    return HistorySummaryResponse(group_by=group_by, rows=rows, weekly_buffer=weekly_buffer, daily_buffer=round(weekly_buffer / 7.0, 1))


def _weekly_buffer(weekly_target: float, planned_sleep: float, rules: list[ShiftRule], monthly: bool = False, period_days: int = 30) -> float:
    return max(0.0, round(168.0 - (weekly_target + planned_sleep), 1))


@router.get("/weekly", response_model=WeeklyAnalyticsResponse)
def get_weekly_analytics(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
    week_start: Annotated[date, Query(description="Inclusive week start (logged_date)")],
    week_end: Annotated[date, Query(description="Inclusive week end (logged_date)")],
) -> WeeklyAnalyticsResponse:
    if week_end < week_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="week_end must be on or after week_start",
        )

    profile = _load_profile(session, user_id)

    activities = list(
        session.exec(
            select(Activity)
            .where(Activity.profile_id == profile.id if profile else Activity.id == -1)
            .order_by(Activity.name)
        ).all()
    )

    sessions = list(
        session.exec(
            select(SessionLog).where(
                SessionLog.user_id == user_id,
                SessionLog.logged_date >= week_start,
                SessionLog.logged_date <= week_end,
            )
        ).all()
    )

    sessions_by_activity: dict[int, list[SessionLog]] = {}
    for log in sessions:
        sessions_by_activity.setdefault(log.activity_id, []).append(log)

    activity_by_id = {activity.id: activity for activity in activities}
    sleep_activity = next((a for a in activities if a.name.strip().lower() == "sleep"), None)
    planned_sleep = sleep_activity.weekly_target_hours if sleep_activity and sleep_activity.weekly_target_hours > 0 else 56.0
    sleep_logs = [log for log in sessions if activity_by_id.get(log.activity_id) and activity_by_id[log.activity_id].name.strip().lower() == "sleep"]
    work_sessions = [log for log in sessions if log not in sleep_logs]
    total_net_minutes = sum(log.net_minutes for log in work_sessions)
    total_net_hours = total_net_minutes / 60.0
    logged_sleep_hours = round(sum(log.net_minutes for log in sleep_logs) / 60.0, 1)
    weekly_target = profile.weekly_target_hours if profile else 0.0
    overall_completion = (
        min(100.0, (total_net_hours / weekly_target) * 100.0)
        if weekly_target > 0
        else (100.0 if total_net_hours > 0 else 0.0)
    )

    activity_stats: list[ActivityWeeklyStats] = []
    cap_alerts: list[CapAlert] = []

    for activity in activities:
        if activity.name.strip().lower() == "sleep":
            continue
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
        weekly_buffer=_weekly_buffer(weekly_target, planned_sleep, profile.shift_rules if profile else []),
        daily_buffer=round(_weekly_buffer(weekly_target, planned_sleep, profile.shift_rules if profile else []) / 7.0, 1),
        logged_sleep_hours=logged_sleep_hours,
    )
