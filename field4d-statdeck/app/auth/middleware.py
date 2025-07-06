from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from .cloud_auth_service import cloud_auth
from .models import User

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """
    Get current authenticated user from JWT token.
    
    Args:
        credentials: HTTP Bearer token credentials
        
    Returns:
        User object if valid token
        
    Raises:
        HTTPException: If invalid or missing token
    """
    token = credentials.credentials
    
    # Verify token using Cloud Function authentication
    user_data = cloud_auth.validate_token(token)
    if user_data is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create user object from token data
    return User(
        email=user_data["email"],
        created_at=None,  # Not available from token
        last_login=None   # Not available from token
    )

def require_auth():
    """
    Dependency for routes that require authentication.
    """
    return get_current_user 