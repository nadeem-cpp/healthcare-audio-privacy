# Path: modules/notification/__init__.py
"""
Purpose:
    Initializes the notification package and exports core classes.

What it does:
    - Exports Email and Notification for external consumers.
"""
from .email import Email
from .notification import Notification

__all__ = [
    "Email",
    "Notification"
]

