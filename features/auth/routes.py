# Path: features/auth/routes.py
"""
Purpose:
    Defines the API routes for authentication-related features.

What it does:
    - Sets up a FastAPI APIRouter for auth.
    - Defines POST /signin with a slowapi rate limit of 5 requests per minute.
    - Delegates login requests to login_api.
"""
from fastapi import APIRouter, Request

from models.auth import LoginUser, LoginResponse
from features.auth.v1.auth import login_api
from middlewares.limiter import limiter


router = APIRouter()


@router.post("/signin", response_model=LoginResponse)
@limiter.limit("5/minute")
async def auth(request: Request, payload: LoginUser):
    return await login_api(payload)
