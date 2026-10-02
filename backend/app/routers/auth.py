from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db import get_session
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["authentication"])


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("A valid email address is required")
        return normalized


class UserResponse(BaseModel):
    id: int
    email: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: Credentials, session: Annotated[Session, Depends(get_session)]) -> AuthResponse:
    email = body.email
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    user = User(email=email, hashed_password=hash_password(body.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists") from exc
    session.refresh(user)
    return AuthResponse(access_token=create_access_token({"sub": str(user.id)}), user=UserResponse(id=user.id, email=user.email))


@router.post("/login", response_model=AuthResponse)
def login(body: Credentials, session: Annotated[Session, Depends(get_session)]) -> AuthResponse:
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect", headers={"WWW-Authenticate": "Bearer"})
    return AuthResponse(access_token=create_access_token({"sub": str(user.id)}), user=UserResponse(id=user.id, email=user.email))


@router.get("/me", response_model=UserResponse)
def me(user_id: Annotated[int, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> UserResponse:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return UserResponse(id=user.id, email=user.email)
