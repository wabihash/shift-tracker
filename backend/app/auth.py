"""Backward-compatible import path for the first-party JWT auth dependency."""

from app.core.auth import create_access_token, get_current_user, hash_password, verify_password

__all__ = ["create_access_token", "get_current_user", "hash_password", "verify_password"]
