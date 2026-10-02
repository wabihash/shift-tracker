from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, delete, select

from app.auth import get_current_user
from app.db import get_session
from app.models import Activity, PlannedShift, SessionLog, UserProfile
from app.routers.profile import create_empty_profile

router = APIRouter(prefix="/api", tags=["activities"])


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    name: str
    weekly_target_hours: float
    color: str


class ActivityCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    weekly_target_hours: float = Field(default=0.0, ge=0.0)
    color: str = Field(default="#6366f1", min_length=1, max_length=32)


class ActivityUpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    weekly_target_hours: float | None = Field(default=None, ge=0.0)
    color: str | None = Field(default=None, min_length=1, max_length=32)


def _get_owned_activity(
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


@router.get("/activities", response_model=list[ActivityRead])
def list_activities(
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> list[Activity]:
    profile = session.exec(select(UserProfile).where(UserProfile.clerk_user_id == clerk_user_id)).first()
    if profile is None:
        return []
    statement = (
        select(Activity)
        .where(Activity.profile_id == profile.id)
        .order_by(Activity.name)
    )
    return list(session.exec(statement).all())


@router.post("/activities", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def create_activity(
    body: ActivityCreateBody,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> Activity:
    profile = create_empty_profile(session, clerk_user_id)
    activity = Activity(
        profile_id=profile.id,
        name=body.name.strip(),
        weekly_target_hours=body.weekly_target_hours,
        color=body.color,
    )
    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


@router.put("/activities/{activity_id}", response_model=ActivityRead)
def update_activity(
    activity_id: int,
    body: ActivityUpdateBody,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> Activity:
    if body.name is None and body.weekly_target_hours is None and body.color is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field must be provided",
        )

    activity = _get_owned_activity(session, clerk_user_id, activity_id)

    if body.name is not None:
        activity.name = body.name.strip()
    if body.weekly_target_hours is not None:
        activity.weekly_target_hours = body.weekly_target_hours
    if body.color is not None:
        activity.color = body.color

    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


@router.delete("/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: int,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> None:
    activity = _get_owned_activity(session, clerk_user_id, activity_id)

    session.exec(
        delete(SessionLog).where(
            SessionLog.activity_id == activity.id,
            SessionLog.clerk_user_id == clerk_user_id,
        )
    )
    session.exec(
        delete(PlannedShift).where(
            PlannedShift.activity_id == activity.id,
            PlannedShift.clerk_user_id == clerk_user_id,
        )
    )
    session.delete(activity)
    session.commit()
