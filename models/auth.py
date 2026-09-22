# Path: models/auth.py
"""
Purpose:
    Defines data models for authentication-related operations.

What it does:
    - Provides a 'LoginUser' Pydantic model for validating login request payloads.
"""
from pydantic import (
    BaseModel,
    EmailStr,
    Field,
)


class LoginUser(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)


class LoginResponse(BaseModel):
    access_token: str
    

