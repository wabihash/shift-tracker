from __future__ import annotations

from datetime import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.auth import get_current_user
from app.db import get_session
from app.models import ShiftRule, UserProfile

router = APIRouter(prefix="/api", tags=["profile"])

DEFAULT_WAKE_TIME = time(5, 41)
DEFAULT_BEDTIME_LIMIT = time(22, 15)
DEFAULT_WEEKLY_TARGET_HOURS = 68.0

DEFAULT_SHIFT_RULE_SPECS: tuple[dict[str, object], ...] = (
    {
        "shift_number": 1,
        "name": "Shift 1",
        "standard_start": time(6, 0),
        "standard_end": time(14, 0),
        "standard_break_minutes": 30,
        "rush_start": time(7, 0),
        "rush_end": time(9, 0),
        "rush_break_minutes": 15,
    },
    {
        "shift_number": 2,
        "name": "Shift 2",
        "standard_start": time(14, 0),
        "standard_end": time(22, 0),
        "standard_break_minutes": 30,
        "rush_start": time(16, 0),
        "rush_end": time(18, 0),
        "rush_break_minutes": 15,
    },
    {
        "shift_number": 3,
        "name": "Shift 3",
        "standard_start": time(10, 0),
        "standard_end": time(18, 0),
        "standard_break_minutes": 30,
        "rush_start": time(11, 30),
        "rush_end": time(13, 30),
        "rush_break_minutes": 15,
    },
    {
        "shift_number": 4,
        "name": "Shift 4",
        "standard_start": time(8, 0),
        "standard_end": time(16, 0),
        "standard_break_minutes": 30,
        "rush_start": time(8, 30),
        "rush_end": time(10, 30),
        "rush_break_minutes": 15,
    },
)


class ShiftRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    shift_number: int
    name: str
    standard_start: time
    standard_end: time
    standard_break_minutes: int
    rush_start: time
    rush_end: time
    rush_break_minutes: int


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clerk_user_id: str
    user_name: str | None
    wake_time: time
    bedtime_limit: time
    weekly_target_hours: float
    shift_rules: list[ShiftRuleRead]


class ProfileUpdateBody(BaseModel):
    wake_time: time
    bedtime_limit: time
    weekly_target_hours: float = Field(ge=0.0)


class ShiftRuleUpdateBody(BaseModel):
    id: int
    shift_number: int = Field(ge=1, le=4)
    name: str = Field(min_length=1, max_length=255)
    standard_start: time
    standard_end: time
    standard_break_minutes: int = Field(ge=0)
    rush_start: time
    rush_end: time
    rush_break_minutes: int = Field(ge=0)


def _load_profile(
    session: Session, clerk_user_id: str
) -> UserProfile | None:
    statement = (
        select(UserProfile)
        .where(UserProfile.clerk_user_id == clerk_user_id)
        .options(selectinload(UserProfile.shift_rules))
    )
    return session.exec(statement).first()


def _create_default_shift_rules(session: Session, profile_id: int) -> None:
    for spec in DEFAULT_SHIFT_RULE_SPECS:
        session.add(ShiftRule(profile_id=profile_id, **spec))


def get_or_create_profile(session: Session, clerk_user_id: str) -> UserProfile:
    profile = _load_profile(session, clerk_user_id)
    if profile is not None:
        return profile

    profile = UserProfile(
        clerk_user_id=clerk_user_id,
        wake_time=DEFAULT_WAKE_TIME,
        bedtime_limit=DEFAULT_BEDTIME_LIMIT,
        weekly_target_hours=DEFAULT_WEEKLY_TARGET_HOURS,
    )
    session.add(profile)
    session.flush()
    _create_default_shift_rules(session, profile.id)
    session.commit()
    session.refresh(profile)

    loaded = _load_profile(session, clerk_user_id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize user profile",
        )
    return loaded


@router.get("/profile", response_model=ProfileRead)
def get_profile(
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> UserProfile:
    return get_or_create_profile(session, clerk_user_id)


@router.put("/profile", response_model=ProfileRead)
def update_profile(
    body: ProfileUpdateBody,
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> UserProfile:
    profile = get_or_create_profile(session, clerk_user_id)
    profile.wake_time = body.wake_time
    profile.bedtime_limit = body.bedtime_limit
    profile.weekly_target_hours = body.weekly_target_hours
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return _load_profile(session, clerk_user_id) or profile


@router.put("/shift-rules", response_model=list[ShiftRuleRead])
def update_shift_rules(
    body: list[ShiftRuleUpdateBody],
    session: Annotated[Session, Depends(get_session)],
    clerk_user_id: Annotated[str, Depends(get_current_user)],
) -> list[ShiftRule]:
    if len(body) != 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly four shift rules are required",
        )

    shift_numbers = {item.shift_number for item in body}
    if shift_numbers != {1, 2, 3, 4}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shift rules must include shift_number 1 through 4",
        )

    profile = get_or_create_profile(session, clerk_user_id)
    rules_by_id = {rule.id: rule for rule in profile.shift_rules}
    rules_by_number = {rule.shift_number: rule for rule in profile.shift_rules}

    updated: list[ShiftRule] = []
    for item in body:
        rule = rules_by_id.get(item.id)
        if rule is None or rule.profile_id != profile.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shift rule {item.id} not found for this profile",
            )
        if rules_by_number.get(item.shift_number) is not rule:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"shift_number {item.shift_number} does not match rule id",
            )

        rule.name = item.name
        rule.standard_start = item.standard_start
        rule.standard_end = item.standard_end
        rule.standard_break_minutes = item.standard_break_minutes
        rule.rush_start = item.rush_start
        rule.rush_end = item.rush_end
        rule.rush_break_minutes = item.rush_break_minutes
        session.add(rule)
        updated.append(rule)

    session.commit()
    for rule in updated:
        session.refresh(rule)

    return sorted(updated, key=lambda r: r.shift_number)
