# Path: core/security.py
"""
Purpose:
    Provides security-related utilities, specifically for password hashing.

What it does:
    - Initializes a passlib CryptContext using the bcrypt algorithm.
    - Provides a reusable 'pwd_context' for hashing and verifying passwords.
"""
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
