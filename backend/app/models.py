from __future__ import annotations

from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class VarianceType(str, Enum):
    ON_TIME = "ON_TIME"
    LATE_START = "LATE_START"
    EARLY_START = "EARLY_START"
    EARLY_EXIT = "EARLY_EXIT"


class UserProfile(SQLModel, table=True):
    __tablename__ = "user_profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, unique=True, max_length=255)
    user_name: Optional[str] = Field(default=None, max_length=255)
    wake_time: time = Field(default=time(5, 41))
    bedtime_limit: time = Field(default=time(22, 15))
    weekly_target_hours: float = Field(default=68.0)
    created_at: datetime = Field(default_factory=_utc_now)

    shift_rules: list[ShiftRule] = Relationship(back_populates="profile")
    activities: list[Activity] = Relationship(back_populates="profile")


class ShiftRule(SQLModel, table=True):
    __tablename__ = "shift_rules"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(foreign_key="user_profiles.id", index=True)
    shift_number: int = Field(ge=1, le=4)
    name: str = Field(max_length=255)
    standard_start: time
    standard_end: time
    standard_break_minutes: int = Field(default=0, ge=0)
    rush_start: time
    rush_end: time
    rush_break_minutes: int = Field(default=0, ge=0)

    profile: UserProfile | None = Relationship(back_populates="shift_rules")


class Activity(SQLModel, table=True):
    __tablename__ = "activities"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(foreign_key="user_profiles.id", index=True)
    name: str = Field(index=True, max_length=255)
    weekly_target_hours: float = Field(default=0.0, ge=0.0)
    color: str = Field(default="#6366f1", max_length=32)

    profile: UserProfile | None = Relationship(back_populates="activities")
    sessions: list[SessionLog] = Relationship(back_populates="activity")
    planned_shifts: list[PlannedShift] = Relationship(back_populates="activity")


class PlannedShift(SQLModel, table=True):
    __tablename__ = "planned_shifts"

    id: Optional[int] = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, max_length=255)
    activity_id: int = Field(foreign_key="activities.id", index=True)
    title: str = Field(max_length=255)
    start_time: datetime
    end_time: datetime
    is_recurring: bool = Field(default=False)

    activity: Activity | None = Relationship(back_populates="planned_shifts")


class SessionLog(SQLModel, table=True):
    __tablename__ = "session_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, max_length=255)
    activity_id: int = Field(foreign_key="activities.id", index=True)
    planned_shift_id: Optional[int] = Field(
        default=None, foreign_key="planned_shifts.id", index=True
    )
    actual_start: datetime
    actual_end: datetime
    scheduled_start: Optional[datetime] = Field(default=None)
    scheduled_end: Optional[datetime] = Field(default=None)
    gross_minutes: int = Field(ge=0)
    deducted_minutes: int = Field(default=0, ge=0)
    net_minutes: int = Field(ge=0)
    variance_type: VarianceType = Field(default=VarianceType.ON_TIME)
    variance_minutes: int = Field(default=0)
    notes: Optional[str] = Field(default=None, max_length=2000)
    logged_date: date
    created_at: datetime = Field(default_factory=_utc_now)

    activity: Activity | None = Relationship(back_populates="sessions")


class DayOverride(SQLModel, table=True):
    __tablename__ = "day_overrides"

    id: Optional[int] = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, max_length=255)
    override_date: date = Field(index=True)
    mode: str = Field(max_length=64)
    reason: Optional[str] = Field(default=None, max_length=500)
