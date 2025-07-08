from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class LoginRequest(BaseModel):
    """Login request model."""
    email: EmailStr
    password: str

class User(BaseModel):
    """User data model."""
    email: str
    created_at: Optional[str] = None  # Changed to str to match Cloud Function response
    last_login: Optional[str] = None   # Changed to str to match Cloud Function response

class LoginResponse(BaseModel):
    """Login response model."""
    success: bool
    token: Optional[str] = None
    user: Optional[User] = None
    error: Optional[str] = None

class TokenData(BaseModel):
    """Token payload data."""
    email: str
    exp: Optional[int] = None 