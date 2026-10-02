from __future__ import annotations

from datetime import date, datetime, time, timezone
from enum import Enum
from typing import Optional

from sqlalchemy.orm import relationship
from sqlmodel import Field, Relationship, SQLModel


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class VarianceType(str, Enum):
    ON_TIME = "ON_TIME"
    LATE_START = "LATE_START"
    EARLY_START = "EARLY_START"
    EARLY_EXIT = "EARLY_EXIT"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=320)
    hashed_password: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=_utc_now)


class UserProfile(SQLModel, table=True):
    __tablename__ = "user_profiles"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="users.id", index=True, unique=True)
    user_name: Optional[str] = Field(default=None, max_length=255)
    weekly_target_hours: float = Field(default=0.0)
    week_start_day: int = Field(default=1, ge=0, le=6)
    created_at: datetime = Field(default_factory=_utc_now)

    shift_rules: list["ShiftRule"] = Relationship(
        sa_relationship=relationship("ShiftRule", back_populates="profile")
    )
    activities: list["Activity"] = Relationship(
        sa_relationship=relationship("Activity", back_populates="profile")
    )


class ShiftRule(SQLModel, table=True):
    __tablename__ = "shift_rules"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(foreign_key="user_profiles.id", index=True)
    day_of_week: int = Field(default=0, ge=0, le=6)
    shift_number: int = Field(ge=1, le=4)
    name: str = Field(max_length=255)
    standard_start: time
    standard_end: time
    standard_break_minutes: int = Field(default=0, ge=0)
    slot_type: str = Field(default="productive", max_length=16)
    slot_start: Optional[time] = Field(default=None)
    slot_end: Optional[time] = Field(default=None)

    profile: Optional["UserProfile"] = Relationship(
        sa_relationship=relationship("UserProfile", back_populates="shift_rules")
    )


class Activity(SQLModel, table=True):
    __tablename__ = "activities"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(foreign_key="user_profiles.id", index=True)
    name: str = Field(index=True, max_length=255)
    weekly_target_hours: float = Field(default=0.0, ge=0.0)
    color: str = Field(default="#6366f1", max_length=32)

    profile: Optional["UserProfile"] = Relationship(
        sa_relationship=relationship("UserProfile", back_populates="activities")
    )
    sessions: list["SessionLog"] = Relationship(
        sa_relationship=relationship("SessionLog", back_populates="activity")
    )
    planned_shifts: list["PlannedShift"] = Relationship(
        sa_relationship=relationship("PlannedShift", back_populates="activity")
    )


class PlannedShift(SQLModel, table=True):
    __tablename__ = "planned_shifts"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    activity_id: int = Field(foreign_key="activities.id", index=True)
    title: str = Field(max_length=255)
    start_time: datetime
    end_time: datetime
    is_recurring: bool = Field(default=False)

    activity: Optional["Activity"] = Relationship(
        sa_relationship=relationship("Activity", back_populates="planned_shifts")
    )


class SessionLog(SQLModel, table=True):
    __tablename__ = "session_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    activity_id: int = Field(foreign_key="activities.id", index=True)
    shift_number: Optional[int] = Field(default=None, ge=1, le=4, index=True)
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
    break_overrun_minutes: int = Field(default=0, ge=0)
    notes: Optional[str] = Field(default=None, max_length=2000)
    logged_date: date
    created_at: datetime = Field(default_factory=_utc_now)

    activity: Optional["Activity"] = Relationship(
        sa_relationship=relationship("Activity", back_populates="sessions")
    )


