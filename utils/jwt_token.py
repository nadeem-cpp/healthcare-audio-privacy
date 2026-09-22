# Path: utils/jwt_token.py
"""
Purpose:
    Utility for generating JSON Web Tokens (JWT).

What it does:
    - Provides a function to create signed access tokens containing user data and an expiration time.
    - Utilizes configuration settings for the secret key, algorithm, and default expiration.
"""
import jwt
from datetime import (
    datetime, 
    timedelta, 
    timezone
)

try:
    from config import (
        AUTH_SECRET_KEY, 
        AUTH_ALGORITHM, 
        AUTH_ACCESS_TOKEN_EXPIRE_MINUTES
    )
except ImportError:
    # for single file run
    # root path of the project
    from pathlib import Path
    import sys
    
    project_root = Path().resolve()
    sys.path.append(str(project_root))
    
    from config import (
        AUTH_SECRET_KEY, 
        AUTH_ALGORITHM, 
        AUTH_ACCESS_TOKEN_EXPIRE_MINUTES
    )


async def create_access_token(data: dict, expires_delta: timedelta | None = None):

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=AUTH_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    data["exp"] = expire
    
    encoded_jwt = jwt.encode(
        data, 
        AUTH_SECRET_KEY, 
        algorithm=AUTH_ALGORITHM
    )
    return encoded_jwt


