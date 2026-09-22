# Path: features/auth/v1/auth.py
"""
Purpose:
    Acts as an entry point for authentication logic in version 1 of the API.

What it does:
    - Provides a 'login_api' function that delegates authentication requests to the underlying 'login' implementation.
"""
from features.auth.v1.login import login


async def login_api(payload):
    return await login(payload)


