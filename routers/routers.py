# Path: routers/routers.py
"""
Purpose:
    Aggregates and organizes the main API routers for all features.

What it does:
    - Includes routers for auth, participants, users, meetings, signals, and ClickUp features.
    - Assigns the '/api/v1' path prefix and corresponding tags to each feature router.
"""
from fastapi import APIRouter
from features.auth.routes import router as auth_router


api_router = APIRouter()


api_router.include_router(auth_router,  prefix="/auth",  tags=["Auth"])
