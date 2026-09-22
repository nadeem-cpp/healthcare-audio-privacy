# Path: utils/get_curr_user.py
"""
Purpose:
    Handles user authentication and authorization (RBAC).

What it does:
    - Provides a dependency to extract and validate JWT tokens from request headers.
    - Decodes JWTs and verifies user existence in the database.
    - Implements a role-guard factory to enforce specific role requirements on API endpoints.
    - Raises appropriate HTTP exceptions for authentication or authorization failures.
"""
from typing import Annotated

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import (
    Depends, 
    HTTPException, 
    status
)
from fastapi.security import (
    HTTPAuthorizationCredentials, 
    HTTPBearer
)
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from config import (
    AUTH_SECRET_KEY,
    AUTH_ALGORITHM,
)

from db.db import get_db_conn
from logging_config import logger
from bson.errors import InvalidId


# ---------------------------------------------------------------------------
# HTTP Bearer extractor (auto-returns 403 if header is missing)
# ---------------------------------------------------------------------------
_bearer = HTTPBearer(auto_error=True)


# ---------------------------------------------------------------------------
# Core dependency — verify token and return TokenData
# ---------------------------------------------------------------------------
async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
    
    """
    Extracts and validates the JWT from the Authorization: Bearer <token> header.
    Raises HTTP 401 on any authentication failure.
    """
    token = credentials.credentials

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, AUTH_SECRET_KEY, algorithms=[AUTH_ALGORITHM])

    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError:
        raise credentials_exception

    user_id: str | None = payload.get("id")
    if not user_id:
        raise credentials_exception

    try:
        user_id = ObjectId(user_id)
    except InvalidId:
        logger.warning("Invalid ObjectId in authentication token")
        raise credentials_exception

    db_conn = await get_db_conn()

    user = await db_conn["users"].find_one({"_id": ObjectId(user_id)},{})

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User does not exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    permissions = await db_conn["roles"].find_one({"role": user["role"]}, {"permissions": 1})
    user["permissions"] = permissions.get("permissions", [])

    return user


# ---------------------------------------------------------------------------
# Role-guard factory — call with one or more required roles
# ---------------------------------------------------------------------------
def require_roles(*roles):

    roles = set(roles)

    async def _check(user: dict = Depends(get_current_user)) -> dict:
        
        if not user["role"] in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access denied. Required role(s): "
                    f"{[roles]}."
                ),
            )
        return user

    return _check


def require_permission(permission: str):
    async def checker(_user: dict = Depends(get_current_user)) -> dict:
        if permission not in _user["permissions"]:
            raise HTTPException(
                status_code=403,
                detail="Current user not allowed to access this resource"
            )
        return _user
    return checker

