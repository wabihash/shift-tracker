from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Activity, PlannedShift, UserProfile

router = APIRouter(prefix="/api", tags=["planner"])


class PlannedShiftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clerk_user_id: str
    activity_id: int
    title: str
    start_time: datetime
    end_time: datetime
    is_recurring: bool


class PlannedShiftCreateBody(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    activity_id: int
    start_time: datetime
    end_time: datetime
    is_recurring: bool = False

    @model_validator(mode="after")
    def end_after_start(self) -> PlannedShiftCreateBody:
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class PlannedShiftUpdateBody(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    activity_id: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_recurring: bool | None = None

    @model_validator(mode="after")
    def validate_window(self) -> PlannedShiftUpdateBody:
        if self.start_time is not None and self.end_time is not None:
            if self.end_time <= self.start_time:
                raise ValueError("end_time must be after start_time")
        return self


def _get_owned_planned_shift(
    session: Session, clerk_user_id: str, planned_shift_id: int
) -> PlannedShift:
    shift = session.get(PlannedShift, planned_shift_id)
    if shift is None or shift.clerk_user_id != clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planned shift not found",
        )
    return shift


def _assert_activity_owned(
    session: Session, clerk_user_id: str, activity_id: int
) -> Activity:
    statement = (
        select(Activity)
        .join(UserProfile, Activity.profile_id == UserProfile.id)
        .where(
            Activity.id == activity_id,
            UserProfile.clerk_user_id == clerk_user_id,
        )
    )
    activity = session.exec(statement).first()
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return activity


@router.get("/planned-shifts", response_model=list[PlannedShiftRead])
def list_planned_shifts(
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
    start: Annotated[datetime, Query(description="Range start (inclusive)")],
    end: Annotated[datetime, Query(description="Range end (inclusive)")],
) -> list[PlannedShift]:
    if end < start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end must be greater than or equal to start",
        )

    statement = (
        select(PlannedShift)
        .where(
            PlannedShift.clerk_user_id == clerk_user_id,
            PlannedShift.start_time >= start,
            PlannedShift.end_time <= end,
        )
        .order_by(PlannedShift.start_time)
    )
    return list(session.exec(statement).all())


@router.post(
    "/planned-shifts",
    response_model=PlannedShiftRead,
    status_code=status.HTTP_201_CREATED,
)
def create_planned_shift(
    body: PlannedShiftCreateBody,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> PlannedShift:
    _assert_activity_owned(session, clerk_user_id, body.activity_id)

    shift = PlannedShift(
        clerk_user_id=clerk_user_id,
        activity_id=body.activity_id,
        title=body.title.strip(),
        start_time=body.start_time,
        end_time=body.end_time,
        is_recurring=body.is_recurring,
    )
    session.add(shift)
    session.commit()
    session.refresh(shift)
    return shift


@router.put("/planned-shifts/{planned_shift_id}", response_model=PlannedShiftRead)
def update_planned_shift(
    planned_shift_id: int,
    body: PlannedShiftUpdateBody,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> PlannedShift:
    if (
        body.title is None
        and body.activity_id is None
        and body.start_time is None
        and body.end_time is None
        and body.is_recurring is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field must be provided",
        )

    shift = _get_owned_planned_shift(session, clerk_user_id, planned_shift_id)

    next_start = body.start_time if body.start_time is not None else shift.start_time
    next_end = body.end_time if body.end_time is not None else shift.end_time
    if next_end <= next_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_time must be after start_time",
        )

    if body.activity_id is not None:
        _assert_activity_owned(session, clerk_user_id, body.activity_id)
        shift.activity_id = body.activity_id
    if body.title is not None:
        shift.title = body.title.strip()
    if body.start_time is not None:
        shift.start_time = body.start_time
    if body.end_time is not None:
        shift.end_time = body.end_time
    if body.is_recurring is not None:
        shift.is_recurring = body.is_recurring

    session.add(shift)
    session.commit()
    session.refresh(shift)
    return shift


@router.delete("/planned-shifts/{planned_shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_planned_shift(
    planned_shift_id: int,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> None:
    shift = _get_owned_planned_shift(session, clerk_user_id, planned_shift_id)
    session.delete(shift)
    session.commit()
