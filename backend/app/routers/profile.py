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

DAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class ShiftRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    shift_number: int
    day_of_week: int = 0
    name: str
    standard_start: time
    standard_end: time
    standard_break_minutes: int
    slot_type: str = "productive"
    slot_start: time | None = None
    slot_end: time | None = None


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str | None
    weekly_target_hours: float
    shift_rules: list[ShiftRuleRead]


class ProfileUpdateBody(BaseModel):
    weekly_target_hours: float = Field(ge=0.0)


class ShiftRuleUpdateBody(BaseModel):
    id: int | None = None
    shift_number: int = Field(ge=1, le=4)
    day_of_week: int = Field(default=0, ge=0, le=6)
    name: str = Field(min_length=1, max_length=255)
    standard_start: time
    standard_end: time
    standard_break_minutes: int = Field(ge=0)
    slot_type: str = Field(default="productive", pattern="^(productive|break)$")
    slot_start: time | None = None
    slot_end: time | None = None


def _load_profile(
    session: Session, user_id: int
) -> UserProfile | None:
    statement = (
        select(UserProfile)
        .where(UserProfile.user_id == user_id)
        .options(selectinload(UserProfile.shift_rules))
    )
    return session.exec(statement).first()


def get_or_create_profile(session: Session, user_id: int) -> UserProfile:
    profile = _load_profile(session, user_id)
    if profile is not None:
        return profile

    profile = UserProfile(
        user_id=user_id,
        weekly_target_hours=0.0,
    )
    session.add(profile)
    session.flush()
    session.commit()
    session.refresh(profile)

    loaded = _load_profile(session, user_id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize user profile",
        )
    return loaded


def create_empty_profile(session: Session, user_id: int) -> UserProfile:
    profile = _load_profile(session, user_id)
    if profile is not None:
        return profile
    profile = UserProfile(
        user_id=user_id,
        weekly_target_hours=0.0,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return _load_profile(session, user_id) or profile


@router.get("/profile", response_model=ProfileRead | None)
def get_profile(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
) -> UserProfile | None:
    return _load_profile(session, user_id)


@router.put("/profile", response_model=ProfileRead)
def update_profile(
    body: ProfileUpdateBody,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
) -> UserProfile:
    profile = create_empty_profile(session, user_id)
    profile.weekly_target_hours = body.weekly_target_hours
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return _load_profile(session, user_id) or profile


@router.put("/shift-rules", response_model=list[ShiftRuleRead])
def update_shift_rules(
    body: list[ShiftRuleUpdateBody],
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
) -> list[ShiftRule]:
    if len(body) > 224:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At most 224 weekly cadence slots are allowed",
        )

    productive_shifts = [(item.day_of_week, item.shift_number) for item in body if item.slot_type == "productive"]
    if len(set(productive_shifts)) != len(productive_shifts):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Productive shift numbers must be unique per day")

    profile = create_empty_profile(session, user_id)
    rules_by_id = {rule.id: rule for rule in profile.shift_rules}
    updated: list[ShiftRule] = []
    retained_ids: set[int] = set()
    for item in body:
        rule = rules_by_id.get(item.id) if item.id and item.id > 0 else None
        if item.id and item.id > 0 and (rule is None or rule.profile_id != profile.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Shift rule {item.id} not found for this profile")
        if rule is None:
            rule = ShiftRule(profile_id=profile.id, day_of_week=item.day_of_week, shift_number=item.shift_number, name=item.name,
                standard_start=item.standard_start, standard_end=item.standard_end,
                standard_break_minutes=item.standard_break_minutes,
                slot_type=item.slot_type, slot_start=item.slot_start or item.standard_start,
                slot_end=item.slot_end or item.standard_end)
            session.add(rule)
            session.flush()
        rule.name = item.name
        rule.day_of_week = item.day_of_week
        rule.standard_start = item.standard_start
        rule.standard_end = item.standard_end
        rule.standard_break_minutes = item.standard_break_minutes
        rule.slot_type = item.slot_type
        rule.slot_start = item.slot_start or item.standard_start
        rule.slot_end = item.slot_end or item.standard_end
        session.add(rule)
        updated.append(rule)
        retained_ids.add(rule.id)

    for rule in profile.shift_rules:
        if rule.id not in retained_ids:
            session.delete(rule)

    session.commit()
    for rule in updated:
        session.refresh(rule)

    return sorted(updated, key=lambda r: (r.day_of_week, r.shift_number, r.slot_type == "break", r.slot_start or r.standard_start))


@router.get("/shift-rules", response_model=dict[str, list[ShiftRuleRead]])
def get_shift_rules(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(get_current_user)],
) -> dict[str, list[ShiftRule]]:
    profile = _load_profile(session, user_id)
    grouped: dict[str, list[ShiftRule]] = {day: [] for day in DAY_NAMES}
    if profile is None:
        return grouped
    for rule in profile.shift_rules:
        grouped[DAY_NAMES[rule.day_of_week]].append(rule)
    for day in DAY_NAMES:
        grouped[day].sort(key=lambda rule: (rule.shift_number, rule.slot_type == "break", rule.slot_start or rule.standard_start))
    return grouped
