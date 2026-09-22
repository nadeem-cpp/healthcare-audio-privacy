# Path: features/auth/v1/login.py
"""
Purpose:
    Implements the core login logic for user authentication.

What it does:
    - Retrieves user and role information from the database based on email and company name.
    - Verifies the provided password against the stored hash.
    - Generates a JWT access token upon successful authentication.
    - Fetches and includes user roles associated with their role.
    - Returns a structured response containing the token, roles, and user details.
"""
import traceback
from db.db import get_db_conn
from db.collections import DBCollection
from logging_config import logger
from models.auth import LoginUser
from core.security import pwd_context
from utils.jwt_token import create_access_token
from fastapi.responses import JSONResponse


async def login(payload: LoginUser):
    logger.info(f"loging in the user {payload.email}")
    try:
        db_conn = await get_db_conn()
        user_collection = DBCollection.USERS(db_conn)

        user = await user_collection.find_one(
            {
                "email": payload.email.lower()
            },
            {}
        )

        if not user:
            logger.warning(f"User not found: {payload.email}")
            return JSONResponse(
                status_code=400,
                content={"message": "Invalid email or password"}
            )

        if pwd_context.verify(payload.password, user['password']):
            token_data = {
                "email": payload.email,
                "id": str(user["_id"]),
                "role": user["role"]
            }
            token = await create_access_token(token_data)
            return JSONResponse(
                status_code=200,
                content={"access_token": token}
            )

        return JSONResponse(
            status_code=400,
            content={"message": "Invalid email or password"}
        )
    

    except Exception as e:
        logger.error(f"Error: {e}\n{traceback.format_exc()}")

        return JSONResponse(
            status_code=500,
            content={"message": "Internal server error"}
        )