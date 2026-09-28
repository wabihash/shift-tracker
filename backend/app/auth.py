from __future__ import annotations

import os
from typing import Annotated

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError

load_dotenv()

_DEFAULT_CLERK_ISSUER = ""

security = HTTPBearer(auto_error=False)

_clerk_issuer_raw = os.getenv("CLERK_ISSUER", _DEFAULT_CLERK_ISSUER)
CLERK_ISSUER = _clerk_issuer_raw.rstrip("/")
JWKS_URL = f"{CLERK_ISSUER}/.well-known/jwks.json" if CLERK_ISSUER else ""

_jwks_client: PyJWKClient | None = (
    PyJWKClient(JWKS_URL, cache_keys=True) if CLERK_ISSUER else None
)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Missing or invalid authorization header")

    if _jwks_client is None or not CLERK_ISSUER:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication is not configured",
        )

    token = credentials.credentials
    if not token:
        raise _unauthorized("Missing bearer token")

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            options={"require": ["sub", "exp", "iss"]},
        )
    except PyJWTError as exc:
        raise _unauthorized("Invalid or expired token") from exc

    clerk_user_id = payload.get("sub")
    if not isinstance(clerk_user_id, str) or not clerk_user_id.strip():
        raise _unauthorized("Token subject is missing or invalid")

    request.state.user_id = clerk_user_id
    from app.monitoring import set_current_user_id

    set_current_user_id(clerk_user_id)
    return clerk_user_id
