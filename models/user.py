# Path: models/user.py
"""
Purpose:
    Defines data models and enums for user management.

What it does:
    - Provides a 'Role' Enum for user roles (owner, manager, user).
    - Defines base, create, and update Pydantic models for user data.
    - Includes custom serializers to automatically handle 'created_at' and 'updated_at' timestamps during model serialization.
"""
from time import time

from pydantic import (
    BaseModel,
    EmailStr,
    Field,
    model_serializer
)


class UserBase(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)


class CreateUser(UserBase):
    pass

    @model_serializer(mode="wrap")
    def serialize(self, handler) -> dict:
        data = handler(self)
        data["created_at"] = int(time() * 1000)  # Append created_at at model dump
        return data


