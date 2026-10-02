from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Activity, PlannedShift, SessionLog, ShiftRule, UserProfile, VarianceType

router = APIRouter(prefix="/api", tags=["sessions"])

VARIANCE_THRESHOLD = timedelta(minutes=5)


def compute_net_minutes(gross_minutes: int, deducted_minutes: int) -> int:
    return max(0, gross_minutes - deducted_minutes)


class SessionLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    activity_id: int
    shift_number: int | None = None
    planned_shift_id: int | None
    actual_start: datetime
    actual_end: datetime
    scheduled_start: datetime | None
    scheduled_end: datetime | None
    gross_minutes: int
    deducted_minutes: int
    net_minutes: int
    variance_type: VarianceType
    variance_minutes: int
    break_overrun_minutes: int = 0
    notes: str | None
    logged_date: date
    created_at: datetime


class SessionLogCreateBody(BaseModel):
    activity_id: int
    shift_number: int | None = Field(default=None, ge=1, le=4)
    planned_shift_id: int | None = None
    actual_start: datetime
    actual_end: datetime
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    gross_minutes: int = Field(ge=0)
    deducted_minutes: int = Field(default=0, ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    break_overrun_minutes: int = Field(default=0, ge=0)
    logged_date: date

    @model_validator(mode="after")
    def validate_actual_window(self) -> SessionLogCreateBody:
        if self.actual_end <= self.actual_start:
            raise ValueError("actual_end must be after actual_start")
        if self.deducted_minutes > self.gross_minutes:
            raise ValueError("deducted_minutes cannot exceed gross_minutes")
        return self


def _assert_activity_owned(
    session: Session, user_id: int, activity_id: int
) -> Activity:
    statement = (
        select(Activity)
        .join(UserProfile, Activity.profile_id == UserProfile.id)
        .where(
            Activity.id == activity_id,
            UserProfile.user_id == user_id,
        )
    )
    activity = session.exec(statement).first()
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return activity


def _assert_planned_shift_owned(
    session: Session,
    user_id: int,
    planned_shift_id: int,
    activity_id: int,
) -> None:
    shift = session.get(PlannedShift, planned_shift_id)
    if (
        shift is None
        or shift.user_id != user_id
        or shift.activity_id != activity_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planned shift not found",
        )


def _compute_variance(
    *,
    actual_start: datetime,
    actual_end: datetime,
    scheduled_start: datetime | None,
    scheduled_end: datetime | None,
) -> tuple[VarianceType, int]:
    variance_type = VarianceType.ON_TIME
    variance_minutes = 0

    if scheduled_start is not None:
        start_diff = actual_start - scheduled_start
        if start_diff > VARIANCE_THRESHOLD:
            variance_type = VarianceType.LATE_START
            variance_minutes = int(start_diff.total_seconds() // 60)
        elif start_diff < -VARIANCE_THRESHOLD:
            variance_type = VarianceType.EARLY_START
            variance_minutes = int(start_diff.total_seconds() // 60)

    if scheduled_end is not None:
        exit_diff = scheduled_end - actual_end
        if exit_diff > VARIANCE_THRESHOLD:
            variance_type = VarianceType.EARLY_EXIT
            variance_minutes = int(exit_diff.total_seconds() // 60)

    return variance_type, variance_minutes


@router.post("/sessions", response_model=SessionLogRead, status_code=status.HTTP_201_CREATED)
def create_session(
    body: SessionLogCreateBody,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
) -> SessionLog:
    _assert_activity_owned(session, user_id, body.activity_id)
    if body.shift_number is not None:
        shift_rule = session.exec(
            select(ShiftRule)
            .join(UserProfile, ShiftRule.profile_id == UserProfile.id)
            .where(
                UserProfile.user_id == user_id,
                ShiftRule.shift_number == body.shift_number,
                ShiftRule.slot_type == "productive",
            )
        ).first()
        if shift_rule is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Shift number is not configured for this day")
    if body.planned_shift_id is not None:
        _assert_planned_shift_owned(
            session, user_id, body.planned_shift_id, body.activity_id
        )

    net_minutes = compute_net_minutes(body.gross_minutes, body.deducted_minutes)
    variance_type, variance_minutes = _compute_variance(
        actual_start=body.actual_start,
        actual_end=body.actual_end,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
    )

    log = SessionLog(
        user_id=user_id,
        activity_id=body.activity_id,
        shift_number=body.shift_number,
        planned_shift_id=body.planned_shift_id,
        actual_start=body.actual_start,
        actual_end=body.actual_end,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
        gross_minutes=body.gross_minutes,
        deducted_minutes=body.deducted_minutes,
        net_minutes=net_minutes,
        variance_type=variance_type,
        variance_minutes=variance_minutes,
        break_overrun_minutes=body.break_overrun_minutes,
        notes=body.notes,
        logged_date=body.logged_date,
    )
    session.add(log)
    session.commit()
    session.refresh(log)
    return log


@router.get("/sessions", response_model=list[SessionLogRead])
def list_sessions(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
    start_date: Annotated[date, Query(description="Inclusive logged_date start")],
    end_date: Annotated[date, Query(description="Inclusive logged_date end")],
) -> list[SessionLog]:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date",
        )

    statement = (
        select(SessionLog)
        .where(
            SessionLog.user_id == user_id,
            SessionLog.logged_date >= start_date,
            SessionLog.logged_date <= end_date,
        )
        .order_by(SessionLog.logged_date.desc(), SessionLog.actual_start.desc())
    )
    return list(session.exec(statement).all())
