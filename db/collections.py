# Path: db/collections.py
"""
Purpose:
    Enumerates MongoDB collection names used across the application.

What it does:
    - Defines DBCollection enum values mapped to collection name strings.
    - Callable enum members return the matching AsyncCollection from a database.
"""
from enum import Enum
from pymongo.asynchronous.database import (
    AsyncDatabase,
    AsyncCollection
)


class DBCollection(Enum):
    USERS = "users"
 

    def __call__(self, db_conn: AsyncDatabase) -> AsyncCollection:
        return db_conn[self.value]
